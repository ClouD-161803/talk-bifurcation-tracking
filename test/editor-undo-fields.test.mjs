// Undo and Redo with a value typed into a field of the inspector, which enter the value first, and
// other fixes of the same rounds

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { center, click, clickText, drag, press, type } from './helpers/editor.mjs';

// regression tests of R17.6 on both platforms. Edit > Undo with a value typed into a field of the
// inspector enters the value as an entry of its own and undoes it, as the Undo of the toolbar does
// (6e, N29), and the Undo of the toolbar keeps the focus in the field (N32). the report of an
// overlap comes back after an undo of a drag (N20), and it names three kinds of figures (N13,
// N22). the well Slide Layout draws Content, Narrow as its tile does (N55), and the dialog of
// PowerPoint... names the attached file and leaves out a folder that it does not know (N42)
describe('Edit > Undo with a typed value', () => {
  const DECK = 'test-deck.html';
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATFORMS = ['mac', 'other'];
  // slide 5 of the demo deck, with a heading, a paragraph, a list of three items, and a figure
  const FIGURES = 4;
  const SLIDE = '.reveal .slides > section.present';
  const IMG = `${SLIDE} figure.figure-box img.for-dark`;

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
  const wait = (page, ms = 300) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const labels = async (page) => [(await state(page, 'edit.undo')).label, (await state(page, 'edit.redo')).label];
  const focused = (page) => page.evaluate(`(() => { const a = document.activeElement; return a ? a.localName + (a.id ? '#' + a.id : '') : null; })()`);
  const fieldValue = (page, id) => page.evaluate(`document.querySelector('#beeson-edit-num-${id}')?.value ?? null`);
  const title = (page) => page.evaluate(`document.querySelector('.beeson-edit-menubar .state, .beeson-edit-header .state')?.textContent ?? null`);
  const rect = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const findItem = `(l) => [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.getClientRects().length && (i.querySelector('.label')?.firstChild?.textContent ?? '') === l)`;

  async function load(t, platform, { deck = DECK, slide = FIGURES } = {}) {
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
    await page.evaluate(`Reveal.slide(${slide})`);
    await wait(page);
    return page;
  }

  // the item label of the menu bar named bar, chosen by trusted clicks
  async function choose(page, bar, label) {
    await click(page, await rect(page, `[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${js(bar)})`));
    await wait(page, 200);
    const at = await rect(page, `(${findItem})(${js(label)})`);
    assert.ok(at, `the ${bar} menu does not have ${label}`);
    await clickText(page, at);
    await wait(page, 400);
  }

  // the figure of slide 5 moved by one press of the right arrow key, with the Arrange pane open and
  // the focus in W. text is the file after the move
  async function moved(t, platform) {
    const page = await load(t, platform);
    await clickText(page, await center(page, IMG));
    await press(page, 'ArrowRight');
    await wait(page, 1100);
    const text = await render(page);
    assert.notEqual(text, page.source, 'the right arrow key did not move the figure');
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await wait(page);
    await exec(page, 'arrange.sizeAndPosition');
    await wait(page);
    return { page, text };
  }

  async function typeInto(page, id, value) {
    const sel = `#beeson-edit-num-${id}`;
    await clickText(page, await center(page, sel));
    await page.evaluate(`document.querySelector(${js(sel)}).select()`);
    await type(page, value);
    await wait(page);
  }

  // each field with the value typed into it and the label of the entry that this value enters
  const FIELDS = [['x', '300', 'Position'], ['width', '400', 'Size'], ['angle', '15', 'Rotate']];

  for (const platform of PLATFORMS) {
    for (const [id, value, entry] of FIELDS) {
      // 6e and N29: Edit > Undo undid the Move and kept 300 in X, and the next Tab wrote 300 as a
      // new entry, which took the redo of the Move away
      test(`Edit > Undo with ${value} typed into ${id} enters the value and undoes it, and keeps the Move (${platform})`, async (t) => {
        const { page, text } = await moved(t, platform);
        const shown = await fieldValue(page, id);
        await typeInto(page, id, value);
        await choose(page, 'Edit', 'Undo Move');
        assert.equal(await render(page), text, 'the file after Edit > Undo is not the moved one');
        assert.deepEqual(await labels(page), ['Undo Move', `Redo ${entry}`]);
        assert.equal(await focused(page), `input#beeson-edit-num-${id}`, 'the focus left the field');
        assert.equal(await fieldValue(page, id), shown, 'the field does not show the value of the moved figure');
        await press(page, 'Tab');
        await wait(page, 400);
        assert.equal(await render(page), text, 'Tab wrote the typed value after the undo');
        assert.deepEqual(await labels(page), ['Undo Move', `Redo ${entry}`], 'Tab took the redo away');
        await choose(page, 'Edit', `Redo ${entry}`);
        assert.notEqual(await render(page), text, 'Edit > Redo did not give the typed value back');
        await choose(page, 'Edit', `Undo ${entry}`);
        await choose(page, 'Edit', 'Undo Move');
        assert.equal(await render(page), page.source);
        assert.deepEqual(errors(page), []);
      });
    }

    test(`the Undo of the toolbar with 300 typed into X enters the value, undoes it, and keeps the focus in X (${platform})`, async (t) => {
      const { page, text } = await moved(t, platform);
      const shown = await fieldValue(page, 'x');
      await typeInto(page, 'x', '300');
      await click(page, await center(page, '[data-command="edit.undo"]'));
      await wait(page, 500);
      assert.equal(await render(page), text);
      assert.deepEqual(await labels(page), ['Undo Move', 'Redo Position']);
      assert.equal(await focused(page), 'input#beeson-edit-num-x', 'the focus left the field');
      assert.equal(await fieldValue(page, 'x'), shown);
      assert.deepEqual(errors(page), []);
    });

    // N32: the focus moved to the body, and the next Tab selected the heading of the slide
    test(`the Undo of the toolbar after a step of Angle by the up arrow key keeps the focus in Angle (${platform})`, async (t) => {
      const { page, text } = await moved(t, platform);
      await click(page, await center(page, '#beeson-edit-num-angle'));
      await press(page, 'ArrowUp');
      await wait(page, 400);
      assert.notEqual(await render(page), text, 'the up arrow key did not turn the figure');
      await click(page, await center(page, '[data-command="edit.undo"]'));
      await wait(page, 500);
      assert.equal(await render(page), text);
      assert.equal(await focused(page), 'input#beeson-edit-num-angle', 'the focus left the field');
      assert.equal(await fieldValue(page, 'angle'), '0');
      await press(page, 'Tab');
      await wait(page, 200);
      assert.equal(await page.evaluate(`!!document.activeElement?.closest('.beeson-edit-inspector')`), true, 'Tab left the inspector');
      assert.deepEqual(errors(page), []);
    });

    // N20: the style of the list was 'translate: 0px 20px' at the check and 'translate: 0px 20px;'
    // after the undo, hence the report stayed '1 text is under a picture'
    test(`after Wide, an undo of a drag of the list brings the report of its items back (${platform})`, async (t) => {
      const page = await load(t, platform);
      await exec(page, 'slide.layout.wide');
      await wait(page, 300);
      const wide = await render(page);
      const said = await title(page);
      assert.match(said, /4 texts are under a picture/);
      const start = await page.evaluate(`(() => { const r = document.createRange(); r.selectNodeContents(Reveal.getCurrentSlide().querySelector(':scope > ul > li')); const l = r.getClientRects()[0]; return { x: l.left + 12, y: l.top + l.height / 2 }; })()`);
      await clickText(page, start);
      await press(page, 'Escape');
      await wait(page);
      const k = await page.evaluate('Reveal.getCurrentSlide().getBoundingClientRect().width / 1920');
      const handle = await page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-handle')].find((d) => !d.hidden && d.getClientRects().length).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await drag(page, handle, { dx: 0, dy: 40 * k, steps: 8 });
      await wait(page, 300);
      assert.notEqual(await render(page), wide, 'the drag did not move the list');
      assert.match(await title(page), /1 text is under a picture\b/);
      await undo(page);
      await wait(page, 300);
      assert.equal(await render(page), wide);
      assert.equal(await title(page), said, 'the report after the undo of the drag');
      assert.deepEqual(errors(page), []);
    });

    // N22: a picture, a table, and a QR code over texts read '4 texts are under 3 figures'
    test(`the report names a picture, a table, and a QR code over texts by their kinds (${platform})`, async (t) => {
      const page = await load(t, platform);
      // a new table is put off the words where it can be, hence it is moved over the list
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await wait(page);
      await exec(page, 'arrange.setPosition', { x: 200, y: 560 });
      await wait(page);
      await exec(page, 'insert.qr');
      await wait(page);
      await exec(page, 'arrange.setPosition', { x: 300, y: 250 });
      await wait(page);
      await exec(page, 'slide.layout.wide');
      await wait(page, 400);
      const said = await title(page);
      const m = said.replace(/^Unsaved changes\. /, '').match(/^(\d+) texts are under (.+)$/);
      assert.ok(m, `the report reads ${js(said)}`);
      const parts = m[2].split(/, and |, | and /);
      assert.deepEqual([...parts].sort(), ['a QR code', 'a picture', 'a table'], `the report reads ${js(said)}`);
      assert.match(m[2], /^a [^,]+, a [^,]+, and a [^,]+$/, 'three kinds are not named with a serial comma');
      assert.deepEqual(errors(page), []);
    });

    // N13: two tables and a plot over texts read '5 texts are under 3 figures'. a deck plot is named in
    // editor-r20-1, since a plot is not inserted by the editor
    test(`the report names two tables and a QR code over texts by their kinds and counts (${platform})`, async (t) => {
      const page = await load(t, platform);
      for (const [id, arg, x, y] of [['insert.table', { rows: 3, columns: 3 }, 200, 250], ['insert.table', { rows: 3, columns: 3 }, 200, 560], ['insert.qr', undefined, 900, 300]]) {
        await exec(page, id, arg);
        await wait(page);
        await exec(page, 'arrange.setPosition', { x, y });
        await wait(page);
      }
      await exec(page, 'slide.layout.wide');
      await wait(page, 400);
      const said = await title(page);
      assert.doesNotMatch(said, /figures/, `the report reads ${js(said)}`);
      const m = said.replace(/^Unsaved changes\. /, '').match(/^(\d+) texts are under (.+)$/);
      assert.ok(m, `the report reads ${js(said)}`);
      const parts = m[2].split(/, and |, | and /);
      assert.ok(parts.includes('2 tables'), `the report reads ${js(said)}`);
      assert.ok(parts.includes('a QR code'), `the report reads ${js(said)}`);
      assert.equal(new Set(parts).size, parts.length, `a kind is named twice in ${js(said)}`);
      assert.deepEqual(errors(page), []);
    });

    // N55: the well drew Content, Narrow as an inset block at 31, 6 with 28 by 24 of its 64 by 36
    test(`the well Slide Layout draws the backdrop of Content, Narrow as its tile does (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: LAYOUTS, slide: 4 });
      const well = await page.evaluate(`(() => {
      const svg = document.querySelector('.beeson-edit-inspector .ed-chooser .thumb svg');
      const name = document.querySelector('.beeson-edit-inspector .ed-chooser .what span:last-child')?.textContent ?? null;
      const boxes = svg ? [...svg.querySelectorAll('rect')].filter((r) => r.getAttribute('fill') === 'var(--ed-faint)' && Number(r.getAttribute('height')) > 10)
        .map((r) => ['x', 'y', 'width', 'height'].map((k) => Number(r.getAttribute(k)))) : null;
      return { name, boxes };
    })()`);
      assert.equal(well.name, 'Content, Narrow');
      // the tile draws the backdrop at 920, 0 with 1000 by 1080 in slide px, i.e. at 30.7, 0 with
      // 33.3 by 36 in the units of the sketch, which is cut at its frame from 0.5 to 63.5
      const boxes = well.boxes.filter(([x]) => x > 20);
      assert.ok(boxes.length >= 1, `the well does not draw the backdrop: ${js(well.boxes)}`);
      const left = Math.min(...boxes.map((b) => b[0]));
      const top = Math.min(...boxes.map((b) => b[1]));
      const right = Math.max(...boxes.map((b) => b[0] + b[2]));
      const bottom = Math.max(...boxes.map((b) => b[1] + b[3]));
      assert.ok(Math.abs(left - (920 * 64) / 1920) < 0.6, `the backdrop of the well starts at ${left}`);
      assert.ok(top <= 0.5 && bottom >= 35.5, `the backdrop of the well runs from ${top} to ${bottom}`);
      assert.ok(right >= 63.5, `the backdrop of the well ends at ${right}`);
      assert.deepEqual(errors(page), []);
    });

    // N42: over HTTP at the root, the dialog read 'run in the folder of the deck, i.e. /', and it
    // named index.html after the deck was saved into another file
    test(`the card of PowerPoint... names the attached file and leaves out the folder of an address (${platform})`, async (t) => {
      const page = await load(t, platform);
      await page.evaluate(`(async () => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle('talk-r17.html', { create: true });
      window.BeesonEditor.attach(handle);
      await window.BeesonEditor.save();
      return true;
    })()`);
      // the dialog is open until it is closed, hence the command is not awaited
      await page.evaluate(`void window.BeesonEditor.exec('file.export.pptx'); true`);
      await wait(page);
      const shown = await page.evaluate(`(() => { const d = document.querySelector('dialog.beeson-edit-dialog.pptx'); return d && d.open ? { text: d.textContent, code: d.querySelector('code')?.textContent ?? null } : null; })()`);
      assert.ok(shown, 'the card of PowerPoint... is not open');
      assert.equal(shown.code, 'npm run pptx -- talk-r17.html');
      assert.match(shown.text, /saved talk-r17\.html/);
      assert.doesNotMatch(shown.text, /index\.html/);
      assert.doesNotMatch(shown.text, /i\.e\. \//, `the card names a folder from the address: ${js(shown.text)}`);
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R19.5 on both platforms. Redo with a value typed into a field of the
// inspector redoes the entry that it names, and the redone value replaces the typed one (D10). an
// undo with the focus in Start at keeps the focus there (D11), and an undo refuses a Start at
// that is not whole, as Tab and Return do, and leaves the file unchanged (D12)
describe('Redo with a value typed into a field', () => {
  const DECK = 'test-deck.html';
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATFORMS = ['mac', 'other'];
  // slide 5 of the demo deck, with a heading, a paragraph, a list of three items, and a figure
  const FIGURES = 4;
  const SLIDE = '.reveal .slides > section.present';
  const IMG = `${SLIDE} figure.figure-box img.for-dark`;

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
  const wait = (page, ms = 300) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const labels = async (page) => [(await state(page, 'edit.undo')).label, (await state(page, 'edit.redo')).label];
  const focused = (page) => page.evaluate(`(() => { const a = document.activeElement; return a ? a.localName + (a.id ? '#' + a.id : '') : null; })()`);
  const fieldValue = (page, id) => page.evaluate(`document.querySelector('#beeson-edit-num-${id}')?.value ?? null`);
  const title = (page) => page.evaluate(`document.querySelector('.beeson-edit-menubar .state, .beeson-edit-header .state')?.textContent ?? null`);
  const rect = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const findItem = `(l) => [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.getClientRects().length && (i.querySelector('.label')?.firstChild?.textContent ?? '') === l)`;

  async function load(t, platform, { deck = DECK, slide = FIGURES } = {}) {
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
    await page.evaluate(`Reveal.slide(${slide})`);
    await wait(page);
    return page;
  }

  // the item label of the menu bar named bar, chosen by trusted clicks
  async function choose(page, bar, label) {
    await click(page, await rect(page, `[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${js(bar)})`));
    await wait(page, 200);
    const at = await rect(page, `(${findItem})(${js(label)})`);
    assert.ok(at, `the ${bar} menu does not have ${label}`);
    await click(page, at);
    await wait(page, 400);
  }

  // the figure of slide 5 moved by one press of the right arrow key, with the Arrange pane open and
  // the focus in W. text is the file after the move
  async function moved(t, platform) {
    const page = await load(t, platform);
    await click(page, await center(page, IMG));
    await press(page, 'ArrowRight');
    await wait(page, 1100);
    const text = await render(page);
    assert.notEqual(text, page.source, 'the right arrow key did not move the figure');
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await wait(page);
    await exec(page, 'arrange.sizeAndPosition');
    await wait(page);
    return { page, text };
  }

  async function typeInto(page, id, value) {
    const sel = `#beeson-edit-num-${id}`;
    await click(page, await center(page, sel));
    await page.evaluate(`document.querySelector(${js(sel)}).select()`);
    await type(page, value);
    await wait(page);
  }

  const START = '.beeson-edit-inspector input[name="Start at"]';
  const olTag = async (page) => (await render(page)).match(/<ol[^>]*>/)?.[0] ?? null;
  const startFocused = (page) => page.evaluate(`document.activeElement === document.querySelector(${js(START)}) && document.activeElement.isConnected`);
  const startValue = (page) => page.evaluate(`document.querySelector(${js(START)})?.value ?? null`);

  // the Undo or the Redo of the toolbar, or the item of the Edit menu that reads label
  async function step(page, how, label) {
    if (how === 'toolbar') {
      await click(page, await center(page, `[data-command="edit.${label.startsWith('Undo') ? 'undo' : 'redo'}"]`));
      await wait(page, 500);
    } else await choose(page, 'Edit', label);
  }

  // the first list item of slide 5 made a numbered list, with the Text tab of the inspector open.
  // list is the file with this list
  async function numbered(t, platform) {
    const page = await load(t, platform);
    const at = await rect(page, `(() => { const li = Reveal.getCurrentSlide().querySelector(':scope ul > li'); const n = [...li.childNodes].find((c) => c.nodeType === 3 && c.data.trim()); const r = document.createRange(); r.setStart(n, 2); r.setEnd(n, 3); return r; })()`);
    await click(page, at);
    await wait(page);
    await exec(page, 'text.list.ol');
    await wait(page, 400);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await wait(page);
    const tab = await rect(page, `[...document.querySelectorAll('.beeson-edit-inspector .ed-tabs button')].find((b) => b.textContent.trim() === 'Text')`);
    if (tab) await click(page, tab);
    await wait(page);
    const list = await render(page);
    assert.match(await olTag(page), /^<ol(?![^>]*start=)/);
    assert.equal(await startValue(page), '1');
    await click(page, await center(page, START), { count: 3 });
    await wait(page, 150);
    return { page, list };
  }

  for (const platform of PLATFORMS) {
    for (const how of ['menu', 'toolbar']) {
      // D10: the typed 300 was entered as Position, which cleared the redo, hence the Move was lost
      test(`Redo of the ${how} with 300 typed into X redoes the Move and keeps the focus in X (${platform})`, async (t) => {
        const { page, text } = await moved(t, platform);
        const x = await fieldValue(page, 'x');
        await undo(page);
        await wait(page);
        assert.equal(await render(page), page.source);
        await typeInto(page, 'x', '300');
        assert.deepEqual(await labels(page), ['Undo', 'Redo Move']);
        await step(page, how, 'Redo Move');
        assert.equal(await render(page), text, 'the file after the redo is not the moved one');
        assert.deepEqual(await labels(page), ['Undo Move', 'Redo']);
        assert.equal(await focused(page), 'input#beeson-edit-num-x', 'the focus left the field');
        assert.equal(await fieldValue(page, 'x'), x, 'the field does not show the redone place');
        await press(page, 'Tab');
        await wait(page, 400);
        assert.equal(await render(page), text, 'Tab wrote the typed value after the redo');
        assert.deepEqual(errors(page), []);
      });

      // D11: the undo selected the list, the pane was built again, and the focus fell to the body
      test(`Undo of the ${how} with the focus in Start at keeps the focus there (${platform})`, async (t) => {
        const { page, list } = await numbered(t, platform);
        await type(page, '4');
        if (how === 'toolbar') await press(page, 'Enter');
        await wait(page, 400);
        // without Return, the undo enters 4 first and undoes it
        if (how === 'toolbar') assert.match(await olTag(page), /start="4"/);
        await step(page, how, (await labels(page))[0]);
        assert.equal(await render(page), list);
        assert.deepEqual(await labels(page), ['Undo List Style', 'Redo Start At']);
        assert.equal(await startFocused(page), true, 'the focus left Start at');
        assert.equal(await startValue(page), '1');
        assert.deepEqual(errors(page), []);
      });

      // D12: the undo entered 2.5 as 3 and undid it, and the redo then wrote start="3"
      test(`Undo of the ${how} refuses 2.5 typed into Start at and leaves the file unchanged (${platform})`, async (t) => {
        const { page, list } = await numbered(t, platform);
        const before = await labels(page);
        await type(page, '2.5');
        await wait(page);
        await step(page, how, before[0]);
        assert.equal(await render(page), list, 'the undo changed the file');
        assert.deepEqual(await labels(page), before, 'the undo entered the value or undid the entry before it');
        assert.equal(await startFocused(page), true, 'the focus left Start at');
        assert.equal(await startValue(page), '1');
        assert.deepEqual(errors(page), []);
      });
    }
  }
});

// regression tests of R20.9 on both platforms, for the findings F3, F20, F4, F5, F11, and F21 of the
// final review of round 7 on the text, the keys, and the fields of the editor
describe('redo, cut, and Mod+D in text and fields', () => {
  const DECK = 'test-deck.html';
  const PAGE = 'test/pages/editor-r20-9.html';
  const PLATFORMS = ['mac', 'other'];
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
  const wait = (page, ms = 300) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const labels = async (page) => [(await state(page, 'edit.undo')).label, (await state(page, 'edit.redo')).label];
  const rect = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

  async function load(t, platform, { deck = DECK, slide = 0 } = {}) {
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
    await page.evaluate(`Reveal.slide(${slide})`);
    await wait(page);
    return page;
  }

  // selects the characters from to to of the first text node under within that holds needle
  const select = (page, needle, from, to, within = SLIDE) => page.evaluate(`(() => {
  const w = document.createTreeWalker(document.querySelector(${js(within)}), NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const i = n.data.indexOf(${js(needle)});
    if (i < 0) continue;
    n.parentElement.closest('[contenteditable="true"]').focus();
    getSelection().setBaseAndExtent(n, i + ${from}, n, i + ${to});
    return getSelection().toString();
  }
  return null;
})()`);
  const nested = (text) => (text.match(/<ol start="3">[\s\S]*?<\/ol>/) ?? ['?'])[0].replace(/\s+/g, ' ');

  // F3: Return in a nested item, its undo, its redo, and a typed k. the k goes to the start of the
  // second part, or into the second new empty item when the whole item was selected
  for (const platform of PLATFORMS) {
    for (const [name, needle, from, to, want] of [
      ['a caret after Nes', 'Nested one', 3, 3, '<li>Nes</li> <li>kted one</li>'],
      ['ste selected', 'Nested one', 2, 5, '<li>Ne</li> <li>kd one</li>'],
      ['the whole of Nested two', 'Nested two', 0, 10, '<li>Nested one</li> <li></li> <li>k</li>'],
    ]) {
      test(`F3 ${platform}: a redo of Return in a nested item with ${name} puts the caret into the second part`, async (t) => {
        const page = await load(t, platform, { deck: PAGE });
        assert.notEqual(await select(page, needle, from, to), null);
        await press(page, 'Enter');
        await wait(page);
        const split = await render(page);
        await press(page, 'Mod+Z');
        await wait(page);
        await press(page, 'Mod+Shift+Z');
        await wait(page);
        assert.equal(await render(page), split, 'the redo does not give the file after Return');
        await press(page, 'k');
        await wait(page, 600);
        assert.ok(nested(await render(page)).includes(want), nested(await render(page)));
        assert.deepEqual(errors(page), []);
      });
    }
  }

  const FIGURES = 4;
  const IMG = `${SLIDE} figure.figure-box img.for-dark`;
  const focused = (page) => page.evaluate(`(() => { const a = document.activeElement; return a ? a.localName + (a.id ? '#' + a.id : '') : null; })()`);
  const findItem = `(l) => [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.getClientRects().length && (i.querySelector('.label')?.firstChild?.textContent ?? '').startsWith(l))`;

  // the item of the menu bar named bar whose label starts with label, chosen by trusted clicks
  async function choose(page, bar, label) {
    await click(page, await rect(page, `[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${js(bar)})`));
    await wait(page, 200);
    const at = await rect(page, `(${findItem})(${js(label)})`);
    assert.ok(at, `the ${bar} menu does not have ${label}`);
    await click(page, at);
  }

  // F20: Redo Duplicate with 300 typed into X redoes the duplicate, and the typed value gives way,
  // since the redone entry selects the copy. the original figure is not moved
  for (const platform of PLATFORMS) {
    for (const how of ['toolbar', 'menu']) {
      test(`F20 ${platform}: Redo Duplicate from the ${how} with a value typed into X does not move the original`, async (t) => {
        const page = await load(t, platform, { slide: FIGURES });
        await click(page, await center(page, IMG));
        await wait(page);
        await exec(page, 'edit.duplicate');
        await wait(page, 500);
        const done = await render(page);
        assert.notEqual(done, page.source);
        await undo(page);
        await wait(page, 500);
        assert.equal(await render(page), page.source);
        await exec(page, 'arrange.sizeAndPosition');
        await wait(page, 400);
        await click(page, await center(page, '#beeson-edit-num-x'));
        await page.evaluate(`document.querySelector('#beeson-edit-num-x').select()`);
        await type(page, '300');
        await wait(page);
        assert.equal(await focused(page), 'input#beeson-edit-num-x');
        assert.deepEqual(await labels(page), ['Undo', 'Redo Duplicate']);
        if (how === 'toolbar') await click(page, await center(page, '[data-command="edit.redo"]'));
        else await choose(page, 'Edit', 'Redo');
        await wait(page, 700);
        assert.ok((await render(page)) === done, 'the redo is not the file after the duplicate');
        assert.deepEqual(await labels(page), ['Undo Duplicate', 'Redo']);
        await undo(page);
        await wait(page, 500);
        assert.equal(await render(page), page.source);
        assert.deepEqual(await labels(page), ['Undo', 'Redo Duplicate']);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  const INLINE = 1;
  const MOD = { mac: 4, other: 2 };
  const line = (text, start) => text.slice(text.indexOf(start), text.indexOf('</p>', text.indexOf(start)) + 4);

  // a key with the modifier of the platform and with the editing command of a real keyboard, which
  // press() does not send
  async function chord(page, platform, key, command) {
    const base = { key, code: `Key${key.toUpperCase()}`, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0), modifiers: MOD[platform], commands: [command] };
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await wait(page);
  }

  // F4: the italic taken off the whole text of <em>styles </em>, or off styles alone, does not leave
  // an element around the space
  for (const platform of PLATFORMS) {
    for (const [how, to] of [['Mod+I', 7], ['text.italic', 7], ['text.clear', 7], ['Mod+I', 6]]) {
      test(`F4 ${platform}: ${how} over ${to === 7 ? 'styles with its space' : 'styles'} in an em takes the italic off without an em around the space`, async (t) => {
        const page = await load(t, platform, { deck: PAGE, slide: INLINE });
        assert.equal(await select(page, 'styles ', 0, to), 'styles '.slice(0, to));
        if (how.startsWith('Mod+')) await press(page, how);
        else await exec(page, how);
        await wait(page);
        const text = await render(page);
        assert.equal(line(text, '<p>Some'), '<p>Some styles of it.</p>');
        await undo(page);
        await wait(page);
        assert.ok((await render(page)) === page.source, 'the undo does not give the file back');
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // F5: a cut of a word that is the whole text of an em or a strong leaves one space between the
  // words around it
  for (const platform of PLATFORMS) {
    for (const how of ['Mod+X', 'menu']) {
      for (const [needle, start, want] of [['word', '<p>See', '<p>See the here.</p>'], ['big', '<p>Call', '<p>Call the fox, now.</p>']]) {
        test(`F5 ${platform}: a cut of ${needle} from ${how}, the whole text of an inline element, leaves one space`, async (t) => {
          const page = await load(t, platform, { deck: PAGE, slide: INLINE });
          assert.equal(await select(page, needle, 0, needle.length), needle);
          if (how === 'menu') {
            await choose(page, 'Edit', 'Cut');
            await page.waitFor(`window.BeesonEditor.render() !== ${js(page.source)}`).catch(() => {});
            await wait(page);
          } else await chord(page, platform, 'x', 'cut');
          await wait(page);
          assert.equal(line(await render(page), start), want);
          assert.equal((await labels(page))[0], 'Undo Cut');
          await undo(page);
          await wait(page);
          assert.ok((await render(page)) === page.source, 'the undo does not give the file back');
          assert.deepEqual(errors(page), []);
        });
      }
    }
  }

  const LI = `document.querySelector('${SLIDE} li')`;

  // the caret after the fourth character of the first item of slide 3 of the demo deck
  async function caretInItem(t, platform) {
    const page = await load(t, platform, { slide: 2 });
    await click(page, await page.evaluate(`(() => { const r = ${LI}.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`));
    await wait(page);
    await page.evaluate(`(() => { getSelection().collapse(${LI}.firstChild, 4); return true; })()`);
    return page;
  }
  const keyed = (page) => page.evaluate(`({ active: document.activeElement === ${LI}, undo: window.BeesonEditor.state('edit.undo').label, dialogs: [...document.querySelectorAll('dialog[open]')].length, find: !!document.querySelector('.beeson-find:not([hidden]), .beeson-edit-find:not([hidden])') })`);

  // F11: on a Mac, Control with a letter in a text is left to the text, as a key of macOS, e.g.
  // Control-D deletes forward, and it does not run the command of Command with the letter
  for (const key of ['Ctrl+D', 'Ctrl+K', 'Ctrl+F', 'Ctrl+B']) {
    test(`F11 mac: ${key} with the caret in a text does not run a command`, async (t) => {
      const page = await caretInItem(t, 'mac');
      await press(page, key);
      await wait(page);
      assert.deepEqual(await keyed(page), { active: true, undo: 'Undo', dialogs: 0, find: false });
      assert.ok((await render(page)) === page.source, 'the file changed');
      assert.deepEqual(errors(page), []);
    });
  }

  // Mod+D in a text still duplicates the block of the caret, i.e. Command-D on a Mac and Control-D
  // elsewhere
  for (const platform of PLATFORMS) {
    test(`F11 ${platform}: Mod+D with the caret in a text duplicates its block`, async (t) => {
      const page = await caretInItem(t, platform);
      await press(page, 'Mod+D');
      await wait(page, 500);
      assert.equal((await keyed(page)).undo, 'Undo Duplicate');
      assert.deepEqual(errors(page), []);
    });
  }

  const tab = (page, name) => rect(page, `[...document.querySelectorAll('.beeson-edit-inspector .ed-tabs button')].find((b) => b.textContent.trim() === ${js(name)})`);

  // F21: Export of the paragraph of slide 5 made bold, X of the Arrange pane focused, and the bold
  // undone from the toolbar or with Mod+Z. the Text pane then acts on the paragraph
  for (const platform of PLATFORMS) {
    for (const how of ['toolbar', 'Mod+Z']) {
      test(`F21 ${platform}: an undo from ${how} with the focus in X leaves Bold and the tones enabled`, async (t) => {
        const page = await load(t, platform, { slide: FIGURES });
        const word = await rect(page, `(() => { const p = Reveal.getCurrentSlide().querySelector(':scope > p'); const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { const i = n.data.indexOf('Export'); if (i >= 0) { const r = document.createRange(); r.setStart(n, i + 1); r.setEnd(n, i + 2); return r; } } return null; })()`);
        await click(page, word, { count: 2 });
        await wait(page);
        // a double click takes the space after the word on Windows, and not on the Mac
        assert.match(await page.evaluate('getSelection().toString()'), /^Export ?$/);
        await press(page, 'Mod+B');
        await wait(page, 400);
        assert.equal((await labels(page))[0], 'Undo Bold');
        if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
        await wait(page);
        await click(page, await tab(page, 'Arrange'));
        await wait(page);
        await click(page, await center(page, '#beeson-edit-num-x'));
        await wait(page);
        if (how === 'toolbar') await click(page, await center(page, '[data-command="edit.undo"]'));
        else await press(page, 'Mod+Z');
        await wait(page, 600);
        assert.ok((await render(page)) === page.source, 'the undo does not give the file back');
        assert.equal((await state(page, 'text.bold')).enabled, true);
        await click(page, await tab(page, 'Text'));
        await wait(page);
        const red = await rect(page, `[...document.querySelectorAll('.beeson-edit-inspector .ed-swatches button')].find((b) => /red/i.test(b.title))`);
        assert.ok(red, 'the Text pane does not have a Red swatch');
        assert.equal(await page.evaluate(`[...document.querySelectorAll('.beeson-edit-inspector .ed-swatches button')].filter((b) => b.disabled || b.getAttribute('aria-disabled') === 'true').length`), 0);
        await click(page, red);
        await wait(page, 500);
        assert.ok((await render(page)).includes('tone-red'), 'Red was not applied');
        assert.equal((await labels(page))[0], 'Undo Text Color');
        await undo(page);
        await wait(page, 300);
        assert.ok((await render(page)) === page.source, 'the undo of Red does not give the file back');
        assert.deepEqual(errors(page), []);
      });
    }
  }
});
