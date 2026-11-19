// the place of a copy made by a paste or by Duplicate, 20 px down and to the right past its source
// and every older copy, on the slide of its source and on another slide

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { click, clickText, editorPage, press, saveAndReopen, type } from './helpers/editor.mjs';

// regression tests of R31.1 on both platforms: a paste on a slide without its sources is put at the
// place of the sources, moved in steps of 20 px to the first place that a copy of the clipboard on
// this slide does not take now. a paste after a paste on a third slide and back, and two pastes
// after the first copy was moved, do not land on an older copy, here or on the slide of the sources.
// each paste is one entry of the history, and an undo, a redo, and a save are byte for byte
describe('a paste on a slide without its sources', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test/pages/editor-r31-1.html';
  const SOURCE = readFileSync(DECK, 'utf8');
  const [FROM, TARGET, THIRD] = [0, 1, 2];
  const MOD = { mac: 4, other: 2 };

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
  const undo = async (page) => {
    await page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
    await frames(page);
  };
  const redo = async (page) => {
    await page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
    await frames(page);
  };
  const undoLabel = (page) => page.evaluate('window.BeesonEditor.state("edit.undo").label');

  // for each copied kind, the selector of its elements, the selector clicked to select it, and its
  // offsets moved by d px diagonally and e px down, two of them for the two shapes of the group
  const KINDS = {
    shape: { all: ':scope > .shape:not([data-group])', pick: ':scope > .shape:not([data-group]) p', of: (d, e = 0) => [`${1200 + d}px ${300 + d + e}px`] },
    group: { all: ':scope > .shape[data-group]', pick: ':scope > .shape[data-group]', of: (d, e = 0) => [`${200 + d}px ${650 + d + e}px`, `${400 + d}px ${650 + d + e}px`] },
    line: { all: ':scope > svg.line', pick: ':scope > svg.line > line', of: (d, e = 0) => [`${1200 + d}px ${700 + d + e}px`] },
  };

  async function load(t, platform, what) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(SOURCE)})`)).problems, []);
    await page.send('Page.bringToFront');
    await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
    await page.evaluate(`Reveal.slide(${FROM})`);
    await sleep(150);
    const kind = KINDS[what];
    // copy and paste as trusted keys that carry the editing commands of the browser
    const key = async (k, code, kc, cmd) => {
      const e = { key: k, code, windowsVirtualKeyCode: kc, modifiers: MOD[platform] };
      await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...e, commands: [cmd] });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...e });
      await sleep(400);
      await frames(page);
    };
    return {
      page,
      copy: async () => {
        const at = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(${js(kind.pick)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await click(page, at);
        await frames(page);
        assert.equal((await page.evaluate('window.BeesonEditor.selection()')).length, what === 'group' ? 2 : 1);
        await key('c', 'KeyC', 67, 'copy');
      },
      paste: () => key('v', 'KeyV', 86, 'paste'),
      go: async (n) => {
        await page.evaluate(`Reveal.slide(${n})`);
        await frames(page);
        await sleep(200);
      },
      // the offsets of the copied kind on the current slide, in the order of the file
      places: () => page.evaluate(`[...Reveal.getCurrentSlide().querySelectorAll(${js(kind.all)})].map((e) => e.style.translate)`),
      // the selection moved 50 px down by five nudges of the arrow key
      nudge: async () => {
        for (let i = 0; i < 5; i++) await press(page, 'Shift+ArrowDown');
        await sleep(1100);
        await frames(page);
      },
      of: (...ds) => ds.flatMap((d) => (Array.isArray(d) ? kind.of(...d) : kind.of(d))),
    };
  }

  // a point in slide px of the first source of each kind that a copy 20 px further does not cover
  const corner = (what) => ({ shape: [1205, 305], group: [205, 655], line: [1205, 700] })[what];

  const twice = (list) => list.filter((x, i) => list.indexOf(x) !== i);
  // the offsets in a fixed order, since on the slide of the sources each copy follows its own source
  const sorted = (list) => [...list].sort();

  for (const platform of PLATFORMS) {
    for (const what of ['shape', 'group', 'line']) {
      // item 1, the steps of the skeptic: three pastes on Target, one on Third, and one on Target
      // again, which is put at 60 px rather than on the first copy at the place of the source
      test(`1: a ${what} pasted after a paste on a third slide and back is put after the older copies (${platform})`, async (t) => {
        const { page, copy, paste, go, places, of } = await load(t, platform, what);
        await copy();
        await go(TARGET);
        await paste();
        await paste();
        await paste();
        assert.deepEqual(await places(), of(0, 20, 40), 'the three pastes of R28.1 are not at 0, 20, and 40 px');
        await go(THIRD);
        await paste();
        assert.deepEqual(await places(), of(0), 'the first paste on a third slide is not at the place of the source');
        await go(TARGET);
        const before = await render(page);
        await paste();
        const p = await places();
        assert.deepEqual(twice(p), [], `a paste after a paste on Third and back lands on an older copy: ${js(p)}`);
        assert.deepEqual(p, of(0, 20, 40, 60));
        const pasted = await render(page);
        assert.equal(await undoLabel(page), 'Undo Paste');
        await undo(page);
        assert.equal(await render(page), before, 'one undo does not give the file back before the paste');
        await redo(page);
        assert.equal(await render(page), pasted);
        // an undone copy does not take a place
        await undo(page);
        await paste();
        assert.equal(await render(page), pasted, 'a paste after an undo is not put where the undone copy was');
        const { text } = await saveAndReopen(page);
        assert.equal(text, pasted, 'the save differs from the text');
        assert.deepEqual(errors(page), []);
      });

      // item 2: the first copy on Target moved 50 px down, then two pastes, which are put at the place
      // of the source, now free, and 20 px further
      test(`2: a ${what} pasted twice after the first copy was moved is put on two places (${platform})`, async (t) => {
        const { page, copy, paste, go, places, nudge, of } = await load(t, platform, what);
        await copy();
        await go(TARGET);
        await paste();
        await nudge();
        assert.deepEqual(await places(), of([0, 50]));
        await paste();
        const one = await render(page);
        await paste();
        const p = await places();
        assert.deepEqual(twice(p), [], `two pastes after the first copy was moved land on one place: ${js(p)}`);
        assert.deepEqual(p, of([0, 50], 0, 20));
        const two = await render(page);
        assert.equal(await undoLabel(page), 'Undo Paste');
        await undo(page);
        assert.equal(await render(page), one, 'one undo does not give the file back before the paste');
        await redo(page);
        assert.equal(await render(page), two);
        // a deleted copy does not take a place, hence the paste after the delete is put where it was
        await press(page, 'Delete');
        await sleep(300);
        assert.deepEqual(await places(), of([0, 50], 0));
        await paste();
        assert.deepEqual(await places(), of([0, 50], 0, 20), 'a paste after a delete is not put where the deleted copy was');
        const last = await render(page);
        const { text } = await saveAndReopen(page);
        assert.equal(text, last, 'the save differs from the text');
        assert.deepEqual(errors(page), []);
      });

      // item 3, the case of the skeptic: a paste on the slide of the sources, then a delete of the
      // sources, which makes it a slide without them, and two pastes, which are put at 0 and 40 px
      // rather than on the copy at 20 px
      test(`3: a ${what} pasted twice after its sources were deleted is not put on the copy pasted before the delete (${platform})`, async (t) => {
        const { page, copy, paste, places, of } = await load(t, platform, what);
        await copy();
        await paste();
        assert.deepEqual(sorted(await places()), sorted(of(0, 20)));
        const at = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); const r = s.getBoundingClientRect(); const k = r.width / s.offsetWidth; const [x, y] = ${js(corner(what))}; return { x: r.left + x * k, y: r.top + y * k }; })()`);
        await click(page, at);
        await frames(page);
        assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((e) => e.style.translate)'), of(0));
        await press(page, 'Delete');
        await sleep(300);
        assert.deepEqual(await places(), of(20));
        await paste();
        const one = await render(page);
        await paste();
        const p = await places();
        assert.deepEqual(twice(p), [], `two pastes after the sources were deleted land on an older copy: ${js(p)}`);
        assert.deepEqual(sorted(p), sorted(of(20, 0, 40)));
        const two = await render(page);
        assert.equal(await undoLabel(page), 'Undo Paste');
        await undo(page);
        assert.equal(await render(page), one, 'one undo does not give the file back before the paste');
        await redo(page);
        assert.equal(await render(page), two);
        const { text } = await saveAndReopen(page);
        assert.equal(text, two, 'the save differs from the text');
        assert.deepEqual(errors(page), []);
      });

      // item 4: the same two cases on the slide of the sources, where a paste is put 20 px further
      // than the paste before it
      test(`4: a ${what} pasted on its own slide after a paste on another slide, and after a copy was moved, is not put on an older copy (${platform})`, async (t) => {
        const { page, copy, paste, go, places, nudge, of } = await load(t, platform, what);
        await copy();
        await paste();
        assert.deepEqual(sorted(await places()), sorted(of(0, 20)));
        await go(TARGET);
        await paste();
        await go(FROM);
        await paste();
        let p = await places();
        assert.deepEqual(twice(p), [], `a paste on the slide of the source after a paste on Target and back lands on an older copy: ${js(p)}`);
        assert.deepEqual(sorted(p), sorted(of(0, 20, 40)));
        await nudge();
        await paste();
        await paste();
        p = await places();
        assert.deepEqual(twice(p), [], `two pastes on the slide of the source after a copy was moved land on one place: ${js(p)}`);
        assert.deepEqual(sorted(p), sorted(of(0, 20, [40, 50], 60, 80)));
        const last = await render(page);
        const { text } = await saveAndReopen(page);
        assert.equal(text, last, 'the save differs from the text');
        assert.deepEqual(errors(page), []);
      });
    }
  }
});

// regression tests of R33.1 on both platforms: a paste on the slide of its sources starts at the
// step of today, own.pasted + 1 steps where it covers its source and none where it does not, and is
// moved on in steps of 20 px to the first place that a source or a copy of the clipboard on this
// slide does not take now. two pastes after the source was moved, and a paste after a copy was moved
// onto the next place, do not land on an older copy. a duplicate of an element is moved on in the
// same way past the element and its older duplicates, also where it is a figure in the flow of the
// slide. each paste and each duplicate is one entry of the history, and an undo, a redo, and a save
// are byte for byte
describe('a paste on the slide of its sources', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test/pages/editor-r31-1.html';
  // the deck of a QR code in the flow of the slide, moved by a translate
  const FLOW = 'test/pages/editor-r33-1.html';
  const [FROM, TARGET] = [0, 1];
  const MOD = { mac: 4, other: 2 };

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
  const undo = async (page) => {
    await page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
    await frames(page);
  };
  const redo = async (page) => {
    await page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
    await frames(page);
  };
  const undoLabel = (page) => page.evaluate('window.BeesonEditor.state("edit.undo").label');

  // for each copied kind, the selector of its elements, the selector clicked to select it, a point in
  // slide px of its first source that a copy 20 px further does not cover, and its offsets moved by d
  // px diagonally and e px down, two of them for the two shapes of the group
  const KINDS = {
    shape: { all: ':scope > .shape:not([data-group])', pick: ':scope > .shape:not([data-group]) p', at: [1205, 305], of: (d, e = 0) => [`${1200 + d}px ${300 + d + e}px`] },
    group: { all: ':scope > .shape[data-group]', pick: ':scope > .shape[data-group]', at: [205, 655], of: (d, e = 0) => [`${200 + d}px ${650 + d + e}px`, `${400 + d}px ${650 + d + e}px`] },
    line: { all: ':scope > svg.line', pick: ':scope > svg.line > line', at: [1205, 700], of: (d, e = 0) => [`${1200 + d}px ${700 + d + e}px`] },
    qr: { deck: FLOW, all: ':scope > .qr', at: [1425, 640], of: (d, e = 0) => [`${1300 + d}px ${160 + d + e}px`] },
  };

  async function load(t, platform, what) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const deck = KINDS[what].deck ?? DECK;
    const url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(readFileSync(deck, 'utf8'))})`)).problems, []);
    await page.send('Page.bringToFront');
    await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
    await page.evaluate(`Reveal.slide(${FROM})`);
    await sleep(150);
    const kind = KINDS[what];
    // copy and paste as trusted keys that carry the editing commands of the browser
    const key = async (k, code, kc, cmd) => {
      const e = { key: k, code, windowsVirtualKeyCode: kc, modifiers: MOD[platform] };
      await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...e, commands: [cmd] });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...e });
      await sleep(400);
      await frames(page);
    };
    // a click on the corner of the first source moved by d px diagonally, which selects the element
    // at this place
    const pick = async (d = 0) => {
      const at = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); const r = s.getBoundingClientRect(); const k = r.width / s.offsetWidth; const [x, y] = ${js(kind.at)}; return { x: r.left + (x + ${d}) * k, y: r.top + (y + ${d}) * k }; })()`);
      await click(page, at);
      await frames(page);
      assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((e) => e.style.translate)'), kind.of(d), `the click at ${d} px does not select the element there`);
    };
    // the selection nudged by 10 px for each arrow key of keys
    const nudge = async (keys) => {
      for (const k of keys) await press(page, `Shift+${k}`);
      await sleep(1100);
      await frames(page);
    };
    return {
      page,
      copy: async () => {
        await pick(0);
        await key('c', 'KeyC', 67, 'copy');
      },
      paste: () => key('v', 'KeyV', 86, 'paste'),
      duplicate: async () => {
        await press(page, 'Mod+D');
        await sleep(300);
        await frames(page);
      },
      pick,
      go: async (n) => {
        await page.evaluate(`Reveal.slide(${n})`);
        await frames(page);
        await sleep(200);
      },
      // the offsets of the copied kind on the current slide, sorted, since each copy of a group
      // follows its own source in the file
      places: async () => (await page.evaluate(`[...Reveal.getCurrentSlide().querySelectorAll(${js(kind.all)})].map((e) => e.style.translate)`)).sort(),
      // the drawn places of the copied kind on the current slide in slide px, in the order of the file
      boxes: () => page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); const r = s.getBoundingClientRect(); const k = r.width / s.offsetWidth; return [...Reveal.getCurrentSlide().querySelectorAll(${js(kind.all)})].map((e) => { const b = e.getBoundingClientRect(); return [b.left - r.left, b.top - r.top].map((v) => Math.round(v / k)); }); })()`),
      down: () => nudge(Array(5).fill('ArrowDown')),
      onto: () => nudge(['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown']),
      of: (...ds) => ds.flatMap((d) => (Array.isArray(d) ? kind.of(...d) : kind.of(d))).sort(),
    };
  }

  const twice = (list) => list.filter((x, i) => list.indexOf(x) !== i);

  // asserts that the last action, labeled label, is one entry of the history from the text before,
  // that an undo and a redo and a save and a reopen are byte for byte, and that the page logged no error
  async function entry(page, before, label) {
    const done = await render(page);
    assert.equal(await undoLabel(page), `Undo ${label}`);
    await undo(page);
    assert.equal(await render(page), before, `one undo does not give the file back before the ${label}`);
    await redo(page);
    assert.equal(await render(page), done);
    const { text } = await saveAndReopen(page);
    assert.equal(text, done, 'the save differs from the text');
    assert.deepEqual(errors(page), []);
  }

  for (const platform of PLATFORMS) {
    for (const what of ['shape', 'group', 'line']) {
      // item 1, the case sourceMoved of the first skeptic: the source moved 50 px down after the
      // copy, then two pastes, which do not cover it. the first is at the place of the copy, and the
      // second 20 px further rather than on the first
      test(`1: a ${what} pasted twice on its own slide after the source was moved is put on two places (${platform})`, async (t) => {
        const { page, copy, paste, places, down, of } = await load(t, platform, what);
        await copy();
        await down();
        assert.deepEqual(await places(), of([0, 50]));
        await paste();
        const one = await render(page);
        await paste();
        const p = await places();
        assert.deepEqual(twice(p), [], `two pastes after the source was moved land on one place: ${js(p)}`);
        assert.deepEqual(p, of([0, 50], 0, 20));
        await entry(page, one, 'Paste');
      });

      // item 2, the case ownCopyMovedOnto of the second skeptic: the copy at 20 px moved onto 40 px,
      // then two pastes, which start at 40 and 60 px as today and are moved on past the moved copy
      test(`2: a ${what} pasted on its own slide after the copy was moved onto the next place is not put on it (${platform})`, async (t) => {
        const { page, copy, paste, places, onto, of } = await load(t, platform, what);
        await copy();
        await paste();
        assert.deepEqual(await places(), of(0, 20));
        await onto();
        assert.deepEqual(await places(), of(0, 40));
        await paste();
        let p = await places();
        assert.deepEqual(twice(p), [], `a paste after the copy was moved onto 40 px lands on it: ${js(p)}`);
        assert.deepEqual(p, of(0, 40, 60));
        const one = await render(page);
        await paste();
        p = await places();
        assert.deepEqual(twice(p), [], `a second paste after the copy was moved onto 40 px lands on an older copy: ${js(p)}`);
        assert.deepEqual(p, of(0, 40, 60, 80));
        await entry(page, one, 'Paste');
      });

      // item 2, the case ownAwayAndMoved of the second skeptic: two pastes, the copy at 40 px moved
      // onto 60 px, a paste on Target, and a paste back on the slide of the sources
      test(`2: a ${what} pasted on its own slide after a paste on another slide and a copy moved onto the next place is not put on it (${platform})`, async (t) => {
        const { page, copy, paste, go, places, onto, of } = await load(t, platform, what);
        await copy();
        await paste();
        await paste();
        await onto();
        assert.deepEqual(await places(), of(0, 20, 60));
        await go(TARGET);
        await paste();
        await go(FROM);
        const before = await render(page);
        await paste();
        const p = await places();
        assert.deepEqual(twice(p), [], `a paste after Target and back lands on the copy moved onto 60 px: ${js(p)}`);
        assert.deepEqual(p, of(0, 20, 60, 80));
        await entry(page, before, 'Paste');
      });

      // item 3: the places of today stay, i.e. 20, 40, and 60 px for three pastes, and the gap of
      // 20 px after an undone paste
      test(`3: a ${what} pasted on its own slide keeps the places of today (${platform})`, async (t) => {
        const { page, copy, paste, places, of } = await load(t, platform, what);
        await copy();
        await paste();
        await paste();
        await paste();
        assert.deepEqual(await places(), of(0, 20, 40, 60));
        await undo(page);
        const before = await render(page);
        await paste();
        assert.deepEqual(await places(), of(0, 20, 40, 80), 'the gap of 20 px after an undone paste is not kept');
        await entry(page, before, 'Paste');
      });

      // item 4: the element duplicated, selected again, and duplicated, which puts the second
      // duplicate past the first rather than on it
      test(`4: a ${what} duplicated twice from the same element is put on two places (${platform})`, async (t) => {
        const { page, pick, duplicate, places, of } = await load(t, platform, what);
        await pick(0);
        await duplicate();
        assert.deepEqual(await places(), of(0, 20));
        await pick(0);
        const before = await render(page);
        await duplicate();
        const p = await places();
        assert.deepEqual(twice(p), [], `a second duplicate of the element lands on the first: ${js(p)}`);
        assert.deepEqual(p, of(0, 20, 40));
        await entry(page, before, 'Duplicate');
      });

      // item 4: the older duplicate moved onto 40 px, then the element duplicated twice, which takes
      // 20 px and then moves past the moved duplicate to 60 px
      test(`4: a ${what} duplicated after its older duplicate was moved onto the next place is not put on it (${platform})`, async (t) => {
        const { page, pick, duplicate, places, onto, of } = await load(t, platform, what);
        await pick(0);
        await duplicate();
        await onto();
        assert.deepEqual(await places(), of(0, 40));
        await pick(0);
        await duplicate();
        assert.deepEqual(await places(), of(0, 20, 40));
        await pick(0);
        const before = await render(page);
        await duplicate();
        const p = await places();
        assert.deepEqual(twice(p), [], `a duplicate after the older one was moved onto 40 px lands on an older duplicate: ${js(p)}`);
        assert.deepEqual(p, of(0, 20, 40, 60));
        await entry(page, before, 'Duplicate');
      });

      // item 4: the first duplicate duplicated onto 40 px, then the first duplicate duplicated again,
      // which is put past the duplicate at 40 px
      test(`4: a ${what} duplicated from an older duplicate is not put on the duplicate of it (${platform})`, async (t) => {
        const { page, pick, duplicate, places, of } = await load(t, platform, what);
        await pick(0);
        await duplicate();
        await duplicate();
        assert.deepEqual(await places(), of(0, 20, 40));
        await pick(20);
        const before = await render(page);
        await duplicate();
        const p = await places();
        assert.deepEqual(twice(p), [], `a duplicate of the first duplicate lands on the duplicate of it: ${js(p)}`);
        assert.deepEqual(p, of(0, 20, 40, 60));
        await entry(page, before, 'Duplicate');
      });

      // item 4: two duplicates after the element was moved, which follow the moved element
      test(`4: a ${what} duplicated twice after it was moved is put on two places (${platform})`, async (t) => {
        const { page, pick, duplicate, places, down, of } = await load(t, platform, what);
        await pick(0);
        await down();
        await duplicate();
        const before = await render(page);
        await duplicate();
        const p = await places();
        assert.deepEqual(twice(p), [], `two duplicates after the element was moved land on one place: ${js(p)}`);
        assert.deepEqual(p, of([0, 50], [20, 50], [40, 50]));
        await entry(page, before, 'Duplicate');
      });
    }

    // item 4, the case dupQrTwice of the skeptic of R33.1: a duplicate of a QR code in the flow is
    // drawn 20 px off it, and a second duplicate is moved on 20 px past the first rather than on it
    test(`4: a QR code in the flow duplicated twice from the same element is put on two places (${platform})`, async (t) => {
      const { page, pick, duplicate, boxes } = await load(t, platform, 'qr');
      const [[x, y]] = await boxes();
      await pick(0);
      await duplicate();
      assert.deepEqual(await boxes(), [[x, y], [x + 20, y + 20]]);
      await pick(0);
      const before = await render(page);
      await duplicate();
      const p = await boxes();
      assert.deepEqual(twice(p.map(js)), [], `a second duplicate of the QR code lands on the first: ${js(p)}`);
      assert.deepEqual(p, [[x, y], [x + 40, y + 40], [x + 20, y + 20]]);
      await entry(page, before, 'Duplicate');
    });

    // item 4, the case dupQrMoved of the same skeptic: the duplicate moved 20 px on, then the QR code
    // duplicated twice, which takes the free place 20 px off it and then moves past both older
    // duplicates
    test(`4: a QR code in the flow duplicated after its older duplicate was moved onto the next place is not put on it (${platform})`, async (t) => {
      const { page, pick, duplicate, boxes, onto } = await load(t, platform, 'qr');
      const [[x, y]] = await boxes();
      await pick(0);
      await duplicate();
      await onto();
      await pick(0);
      await duplicate();
      assert.deepEqual(await boxes(), [[x, y], [x + 20, y + 20], [x + 40, y + 40]]);
      await pick(0);
      const before = await render(page);
      await duplicate();
      const p = await boxes();
      assert.deepEqual(twice(p.map(js)), [], `a duplicate of the QR code after the older one was moved lands on an older duplicate: ${js(p)}`);
      assert.deepEqual(p, [[x, y], [x + 60, y + 60], [x + 20, y + 20], [x + 40, y + 40]]);
      await entry(page, before, 'Duplicate');
    });
  }
});

// regression tests of R35.3 on both platforms. the row Flip Horizontal and Flip Vertical of the
// Arrange pane follows the picture of the selected figure while the pane is kept, i.e. at a flip of
// the mode and at an undo or a redo of Shown in Dark, as in a pane built fresh for the same figure.
// a paste of a QR code in the flow of the slide of its source is put after the last copy that is
// still in the slide, and a paste drawn on a source or a copy is moved on in steps of 20 px, also
// after a paste was undone or deleted and after a copy was nudged onto the next place of the flow.
// each paste is one entry of the history, and an undo, a redo, and a save are byte for byte
describe('the Flip row following the picture shown', () => {
  const PLATFORMS = ['mac', 'other'];
  const MOD = { mac: 4, other: 2 };

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
  const exec = (page, id) => page.evaluate(`window.BeesonEditor.exec(${js(id)}).then(() => true)`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const undoLabel = (page) => page.evaluate('window.BeesonEditor.state("edit.undo").label');
  const undo = async (page) => {
    await page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
    await frames(page);
  };
  const redo = async (page) => {
    await page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
    await frames(page);
  };

  // item 1: the figure of one image on slide 2 of the deck, shown in both modes until Shown in Dark
  const FIGURE = 'test/pages/editor-figure.html';
  const IMG = 'section.present figure img';

  async function figurePage(t, platform) {
    const page = await editorPage(browser, { deck: FIGURE, query: `edit&still&edit-platform=${platform}`, page: { width: 1600, height: 1000 }, clear: true });
    t.after(() => page.close().catch(() => {}));
    if (!(await page.evaluate(`window.BeesonEditor.state('shell.format').checked`))) await exec(page, 'shell.format');
    await page.evaluate('Reveal.slide(1)');
    await frames(page);
    return page;
  }

  // the shown pane of the Format tab, the headings of its shown sections, and the commands of its
  // shown controls
  const PANE = `(() => {
  const root = document.querySelector('#beeson-edit-panel-format .ed-panes');
  const shown = (el) => !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
  return {
    pane: root?.dataset.pane ?? null,
    sections: [...(root?.querySelectorAll('.ed-sec') ?? [])].filter(shown).map((s) => s.querySelector(':scope > h5')?.textContent ?? ''),
    commands: [...(root?.querySelectorAll('[data-command]') ?? [])].filter(shown).map((b) => b.dataset.command),
  };
})()`;
  const pane = async (page) => {
    await frames(page);
    return page.evaluate(PANE);
  };
  // the same after the Format tab is built again for the same selection
  const fresh = async (page) => {
    await exec(page, 'shell.format');
    await exec(page, 'shell.format');
    return pane(page);
  };
  const flips = (p) => p.commands.filter((c) => c.startsWith('arrange.flip'));
  const FLIPS = ['arrange.flipHorizontal', 'arrange.flipVertical'];
  const shown = (page) => page.evaluate(`document.querySelector(${js(IMG)}).getBoundingClientRect().width > 0`);
  const arrangeTab = async (page) => {
    await click(page, '#beeson-edit-panel-format .ed-tabs button:nth-child(2)');
    await frames(page);
    assert.equal((await pane(page)).pane, 'arrange');
  };
  const shownInDark = async (page) => {
    await click(page, '#beeson-edit-panel-format button[data-command="figure.mode.dark"]');
    await sleep(150);
    await frames(page);
  };
  const flipMode = async (page) => {
    await press(page, 'D');
    await sleep(150);
    await frames(page);
  };

  // asserts that the kept pane is the pane built fresh, with the row Flip when the image is shown
  async function followed(page, image, what) {
    assert.equal(await shown(page), image, `the image is not ${image ? 'shown' : 'hidden'} ${what}`);
    const kept = await pane(page);
    assert.equal(kept.pane, 'arrange');
    assert.deepEqual(flips(kept), image ? FLIPS : [], `the row Flip of the kept Arrange pane does not follow the image ${what}: ${js(kept.commands)}`);
    assert.deepEqual(kept, await fresh(page), `the kept Arrange pane is not the pane built fresh ${what}`);
  }

  for (const platform of PLATFORMS) {
    test(`1: the row Flip of the Arrange pane is shown once a flip of the mode shows the image (${platform})`, async (t) => {
      const page = await figurePage(t, platform);
      await click(page, IMG);
      await frames(page);
      await shownInDark(page);
      await flipMode(page);
      await arrangeTab(page);
      await followed(page, false, 'in light mode after Shown in Dark');
      await flipMode(page);
      await followed(page, true, 'after the flip back to dark mode');
      // the button of the kept row flips the image
      await click(page, '#beeson-edit-panel-format button[data-command="arrange.flipHorizontal"]');
      await frames(page);
      assert.equal(await undoLabel(page), 'Undo Flip Horizontal');
      assert.deepEqual(errors(page), []);
    });

    test(`1: the row Flip of the Arrange pane follows an undo and a redo of Shown in Dark (${platform})`, async (t) => {
      const page = await figurePage(t, platform);
      await flipMode(page);
      await click(page, IMG);
      await frames(page);
      await shownInDark(page);
      await arrangeTab(page);
      await followed(page, false, 'in light mode after Shown in Dark');
      await press(page, 'Mod+Z');
      await sleep(200);
      await followed(page, true, 'after the undo of Shown in Dark');
      await press(page, 'Mod+Shift+Z');
      await sleep(200);
      await followed(page, false, 'after the redo of Shown in Dark');
      assert.deepEqual(errors(page), []);
    });

    test(`1: the row Flip of the Arrange pane is hidden once a flip of the mode hides the image (${platform})`, async (t) => {
      const page = await figurePage(t, platform);
      await click(page, IMG);
      await frames(page);
      await shownInDark(page);
      await arrangeTab(page);
      await followed(page, true, 'in dark mode after Shown in Dark');
      await flipMode(page);
      await followed(page, false, 'after the flip to light mode');
      assert.deepEqual(errors(page), []);
    });
  }

  // item 2: the deck of a QR code of 160 px in the flow of the slide, moved by a translate
  const FLOW = 'test/pages/editor-r33-1.html';

  async function load(t, platform) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${FLOW}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(readFileSync(FLOW, 'utf8'))})`)).problems, []);
    await page.send('Page.bringToFront');
    await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
    await page.evaluate('Reveal.slide(0)');
    await sleep(150);
    // copy and paste as trusted keys that carry the editing commands of the browser
    const key = async (k, code, kc, cmd) => {
      const e = { key: k, code, windowsVirtualKeyCode: kc, modifiers: MOD[platform] };
      await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...e, commands: [cmd] });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...e });
      await sleep(400);
      await frames(page);
    };
    const at = (x, y) => page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); const r = s.getBoundingClientRect(); const k = r.width / s.offsetWidth; return { x: r.left + ${x} * k, y: r.top + ${y} * k }; })()`);
    return {
      page,
      copy: async () => {
        await click(page, await at(1430, 500));
        await frames(page);
        assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((e) => e.style.translate)'), ['1300px 160px']);
        await key('c', 'KeyC', 67, 'copy');
      },
      paste: () => key('v', 'KeyV', 86, 'paste'),
      // the selection nudged by 10 px down n times
      down: async (n) => {
        for (let i = 0; i < n; i++) await press(page, 'Shift+ArrowDown');
        await sleep(1100);
        await frames(page);
      },
      // the drawn places of the QR codes of the slide in slide px, in the order of the file
      boxes: () => page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); const r = s.getBoundingClientRect(); const k = r.width / s.offsetWidth; return [...Reveal.getCurrentSlide().querySelectorAll(':scope > .qr')].map((e) => { const b = e.getBoundingClientRect(); return [b.left - r.left, b.top - r.top].map((v) => Math.round(v / k)); }); })()`),
    };
  }

  const twice = (list) => list.filter((x, i) => list.indexOf(x) !== i);

  // asserts that the last action, labeled label, is one entry of the history from the text before,
  // that an undo and a redo and a save and a reopen are byte for byte, and that the page logged no error
  async function entry(page, before, label) {
    const done = await render(page);
    assert.equal(await undoLabel(page), `Undo ${label}`);
    await undo(page);
    assert.equal(await render(page), before, `one undo does not give the file back before the ${label}`);
    await redo(page);
    assert.equal(await render(page), done);
    const { text } = await saveAndReopen(page);
    assert.equal(text, done, 'the save differs from the text');
    assert.deepEqual(errors(page), []);
  }

  for (const platform of PLATFORMS) {
    // the case qrPasteUndoPaste of the second check of R33.1: the paste takes the place that the
    // undone paste freed, after the first copy, rather than the place of the first copy
    test(`2: a QR code in the flow pasted after an undone paste is not put on the first copy (${platform})`, async (t) => {
      const { page, copy, paste, boxes } = await load(t, platform);
      const [[x, y]] = await boxes();
      await copy();
      await paste();
      await paste();
      assert.deepEqual(await boxes(), [[x, y], [x + 20, y + 20], [x + 40, y + 40]]);
      await undo(page);
      const before = await render(page);
      await paste();
      const p = await boxes();
      assert.deepEqual(twice(p.map(js)), [], `a paste after an undone paste lands on the first copy: ${js(p)}`);
      assert.deepEqual(p, [[x, y], [x + 20, y + 20], [x + 40, y + 40]]);
      await entry(page, before, 'Paste');
    });

    // the case qrPasteDeletePaste of the same check: the second copy deleted in place of the undo
    test(`2: a QR code in the flow pasted after a deleted copy is not put on the first copy (${platform})`, async (t) => {
      const { page, copy, paste, boxes } = await load(t, platform);
      const [[x, y]] = await boxes();
      await copy();
      await paste();
      await paste();
      await press(page, 'Delete');
      await frames(page);
      assert.deepEqual(await boxes(), [[x, y], [x + 20, y + 20]]);
      const before = await render(page);
      await paste();
      const p = await boxes();
      assert.deepEqual(twice(p.map(js)), [], `a paste after a deleted copy lands on the first copy: ${js(p)}`);
      assert.deepEqual(p, [[x, y], [x + 20, y + 20], [x + 40, y + 40]]);
      await entry(page, before, 'Paste');
    });

    // the case qrPasteOntoNext of the same check: the copy nudged 160 px down, then a paste, which
    // takes the place 20 px off the source that the copy freed
    test(`2: a QR code in the flow pasted after the copy was nudged onto the next place is not put on it (${platform})`, async (t) => {
      const { page, copy, paste, down, boxes } = await load(t, platform);
      const [[x, y]] = await boxes();
      await copy();
      await paste();
      assert.deepEqual(await boxes(), [[x, y], [x + 20, y + 20]]);
      await down(16);
      assert.deepEqual(await boxes(), [[x, y], [x + 20, y + 180]]);
      const before = await render(page);
      await paste();
      const p = await boxes();
      assert.deepEqual(twice(p.map(js)), [], `a paste after the copy was nudged onto the next place lands on it: ${js(p)}`);
      assert.deepEqual(p, [[x, y], [x + 20, y + 180], [x + 20, y + 20]]);
      await entry(page, before, 'Paste');
    });

    // two pastes are drawn 20 px and 40 px off the source, in the order of the file
    test(`3: a QR code in the flow pasted twice keeps the places of today (${platform})`, async (t) => {
      const { page, copy, paste, boxes } = await load(t, platform);
      const [[x, y]] = await boxes();
      await copy();
      await paste();
      const before = await render(page);
      await paste();
      assert.deepEqual(await boxes(), [[x, y], [x + 20, y + 20], [x + 40, y + 40]]);
      await entry(page, before, 'Paste');
    });
  }
});

// regression tests of R36.1 on both platforms. a duplicate of a block in the flow of a slide, and a
// paste of such a block on the slide of its source, is drawn 20 px down and to the right of its
// source, and moved on in steps of 20 px past the source and every older copy at this place now, as
// a copy of a shape is. the copy stays after its source in the file, and every other element of the
// slide is drawn where it was. each duplicate and each paste is one entry of the history, and an
// undo, a redo, and a save are byte for byte
describe('a duplicate of a block in the flow', () => {
  const PLATFORMS = ['mac', 'other'];
  const MOD = { mac: 4, other: 2 };
  const INDEX = 'test-deck.html';
  // a paragraph and a QR code of 320 px in the flow of slide 1, a paragraph in the text column of slide 2, a
  // closing slide, and a heading, a paragraph, a list, and a paragraph without offsets on slide 4
  const FLOW = 'test/pages/editor-r36-1.html';

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
  const undoLabel = (page) => page.evaluate('window.BeesonEditor.state("edit.undo").label');
  const undo = async (page) => {
    await page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
    await frames(page);
  };
  const redo = async (page) => {
    await page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
    await frames(page);
  };

  async function load(t, platform, deck, slide) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(readFileSync(deck, 'utf8'))})`)).problems, []);
    await page.send('Page.bringToFront');
    await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
    await page.evaluate(`Reveal.slide(${slide})`);
    await sleep(200);
    await frames(page);
    // copy and paste as trusted keys that carry the editing commands of the browser
    const key = async (k, code, kc, cmd) => {
      const e = { key: k, code, windowsVirtualKeyCode: kc, modifiers: MOD[platform] };
      await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...e, commands: [cmd] });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...e });
      await sleep(400);
      await frames(page);
    };
    // the drawn boxes [x, y, w, h] in slide px of the elements of selector on the current slide, in
    // the order of the file
    const boxes = (selector) =>
      page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); const r = s.getBoundingClientRect(); const k = r.width / s.offsetWidth; return [...Reveal.getCurrentSlide().querySelectorAll(${js(selector)})].map((e) => { const b = e.getBoundingClientRect(); return [b.left - r.left, b.top - r.top, b.width, b.height].map((v) => Math.round(v / k)); }); })()`);
    return {
      page,
      boxes,
      // the first element of selector selected as an object: a click into its words and Esc for a
      // block of text, and a click for a figure, with Shift to add it to the selection
      select: async (selector, { text = true, add = false } = {}) => {
        const [[x, y, w, h]] = await boxes(selector);
        const at = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); const r = s.getBoundingClientRect(); const k = r.width / s.offsetWidth; return { x: r.left + ${x + Math.min(20, w / 2)} * k, y: r.top + ${y + h / 2} * k }; })()`);
        await (add ? click(page, at, { modifiers: 'Shift' }) : clickText(page, at));
        await frames(page);
        if (text) {
          await press(page, 'Escape');
          await frames(page);
        }
      },
      selection: () => page.evaluate('window.BeesonEditor.selection().map((e) => e.localName + (e.classList.contains("qr") ? ".qr" : ""))'),
      duplicate: async () => {
        await press(page, 'Mod+D');
        await sleep(300);
        await frames(page);
      },
      copy: () => key('c', 'KeyC', 67, 'copy'),
      paste: () => key('v', 'KeyV', 86, 'paste'),
      cut: () => key('x', 'KeyX', 88, 'cut'),
    };
  }

  // the box b moved by d px down and to the right
  const off = ([x, y, w, h], d) => [x + d, y + d, w, h];

  // asserts that the boxes p are the boxes q within a slide px
  function near(p, q, what) {
    assert.equal(p.length, q.length, `${what}: ${js(p)} in place of ${js(q)}`);
    p.forEach((b, i) => b.forEach((v, j) => assert.ok(Math.abs(v - q[i][j]) <= 1, `${what}: ${js(p)} in place of ${js(q)}`)));
  }

  // asserts that the last action, labeled label, is one entry of the history from the text before,
  // that an undo and a redo and a save and a reopen are byte for byte, and that the page logged no error
  async function entry(page, before, label) {
    const done = await render(page);
    assert.equal(await undoLabel(page), `Undo ${label}`);
    await undo(page);
    assert.equal(await render(page), before, `one undo does not give the file back before the ${label}`);
    await redo(page);
    assert.equal(await render(page), done);
    const { text } = await saveAndReopen(page);
    assert.equal(text, done, 'the save differs from the text');
    assert.deepEqual(errors(page), []);
  }

  const P = ':scope > p';
  const QR = ':scope > .qr';
  const UL = ':scope > ul';

  for (const platform of PLATFORMS) {
    // item 1, the probe of the finding: the paragraph of slide 5 of index.html duplicated twice. the
    // copies are drawn 20 and 40 px off the paragraph rather than a whole height under it, over the
    // list, which is drawn where it was
    test(`1: a paragraph in the flow duplicated twice is put 20 px and 40 px off its source (${platform})`, async (t) => {
      const { page, boxes, select, selection, duplicate } = await load(t, platform, INDEX, 4);
      const [p] = await boxes(P);
      const list = await boxes(UL);
      await select(P);
      assert.deepEqual(await selection(), ['p']);
      await duplicate();
      near(await boxes(P), [p, off(p, 20)], 'the duplicate of the paragraph is not 20 px off it');
      near(await boxes(UL), list, 'the list is not drawn where it was');
      const before = await render(page);
      await duplicate();
      near(await boxes(P), [p, off(p, 20), off(p, 40)], 'the second duplicate is not 20 px past the first');
      near(await boxes(UL), list, 'the list is not drawn where it was');
      await entry(page, before, 'Duplicate');
    });

    // item 1: the QR code of 320 px of the finding duplicated twice stays inside the slide
    test(`1: a QR code in the flow duplicated twice is put 20 px and 40 px off its source inside the slide (${platform})`, async (t) => {
      const { page, boxes, select, selection, duplicate } = await load(t, platform, FLOW, 0);
      const [q] = await boxes(QR);
      assert.equal(q[2], 320);
      await select(QR, { text: false });
      assert.deepEqual(await selection(), ['div.qr']);
      await duplicate();
      near(await boxes(QR), [q, off(q, 20)], 'the duplicate of the QR code is not 20 px off it');
      const before = await render(page);
      await duplicate();
      const p = await boxes(QR);
      near(p, [q, off(q, 20), off(q, 40)], 'the second duplicate of the QR code is not 20 px past the first');
      assert.ok(p.every(([, y, , h]) => y + h <= 1080), `a duplicate of the QR code is below the slide: ${js(p)}`);
      await entry(page, before, 'Duplicate');
    });

    // item 1: a paragraph in the text column of a split slide
    test(`1: a paragraph in the text column of a split slide duplicated is put 20 px off its source (${platform})`, async (t) => {
      const { page, boxes, select, selection, duplicate } = await load(t, platform, FLOW, 1);
      const PANEL = ':scope > .text-column > p';
      const [p] = await boxes(PANEL);
      await select(PANEL);
      assert.deepEqual(await selection(), ['p']);
      const before = await render(page);
      await duplicate();
      near(await boxes(PANEL), [p, off(p, 20)], 'the duplicate of the paragraph in the panel is not 20 px off it');
      await entry(page, before, 'Duplicate');
    });

    // item 1: the heading of the title slide of index.html, in a block anchored at its bottom, which
    // the copy makes taller. the copy is put 20 px off the heading, and the words of the block are
    // drawn where they were
    test(`1: a heading in the block of a title slide duplicated is put 20 px off its source (${platform})`, async (t) => {
      const { page, boxes, select, selection, duplicate } = await load(t, platform, INDEX, 0);
      const H1 = ':scope > .title-text > h1';
      const [h] = await boxes(H1);
      const rest = await boxes(':scope > .title-text > :not(h1)');
      await select(H1);
      assert.deepEqual(await selection(), ['h1']);
      const before = await render(page);
      await duplicate();
      near(await boxes(H1), [h, off(h, 20)], 'the duplicate of the heading is not 20 px off it');
      near(await boxes(':scope > .title-text > :not(h1)'), rest, 'the words of the block are not drawn where they were');
      await entry(page, before, 'Duplicate');
    });

    // item 1: the same on the closing slide of the deck, whose block has no offsets
    test(`1: a heading in the block of a closing slide without offsets duplicated is put 20 px off its source (${platform})`, async (t) => {
      const { page, boxes, select, selection, duplicate } = await load(t, platform, FLOW, 2);
      const H1 = ':scope > .title-text > h1';
      const [h] = await boxes(H1);
      const rest = await boxes(':scope > .title-text > :not(h1)');
      await select(H1);
      assert.deepEqual(await selection(), ['h1']);
      const before = await render(page);
      await duplicate();
      near(await boxes(H1), [h, off(h, 20)], 'the duplicate of the heading is not 20 px off it');
      near(await boxes(':scope > .title-text > :not(h1)'), rest, 'the words of the block are not drawn where they were');
      await entry(page, before, 'Duplicate');
    });

    // item 3: with the paragraph and the QR code selected, each copy is put 20 px off its own source
    test(`3: a paragraph and a QR code duplicated together are each put 20 px off their own source (${platform})`, async (t) => {
      const { page, boxes, select, selection, duplicate } = await load(t, platform, FLOW, 0);
      const [p] = await boxes(P);
      const [q] = await boxes(QR);
      await select(P);
      await select(QR, { text: false, add: true });
      assert.deepEqual((await selection()).sort(), ['div.qr', 'p']);
      const before = await render(page);
      await duplicate();
      near(await boxes(P), [p, off(p, 20)], 'the duplicate of the paragraph is not 20 px off it');
      near(await boxes(QR), [q, off(q, 20)], 'the duplicate of the QR code is not 20 px off it');
      await entry(page, before, 'Duplicate');
    });

    // item 2: the paragraph of slide 5 of index.html copied and pasted twice on its slide
    test(`2: a paragraph in the flow pasted twice on its slide is put 20 px and 40 px off its source (${platform})`, async (t) => {
      const { page, boxes, select, copy, paste } = await load(t, platform, INDEX, 4);
      const [p] = await boxes(P);
      const list = await boxes(UL);
      await select(P);
      await copy();
      await paste();
      near(await boxes(P), [p, off(p, 20)], 'the paste of the paragraph is not 20 px off it');
      near(await boxes(UL), list, 'the list is not drawn where it was');
      const before = await render(page);
      await paste();
      near(await boxes(P), [p, off(p, 20), off(p, 40)], 'the second paste is not 20 px past the first');
      near(await boxes(UL), list, 'the list is not drawn where it was');
      await entry(page, before, 'Paste');
    });

    // items 2 and 4: a paste of the QR code after an undone paste takes the place that it freed
    test(`4: a QR code in the flow pasted after an undone paste takes the place that it freed (${platform})`, async (t) => {
      const { page, boxes, select, copy, paste } = await load(t, platform, FLOW, 0);
      const [q] = await boxes(QR);
      await select(QR, { text: false });
      await copy();
      await paste();
      await paste();
      near(await boxes(QR), [q, off(q, 20), off(q, 40)], 'two pastes of the QR code are not 20 px and 40 px off it');
      await undo(page);
      const before = await render(page);
      await paste();
      near(await boxes(QR), [q, off(q, 20), off(q, 40)], 'a paste after an undone paste is not at the place that it freed');
      await entry(page, before, 'Paste');
    });

    // item 4: a duplicate of the paragraph in the text column after a deleted duplicate takes the place
    // that it freed
    test(`4: a paragraph in the flow duplicated after a deleted duplicate takes the place that it freed (${platform})`, async (t) => {
      const { page, boxes, select, duplicate } = await load(t, platform, FLOW, 1);
      const PANEL = ':scope > .text-column > p';
      const [p] = await boxes(PANEL);
      await select(PANEL);
      await duplicate();
      await press(page, 'Delete');
      await frames(page);
      near(await boxes(PANEL), [p], 'the duplicate is not deleted');
      await select(PANEL);
      const before = await render(page);
      await duplicate();
      near(await boxes(PANEL), [p, off(p, 20)], 'a duplicate after a deleted duplicate is not 20 px off the paragraph');
      await entry(page, before, 'Duplicate');
    });

    // repair of item 4: a Delete or a Cut of a duplicate on a slide whose blocks have no offsets gives
    // the slide back, with the list and the last paragraph drawn where they were and without offsets
    for (const how of ['Delete', 'Cut']) {
      test(`4: a duplicate of a paragraph in the flow taken off by ${how} gives the slide back (${platform})`, async (t) => {
        const { page, boxes, select, duplicate, cut } = await load(t, platform, FLOW, 3);
        const ALL = ':scope > :is(h2, p, ul)';
        const start = await boxes(ALL);
        const text = await render(page);
        await select(P);
        await duplicate();
        const p = start[1];
        near(await boxes(P), [p, off(p, 20), start[3]], 'the duplicate of the paragraph is not 20 px off it');
        const before = await render(page);
        if (how === 'Cut') await cut();
        else await press(page, 'Backspace');
        await sleep(300);
        await frames(page);
        near(await boxes(ALL), start, `the slide is not drawn as before the duplicate after the ${how}`);
        assert.equal(await render(page), text, `the file is not given back by the ${how} of the duplicate`);
        assert.equal(await undoLabel(page), `Undo ${how}`);
        await undo(page);
        assert.equal(await render(page), before, `one undo does not give the duplicate back after the ${how}`);
        assert.deepEqual(errors(page), []);
      });
    }

    // repair of item 4: a Cut of a paste of the paragraph of slide 5 of index.html gives the list its
    // offset back
    test(`4: a paste of a paragraph in the flow taken off by Cut gives the slide back (${platform})`, async (t) => {
      const { page, boxes, select, copy, paste, cut } = await load(t, platform, INDEX, 4);
      const ALL = ':scope > :is(h2, p, ul)';
      const start = await boxes(ALL);
      const text = await render(page);
      await select(P);
      await copy();
      await paste();
      near(await boxes(P), [start[1], off(start[1], 20)], 'the paste of the paragraph is not 20 px off it');
      await cut();
      near(await boxes(ALL), start, 'the slide is not drawn as before the paste after the Cut');
      assert.equal(await render(page), text, 'the file is not given back by the Cut of the paste');
      assert.deepEqual(errors(page), []);
    });
  }
});
