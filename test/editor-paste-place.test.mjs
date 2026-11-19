import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { click, clickText, editorPage, press, saveAndReopen, type } from './helpers/editor.mjs';

describe('a paste on a slide without its sources', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test/pages/editor-r31-1.html';
  const SOURCE = readFileSync(DECK, 'utf8');
  const [FROM, TARGET, THIRD] = [0, 1, 2];

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
    const key = async (keys, command) => {
      await press(page, keys, { command });
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
        await key('Mod+C', 'copy');
      },
      paste: () => key('Mod+V', 'paste'),
      go: async (n) => {
        await page.evaluate(`Reveal.slide(${n})`);
        await frames(page);
        await sleep(200);
      },
      places: () => page.evaluate(`[...Reveal.getCurrentSlide().querySelectorAll(${js(kind.all)})].map((e) => e.style.translate)`),
      nudge: async () => {
        for (let i = 0; i < 5; i++) await press(page, 'Shift+ArrowDown');
        await sleep(1100);
        await frames(page);
      },
      of: (...ds) => ds.flatMap((d) => (Array.isArray(d) ? kind.of(...d) : kind.of(d))),
    };
  }

  const corner = (what) => ({ shape: [1205, 305], group: [205, 655], line: [1205, 700] })[what];

  const twice = (list) => list.filter((x, i) => list.indexOf(x) !== i);
  const sorted = (list) => [...list].sort();

  for (const platform of PLATFORMS) {
    for (const what of ['shape', 'group', 'line']) {
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
        await undo(page);
        await paste();
        assert.equal(await render(page), pasted, 'a paste after an undo is not put where the undone copy was');
        const { text } = await saveAndReopen(page);
        assert.equal(text, pasted, 'the save differs from the text');
        assert.deepEqual(errors(page), []);
      });

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

describe('a paste on the slide of its sources', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test/pages/editor-r31-1.html';
  const FLOW = 'test/pages/editor-r33-1.html';
  const [FROM, TARGET] = [0, 1];

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
    const key = async (keys, command) => {
      await press(page, keys, { command });
      await sleep(400);
      await frames(page);
    };
    const pick = async (d = 0) => {
      const at = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); const r = s.getBoundingClientRect(); const k = r.width / s.offsetWidth; const [x, y] = ${js(kind.at)}; return { x: r.left + (x + ${d}) * k, y: r.top + (y + ${d}) * k }; })()`);
      await click(page, at);
      await frames(page);
      assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((e) => e.style.translate)'), kind.of(d), `the click at ${d} px does not select the element there`);
    };
    const nudge = async (keys) => {
      for (const k of keys) await press(page, `Shift+${k}`);
      await sleep(1100);
      await frames(page);
    };
    return {
      page,
      copy: async () => {
        await pick(0);
        await key('Mod+C', 'copy');
      },
      paste: () => key('Mod+V', 'paste'),
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
      places: async () => (await page.evaluate(`[...Reveal.getCurrentSlide().querySelectorAll(${js(kind.all)})].map((e) => e.style.translate)`)).sort(),
      boxes: () => page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); const r = s.getBoundingClientRect(); const k = r.width / s.offsetWidth; return [...Reveal.getCurrentSlide().querySelectorAll(${js(kind.all)})].map((e) => { const b = e.getBoundingClientRect(); return [b.left - r.left, b.top - r.top].map((v) => Math.round(v / k)); }); })()`),
      down: () => nudge(Array(5).fill('ArrowDown')),
      onto: () => nudge(['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown']),
      of: (...ds) => ds.flatMap((d) => (Array.isArray(d) ? kind.of(...d) : kind.of(d))).sort(),
    };
  }

  const twice = (list) => list.filter((x, i) => list.indexOf(x) !== i);

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

describe('the Flip row following the picture shown', () => {
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
    const key = async (keys, command) => {
      await press(page, keys, { command });
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
        await key('Mod+C', 'copy');
      },
      paste: () => key('Mod+V', 'paste'),
      down: async (n) => {
        for (let i = 0; i < n; i++) await press(page, 'Shift+ArrowDown');
        await sleep(1100);
        await frames(page);
      },
      boxes: () => page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); const r = s.getBoundingClientRect(); const k = r.width / s.offsetWidth; return [...Reveal.getCurrentSlide().querySelectorAll(':scope > .qr')].map((e) => { const b = e.getBoundingClientRect(); return [b.left - r.left, b.top - r.top].map((v) => Math.round(v / k)); }); })()`),
    };
  }

  const twice = (list) => list.filter((x, i) => list.indexOf(x) !== i);

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

describe('a duplicate of a block in the flow', () => {
  const PLATFORMS = ['mac', 'other'];
  const INDEX = 'test-deck.html';
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
    const key = async (keys, command) => {
      await press(page, keys, { command });
      await sleep(400);
      await frames(page);
    };
    const boxes = (selector) =>
      page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); const r = s.getBoundingClientRect(); const k = r.width / s.offsetWidth; return [...Reveal.getCurrentSlide().querySelectorAll(${js(selector)})].map((e) => { const b = e.getBoundingClientRect(); return [b.left - r.left, b.top - r.top, b.width, b.height].map((v) => Math.round(v / k)); }); })()`);
    return {
      page,
      boxes,
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
      copy: () => key('Mod+C', 'copy'),
      paste: () => key('Mod+V', 'paste'),
      cut: () => key('Mod+X', 'cut'),
    };
  }

  const off = ([x, y, w, h], d) => [x + d, y + d, w, h];

  function near(p, q, what) {
    assert.equal(p.length, q.length, `${what}: ${js(p)} in place of ${js(q)}`);
    p.forEach((b, i) => b.forEach((v, j) => assert.ok(Math.abs(v - q[i][j]) <= 1, `${what}: ${js(p)} in place of ${js(q)}`)));
  }

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
