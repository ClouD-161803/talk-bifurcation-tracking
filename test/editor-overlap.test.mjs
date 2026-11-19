import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { resolve } from 'node:path';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { arrange } from '../src/editor/commands/layout.ts';
import { center, clickText, drag, press, saveAndReopen } from './helpers/editor.mjs';

describe('a text over a figure after Change Layout', () => {
  const DECK = 'test-deck.html';
  const STEPS = 2;
  const FIGURES = 4;
  const PLATFORMS = ['mac', 'other'];
  const DARK_FILE = resolve('demo/figure-dark.png');
  const LIGHT_FILE = resolve('demo/figure-light.png');

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
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');

  const boxes = (page, selector) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present, .reveal .slides > section > section.present');
  const s = slide.getBoundingClientRect();
  const k = s.width / slide.offsetWidth;
  return [...slide.querySelectorAll(${js(selector)})].filter((e) => e.getClientRects().length).map((e) => {
    const r = e.getBoundingClientRect();
    return { left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k };
  });
})()`);
  const meets = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

  async function load(t, platform, { deck = DECK, n = 0, size = { width: 1600, height: 1000 }, query = '' } = {}) {
    const page = await browser.newPage(size);
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}${query}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  async function checkEdit(page, before, name) {
    const edited = await render(page);
    assert.notEqual(edited, before);
    await undo(page);
    assert.equal(await render(page), before);
    await redo(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, name);
    assert.equal(text, edited);
    return edited;
  }

  async function choose(page, paths) {
    await page.waitFor(`!!document.querySelector('input.beeson-media-input')`);
    const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('input.beeson-media-input')` });
    await page.send('DOM.setFileInputFiles', { files: paths, objectId: result.objectId });
  }

  async function dropFiles(page, at, paths) {
    const data = { items: [], files: paths, dragOperationsMask: 1 };
    await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: at.x, y: at.y, data });
    await page.send('Input.dispatchDragEvent', { type: 'dragOver', x: at.x, y: at.y, data });
    const outline = await page.evaluate(`(() => { const b = document.querySelector('.beeson-drop'); return b && !b.hidden ? b.textContent : null; })()`);
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: at.x, y: at.y, data });
    return outline;
  }

  const waitText = (page, text) => page.waitFor(`window.BeesonEditor.render().includes(${js(text)})`, 30000);
  const tabs = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-inspector .ed-tabs button')].map((t) => t.textContent.trim())`);

  async function saveInto(page, folder) {
    const saved = await page.evaluate(`(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(${js(folder)}, { create: true });
    const deck = await dir.getFileHandle('deck.html', { create: true });
    window.showDirectoryPicker = async () => dir;
    window.BeesonEditor.attach(deck);
    await window.BeesonEditor.save();
    const files = [];
    try {
      for await (const [name] of (await dir.getDirectoryHandle('media')).entries()) files.push(name);
    } catch {}
    return { text: await (await deck.getFile()).text(), files: files.sort() };
  })()`);
    const status = await page.evaluate(`window.BeesonEditor.open(${js(saved.text)})`);
    assert.deepEqual(status.problems, []);
    return saved;
  }

  for (const platform of PLATFORMS) {
    test(`a new table beside the list of a slide with a backdrop is put in the free space over the backdrop (${platform})`, async (t) => {
      const page = await load(t, platform, { n: STEPS });
      const before = await render(page);
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await frames(page);
      const [table] = await boxes(page, ':scope > table');
      assert.ok(table, 'no table was inserted');
      for (const b of await boxes(page, ':scope > ul > li, :scope > p, :scope > h2')) {
        assert.ok(!meets(table, b), `the table at ${js(table)} lies over a text at ${js(b)}`);
      }
      await checkEdit(page, before, `r12-4-table-${platform}.html`);
      assert.deepEqual(page.errors, []);
    });

    test(`a text laid over the figure of its slide by a change of the layout is marked and named in the status (${platform})`, async (t) => {
      for (const [id, said] of [['slide.layout.wide', /\d+ texts? (is|are) under a picture/], ['slide.layout.title', /\d+ texts? (is|are) under a picture/], ['slide.layout.closing', /\d+ texts? (is|are) over a picture/]]) {
        const page = await load(t, platform, { n: FIGURES });
        assert.equal((await page.evaluate('window.BeesonEditor.status()')).overflow, 0, 'the slide is reported before the change');
        await exec(page, id);
        await frames(page);
        await frames(page);
        const s = await page.evaluate('window.BeesonEditor.status()');
        assert.ok(s.overflow > 0, `after ${id}, the texts over the figure are not counted`);
        assert.match(s.message, said, `after ${id}, the status reads ${s.message}`);
        assert.ok(await page.evaluate(`document.querySelectorAll('.reveal section.present .beeson-overflow').length > 0`));
        await undo(page);
        await frames(page);
        await frames(page);
        assert.equal((await page.evaluate('window.BeesonEditor.status()')).overflow, 0, `after an undo of ${id}, the slide is still reported`);
      }
    });

    test(`a picture hidden by Dark in light mode keeps its Image pane, and a drop or Replace adds its twin for light mode (${platform})`, async (t) => {
      for (const how of ['drop', 'replace']) {
        const page = await load(t, platform, { n: STEPS, query: '&theme=light' });
        const insert = page.evaluate(`window.BeesonEditor.exec('insert.image').then(() => true)`);
        await choose(page, [DARK_FILE]);
        await insert;
        await waitText(page, 'media/figure-dark.png');
        await frames(page);
        await exec(page, 'figure.mode.dark');
        await frames(page);
        const before = await render(page);
        assert.match(before, /<img src="media\/figure-dark.png" class="for-dark"/);
        assert.ok((await tabs(page)).includes('Image'), `the inspector shows only ${await tabs(page)}`);
        const replace = await page.evaluate(`window.BeesonEditor.state('media.replace')`);
        assert.equal(replace.enabled, true);
        assert.match(replace.label, /Light Mode/);
        assert.equal((await page.evaluate(`window.BeesonEditor.state('figure.mode.both')`)).enabled, true);
        if (how === 'drop') {
          const at = await page.evaluate(`(() => { const f = window.BeesonEditor.selection()[0]; const r = f.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
          const outline = await dropFiles(page, at, [LIGHT_FILE]);
          assert.match(outline ?? '', /Light Mode/);
        } else {
          const run = page.evaluate(`window.BeesonEditor.exec('media.replace').then(() => true)`);
          await choose(page, [LIGHT_FILE]);
          await run;
        }
        await waitText(page, 'media/figure-light.png');
        await frames(page);
        const edited = await render(page);
        assert.match(edited, /<img src="media\/figure-dark.png" class="for-dark">\s*<img src="media\/figure-light.png" class="for-light">/);
        assert.equal(edited.split('<figure').length, before.split('<figure').length, 'the file was added as a new figure');
        assert.equal(await page.evaluate(`[...document.querySelectorAll('.reveal section.present img.for-light')].filter((e) => e.getBoundingClientRect().width > 0).length`), 1);
        await undo(page);
        assert.equal(await render(page), before);
        await redo(page);
        assert.equal(await render(page), edited);
        const saved = await saveInto(page, `r12-4-pair-${how}-${platform}`);
        assert.equal(saved.text, edited);
        assert.deepEqual(saved.files, ['figure-dark.png', 'figure-light.png']);
        assert.deepEqual(page.errors, []);
      }
    });

    test(`a picture is given a caption by the Caption switch of the Image pane, and the caption is typed into (${platform})`, async (t) => {
      const page = await load(t, platform, { n: STEPS });
      const insert = page.evaluate(`window.BeesonEditor.exec('insert.image').then(() => true)`);
      await choose(page, [DARK_FILE]);
      await insert;
      await waitText(page, 'media/figure-dark.png');
      await frames(page);
      const before = await render(page);
      const box = await page.evaluate(`(() => [...document.querySelectorAll('.beeson-edit-inspector label')].some((l) => l.textContent.trim() === 'Caption'))()`);
      assert.ok(box, 'the Image pane does not have a Caption switch');
      const state = await page.evaluate(`window.BeesonEditor.state('figure.caption')`);
      assert.deepEqual([state.enabled, state.checked], [true, false]);
      await exec(page, 'figure.caption');
      await frames(page);
      await page.send('Input.insertText', { text: 'A new caption' });
      await frames(page);
      const edited = await render(page);
      assert.match(edited, /<img src="media\/figure-dark.png"[^>]*>\s*<figcaption class="caption">A new caption<\/figcaption>\s*<\/figure>/);
      assert.equal((await page.evaluate(`window.BeesonEditor.state('figure.caption')`)).checked, true);
      await undo(page);
      assert.equal(await render(page), before);
      await redo(page);
      assert.equal(await render(page), edited);
      const saved = await saveInto(page, `r12-4-caption-${platform}`);
      assert.equal(saved.text, edited);
      await page.evaluate(`Reveal.slide(${STEPS})`);
      await frames(page);
      await clickText(page, '.reveal section.present > figure img');
      await frames(page);
      await exec(page, 'figure.caption');
      assert.equal(await render(page), before);
      assert.deepEqual(page.errors, []);
    });

    test(`a new Content slide holds the paragraph and the list of its tile (${platform})`, async (t) => {
      const page = await load(t, platform, { n: STEPS });
      const before = await render(page);
      await exec(page, 'slide.new.content');
      await frames(page);
      const made = await render(page);
      await undo(page);
      assert.equal(await render(page), before);
      await redo(page);
      assert.equal(await render(page), made);
      await frames(page);
      const slide = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides > section.present'); return { tags: [...s.children].filter((c) => !c.hasAttribute('data-generated') && !c.matches('aside.notes')).map((c) => c.localName + (c.className ? '.' + [...c.classList].filter((k) => !k.startsWith('beeson')).join('.') : '')), items: s.querySelectorAll(':scope > ul > li').length }; })()`);
      assert.deepEqual(slide.tags.filter((x) => !x.startsWith('div.run') && !x.startsWith('div.foot')), ['h2', 'p', 'ul']);
      const { sampleText } = await import('../src/editor/model/templates.ts');
      assert.match(sampleText('content'), /<section>\s*<h2>[^<]+<\/h2>\s*<p>[^<]+<\/p>\s*<ul>(\s*<li>[^<]+<\/li>)+\s*<\/ul>\s*<div class="figure-box"[^>]*><\/div>\s*<\/section>/, 'the Content tile draws the texts of a new slide and the place of its zone');
      assert.equal(slide.items, 1);
      await clickText(page, '.reveal section.present > ul > li');
      await page.send('Input.insertText', { text: 'A first point' });
      await press(page, 'Enter');
      await page.send('Input.insertText', { text: 'A second point' });
      await frames(page);
      const edited = await render(page);
      assert.match(edited, /<li>A first point<\/li>\s*<li>A second point<\/li>/);
      const { text } = await saveAndReopen(page, `r12-4-content-${platform}.html`);
      assert.equal(text, edited);
      assert.deepEqual(page.errors, []);
    });

    test(`a new content slide changed to Figure holds the plate, the heading, and the caption of a new figure slide (${platform})`, async (t) => {
      const page = await load(t, platform, { n: STEPS });
      await exec(page, 'slide.new.content');
      await frames(page);
      const before = await render(page);
      await exec(page, 'slide.layout.figure');
      await frames(page);
      await frames(page);
      const tags = await page.evaluate(`[...document.querySelector('.reveal .slides > section.present').children].filter((c) => !c.hasAttribute('data-generated') && !c.matches('aside.notes')).map((c) => c.localName + (c.classList.contains('caption') ? '.caption' : c.classList.contains('plate') ? '.plate' : ''))`);
      assert.deepEqual(tags, ['div.plate', 'h2', 'p.caption']);
      const s = await page.evaluate('window.BeesonEditor.status()');
      assert.equal(s.overflow, 0, `the status reads ${s.message}`);
      const [caption] = await boxes(page, ':scope > p.caption');
      assert.ok(caption && caption.bottom <= 1080 && caption.right - caption.left > 1, `the caption placeholder is not shown: ${js(caption)}`);
      const edited = await render(page);
      await undo(page);
      assert.equal(await render(page), before);
      await redo(page);
      assert.equal(await render(page), edited);
      await exec(page, 'slide.layout.content');
      assert.equal(await render(page), before);
      assert.deepEqual(page.errors, []);
    });

    test(`after Change Layout to Split on slide 3, a list over the footnote of the panel is reported (${platform})`, async (t) => {
      const page = await load(t, platform, { n: STEPS });
      await exec(page, 'slide.layout.split');
      await frames(page);
      await frames(page);
      const [foot] = await boxes(page, ':scope > .text-column > .foot');
      assert.ok(foot, 'the footnote is not in the panel');
      const over = (await boxes(page, ':scope > .text-column > ul > li, :scope > .text-column > p')).filter((b) => meets(b, foot));
      const s = await page.evaluate('window.BeesonEditor.status()');
      if (over.length) {
        assert.ok(s.overflow >= over.length, `${over.length} texts lie over the footnote at ${js(foot)}, and the status reads ${s.message}`);
        assert.match(s.message, /past the slide or into its footnote/);
      }
      assert.deepEqual(page.errors, []);
    });
    test(`the Steps pane names a new picture by the name of its file, not by its object URL (${platform})`, async (t) => {
      const page = await load(t, platform, { n: STEPS });
      const insert = page.evaluate(`window.BeesonEditor.exec('insert.image').then(() => true)`);
      await choose(page, [DARK_FILE]);
      await insert;
      await waitText(page, 'media/figure-dark.png');
      if (!(await page.evaluate(`window.BeesonEditor.state('view.steps').checked`))) await exec(page, 'view.steps');
      await frames(page);
      const rows = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-side [aria-label]')].map((r) => r.getAttribute('aria-label')).filter((l) => /Figure/.test(l))`);
      assert.ok(rows.some((l) => l.includes('figure-dark.png')), `the rows read ${js(rows)}`);
      assert.ok(!rows.some((l) => /[0-9a-f]{8}-[0-9a-f]{4}-/.test(l)), `a row names the object URL: ${js(rows)}`);
      assert.deepEqual(page.errors, []);
    });
    test(`a duplicate or a layout change of a slide with an unsaved new picture does not ask the server for its file (${platform})`, async (t) => {
      for (const how of ['edit.duplicate', 'slide.duplicate', 'slide.layout.split']) {
        const page = await load(t, platform, { n: STEPS });
        const insert = page.evaluate(`window.BeesonEditor.exec('insert.image').then(() => true)`);
        await choose(page, [DARK_FILE]);
        await insert;
        await waitText(page, 'media/figure-dark.png');
        await frames(page);
        if (how === 'slide.layout.split') await exec(page, 'slide.duplicate');
        await exec(page, how);
        await page.evaluate('new Promise((d) => setTimeout(d, 500))');
        const asked = await page.evaluate(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('media/figure-dark'))`);
        assert.deepEqual(asked, [], `after ${how}`);
        assert.deepEqual(page.errors, [], `after ${how}`);
        await page.close();
      }
    });
    test(`a new table in the empty slot of a new Figure slide takes the width of the slot (${platform})`, async (t) => {
      for (const how of ['new', 'change']) {
        const page = await load(t, platform, { n: STEPS });
        await exec(page, how === 'new' ? 'slide.new.figure' : 'slide.new.content');
        if (how === 'change') await exec(page, 'slide.layout.figure');
        await frames(page);
        const before = await render(page);
        await exec(page, 'insert.table', { rows: 3, columns: 3 });
        await frames(page);
        const m = await page.evaluate(`(() => { const t = document.querySelector('.reveal section.present table'); const slot = t.parentElement; const s = getComputedStyle(slot); const r = slot.getBoundingClientRect(); const k = r.width / slot.offsetWidth; return { slot: slot.className, table: t.getBoundingClientRect().width / k, inner: slot.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight), widths: [...t.rows[0].cells].map((c) => c.style.width) }; })()`);
        assert.ok(m.table > m.inner * 0.95, `after ${how}, the table is ${m.table} px wide in a slot ${m.inner} px wide (${m.slot})`);
        assert.ok(m.widths.every((w) => /px$/.test(w)), `after ${how}, the first row has the widths ${js(m.widths)}`);
        await checkEdit(page, before, `a table in the slot after ${how}`);
        assert.deepEqual(page.errors, []);
      }
    });
  }
});

describe('empty captions and the report of a table', () => {
  const DECK = 'test-deck.html';
  const STEPS = 2;
  const FIGURES = 4;
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATFORMS = ['mac', 'other'];
  const DARK_FILE = resolve('demo/figure-dark.png');

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
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
  const status = (page) => page.evaluate('window.BeesonEditor.status()');

  const box = (page, selector) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const s = slide.getBoundingClientRect();
  const k = s.width / slide.offsetWidth;
  const e = slide.querySelector(${js(selector)});
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k };
})()`);

  async function load(t, platform, n, query = '', deck = DECK) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}${query}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(readFileSync(deck, 'utf8'))})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(typeof n === 'number' ? `Reveal.slide(${n})` : `Reveal.slide([...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.querySelector('h2')?.textContent === ${js(n)}))`);
    await frames(page);
    return page;
  }

  async function choose(page, paths) {
    await page.waitFor(`!!document.querySelector('input.beeson-media-input')`);
    const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('input.beeson-media-input')` });
    await page.send('DOM.setFileInputFiles', { files: paths, objectId: result.objectId });
  }

  for (const platform of PLATFORMS) {
    test(`the empty caption of the Caption switch is drawn under the picture with its prompt and the caret (${platform})`, async (t) => {
      const page = await load(t, platform, STEPS);
      const insert = page.evaluate(`window.BeesonEditor.exec('insert.image').then(() => true)`);
      await choose(page, [DARK_FILE]);
      await insert;
      await page.waitFor(`window.BeesonEditor.render().includes('media/figure-dark.png')`, 30000);
      await frames(page);
      await exec(page, 'figure.caption');
      await frames(page);
      const img = await box(page, 'figure img');
      const cap = await box(page, 'figure > figcaption');
      assert.ok(img && cap, `no caption: ${js({ img, cap })}`);
      assert.ok(cap.bottom <= 1080, `the empty caption is drawn past the slide: ${js(cap)}`);
      assert.ok(Math.abs(cap.top - img.bottom - 16) < 2, `the empty caption is not 16 px under the picture: ${js({ img, cap })}`);
      const shown = await page.evaluate(`(() => {
      const c = document.querySelector('.reveal section.present figure > figcaption');
      const p = getComputedStyle(c, '::before');
      const sel = getSelection();
      return { prompt: p.content, caret: !!sel.anchorNode && c.contains(sel.anchorNode) };
    })()`);
      assert.deepEqual(shown, { prompt: '"Click to add a caption"', caret: true });
      const s = await status(page);
      assert.equal(s.overflow, 0, `the empty caption is reported: ${s.message}`);
      assert.ok(!/past the slide| (under|over) a /.test(s.message), s.message);
      await page.send('Input.insertText', { text: 'A' });
      await frames(page);
      const typed = await box(page, 'figure > figcaption');
      assert.ok(Math.abs(typed.top - cap.top) < 2, `the caption moves at its first input: ${js({ cap, typed })}`);
      assert.deepEqual(page.errors, []);
    });

    test(`a new table drawn over a text is reported (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await frames(page);
      const s = await status(page);
      assert.ok(s.overflow > 0 && /\d+ texts? (is|are) under a table/.test(s.message), `the table is not reported: ${js({ overflow: s.overflow, message: s.message })}`);
      const marked = await page.evaluate(`[...document.querySelectorAll('.reveal section.present .beeson-overflow')].map((e) => e.localName)`);
      assert.ok(marked.length > 0 && !marked.some((n) => n === 'th' || n === 'td'), `the cells of the table are marked: ${js(marked)}`);
      assert.deepEqual(page.errors, []);
    });

    test(`the button of the well names the choice of the twin of a picture hidden by its mode (${platform})`, async (t) => {
      const page = await load(t, platform, STEPS, '&theme=light');
      const insert = page.evaluate(`window.BeesonEditor.exec('insert.image').then(() => true)`);
      await choose(page, [DARK_FILE]);
      await insert;
      await page.waitFor(`window.BeesonEditor.render().includes('media/figure-dark.png')`, 30000);
      await frames(page);
      const label = () => page.evaluate(`(() => { const b = document.querySelector('.beeson-edit-inspector .ed-well .ed-btn'); return b ? { text: b.textContent.trim(), title: b.title } : null; })()`);
      assert.equal((await label())?.text, 'Replace…');
      await exec(page, 'figure.mode.dark');
      await frames(page);
      const state = await page.evaluate(`window.BeesonEditor.state('media.replace')`);
      assert.equal(state.label, 'Choose Image for Light Mode…');
      const b = await label();
      assert.equal(b?.text, 'Choose for Light Mode…', `the button reads ${js(b)}`);
      assert.equal(b.title, state.label);
      assert.deepEqual(page.errors, []);
    });

    test(`a display formula whose glyphs end left of the picture is not reported over it (${platform})`, async (t) => {
      for (const id of ['slide.layout.wide', 'slide.layout.title']) {
        const page = await load(t, platform, 'Math, an ordered list, and a zone', '', LAYOUTS);
        await exec(page, id);
        await frames(page);
        await frames(page);
        const m = await page.evaluate(`(() => {
        const slide = document.querySelector('.reveal .slides > section.present');
        const math = slide.querySelector('div.math');
        const glyphs = math.querySelector('mjx-container svg').getBoundingClientRect();
        const img = [...slide.querySelectorAll('figure img')].find((i) => i.getClientRects().length).getBoundingClientRect();
        return { marked: math.classList.contains('beeson-overflow'), clear: glyphs.right < img.left, wide: math.getBoundingClientRect().right > img.left };
      })()`);
        assert.deepEqual([m.clear, m.wide], [true, true], `the slide does not show the case of D19 after ${id}: ${js(m)}`);
        assert.equal(m.marked, false, `after ${id}, the formula is reported over the figure`);
        assert.deepEqual(page.errors, []);
      }
    });

    test(`a caption beside the end of the footnote text is not reported as running into it (${platform})`, async (t) => {
      const page = await load(t, platform, STEPS);
      const insert = page.evaluate(`window.BeesonEditor.exec('insert.image').then(() => true)`);
      await choose(page, [DARK_FILE]);
      await insert;
      await page.waitFor(`window.BeesonEditor.render().includes('media/figure-dark.png')`, 30000);
      await frames(page);
      await exec(page, 'figure.caption');
      await frames(page);
      await page.send('Input.insertText', { text: 'A new caption' });
      await frames(page);
      const m = await page.evaluate(`(() => {
      const slide = document.querySelector('.reveal .slides > section.present');
      const foot = slide.querySelector(':scope > .foot');
      const cap = slide.querySelector('figure > figcaption').getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(foot);
      const text = Math.max(...[...range.getClientRects()].map((r) => r.right));
      const f = foot.getBoundingClientRect();
      return { boxMeets: cap.left < f.right && cap.bottom > f.top, textClear: text < cap.left };
    })()`);
      assert.deepEqual(m, { boxMeets: true, textClear: true }, 'the slide does not show the case of D29');
      const s = await status(page);
      assert.equal(s.overflow, 0, `the caption is reported: ${s.message}`);
      assert.deepEqual(page.errors, []);
    });

    test(`a footnote drawn over a code box is marked with the code box (${platform})`, async (t) => {
      const page = await load(t, platform, 'Code boxes, you guessed it...');
      await exec(page, 'slide.layout.section');
      await frames(page);
      await frames(page);
      const m = await page.evaluate(`(() => {
      const slide = document.querySelector('.reveal .slides > section.present');
      const a = slide.querySelector('pre').getBoundingClientRect();
      const foot = slide.querySelector('.foot');
      const b = foot.getBoundingClientRect();
      return { meets: a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right, foot: foot.classList.contains('beeson-overflow'), pre: slide.querySelector('pre').classList.contains('beeson-overflow') || !!slide.querySelector('pre .beeson-overflow, pre.beeson-overflow') };
    })()`);
      assert.equal(m.meets, true, 'the slide does not show the case of D20');
      assert.deepEqual([m.foot, m.pre], [true, true], `the marks are ${js(m)}`);
      const s = await status(page);
      assert.ok(s.overflow >= 2, `the status reads ${s.message}`);
      assert.deepEqual(page.errors, []);
    });
    test(`an empty new code box over a text is not reported before it has a text (${platform})`, async (t) => {
      const page = await load(t, platform, 2);
      await exec(page, 'insert.code');
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelectorAll('.reveal section.present pre.beeson-pending').length`), 1, 'a pending code box was not inserted');
      assert.equal(await page.evaluate(`document.querySelectorAll('.reveal section.present .beeson-overflow').length`), 0, 'a text under the empty code box is marked');
      assert.equal((await status(page)).overflow, 0);
      assert.deepEqual(page.errors, []);
    });
  }
});

describe('when and how an overlap is reported', () => {
  const DECK = 'test-deck.html';
  const PLATFORMS = ['mac', 'other'];
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
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
  const status = (page) => page.evaluate('window.BeesonEditor.status()');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const settle = async (page) => {
    await frames(page);
    await frames(page);
  };

  async function load(t, platform, n) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  const covered = (page, selector) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const figs = [...slide.querySelectorAll(${js(selector)})].filter((f) => f.getClientRects().length).map((f) => ({ f, r: f.getBoundingClientRect() }));
  const meets = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const clip = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
  const name = (el) => el.localName + ':' + el.textContent.trim().slice(0, 16);
  const texts = [...slide.querySelectorAll('[contenteditable="true"]')].filter((el) => !el.closest('aside.notes, .backdrop') && !figs.some(({ f }) => f.contains(el)));
  const under = texts.filter((el) => {
    const box = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    return [...range.getClientRects()].some((l) => l.width > 1 && figs.some(({ r }) => meets(clip(l, box), r)));
  });
  return { under: under.map(name), marked: [...slide.querySelectorAll('.beeson-overflow')].map(name) };
})()`);

  const onTop = (page, selector, text) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const f = [...slide.querySelectorAll(${js(selector)})].find((e) => e.getClientRects().length);
  const el = [...slide.querySelectorAll('[contenteditable="true"]')].find((e) => e.localName + ':' + e.textContent.trim().slice(0, 16) === ${js(text)});
  const range = document.createRange();
  range.selectNodeContents(el);
  const a = f.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  for (const l of range.getClientRects()) {
    const x0 = Math.max(l.left, a.left, b.left), x1 = Math.min(l.right, a.right, b.right), y0 = Math.max(l.top, a.top, b.top), y1 = Math.min(l.bottom, a.bottom, b.bottom);
    if (x1 < x0 + 2 || y1 < y0 + 2) continue;
    const hit = document.elementsFromPoint((x0 + x1) / 2, (y0 + y1) / 2).find((e) => f.contains(e) || e === f || el.contains(e));
    return hit ? (f.contains(hit) || hit === f ? 'figure' : 'text') : null;
  }
  return null;
})()`);

  const scaleOf = (page) => page.evaluate(`document.querySelector('.reveal section.present').getBoundingClientRect().width / 1920`);
  const handle = (page) => page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-handle')].find((d) => !d.hidden && d.getClientRects().length).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const lineStart = (page, selector) => page.evaluate(`(() => {
  const el = document.querySelector(${js(selector)});
  const range = document.createRange();
  range.selectNodeContents(el);
  const l = range.getClientRects()[0];
  return { x: l.left + 12, y: l.top + l.height / 2 };
})()`);

  for (const platform of PLATFORMS) {
    test(`a new table over a text is reported by name, and a drag of the table by 30 px takes the report away (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await settle(page);
      const c = await covered(page, ':scope > table');
      assert.ok(c.under.length > 0, 'the new table does not cover a text');
      const n = c.under.length;
      const s = await status(page);
      assert.ok(s.message.includes(`${n} text${n === 1 ? ' is' : 's are'} under a table`), `the status reads ${js(s.message)} for ${js(c.under)}`);
      assert.ok(!/over a figure/.test(s.message), s.message);
      assert.deepEqual(c.marked, c.under, 'the outlined texts are not those under the table');
      assert.equal(await onTop(page, ':scope > table', c.under[0]), 'figure', 'the table is not drawn over the text');
      await undo(page);
      await settle(page);
      assert.equal((await status(page)).overflow, 0, 'the report stays after an undo of the insert');
      await redo(page);
      await settle(page);
      assert.ok((await status(page)).message.includes('under a table'), 'the report is not back after a redo of the insert');
      const k = await scaleOf(page);
      await drag(page, await handle(page), { dx: 30 * k, dy: 0, steps: 8 });
      await settle(page);
      const moved = await covered(page, ':scope > table');
      assert.ok(moved.under.length > 0, 'the table moved by 30 px does not cover a text');
      assert.notEqual(await render(page), page.source);
      const m = await status(page);
      assert.equal(m.overflow, 0, `the table moved by the user is reported: ${js(m.message)}`);
      assert.ok(!/ (under|over) a /.test(m.message), m.message);
      assert.deepEqual(moved.marked, []);
      await undo(page);
      await undo(page);
      await settle(page);
      assert.equal(await render(page), page.source);
      const u = await status(page);
      assert.equal(u.overflow, 0, `after an undo of the drag and of the insert the status reads ${js(u.message)}`);
      assert.deepEqual((await covered(page, ':scope > figure img')).marked, []);
      assert.deepEqual(page.errors, []);
    });

    test(`the figure of slide 5 dragged over the text column is not reported (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      const img = '.reveal section.present figure img';
      await clickText(page, img);
      await frames(page);
      const at = await page.evaluate(`(() => { const r = [...document.querySelectorAll(${js(img)})].find((i) => i.getClientRects().length).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      const k = await scaleOf(page);
      await drag(page, at, { dx: -530 * k, dy: -40 * k, steps: 12 });
      await settle(page);
      assert.notEqual(await render(page), page.source);
      const c = await covered(page, ':scope > figure img');
      assert.ok(c.under.length >= 3, `the figure is not over the text column: ${js(c.under)}`);
      const s = await status(page);
      assert.equal(s.overflow, 0, `the status reads ${js(s.message)}`);
      assert.ok(!/ (under|over) a /.test(s.message), s.message);
      assert.deepEqual(c.marked, []);
      assert.deepEqual(page.errors, []);
    });

    test(`a change of layout that leaves texts under a picture is reported, and a text or the picture moved leaves the report (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await exec(page, 'slide.layout.wide');
      await settle(page);
      const c = await covered(page, ':scope > figure img');
      assert.ok(c.under.length >= 2, `the layout Wide does not leave two texts under the picture: ${js(c.under)}`);
      assert.equal(await onTop(page, ':scope > figure img', c.under[0]), 'figure');
      const n = c.under.length;
      assert.ok((await status(page)).message.includes(`${n} texts are under a picture`), (await status(page)).message);
      assert.deepEqual(c.marked, c.under);
      await clickText(page, await lineStart(page, '.reveal section.present > p'));
      await press(page, 'Escape');
      await press(page, 'ArrowDown');
      await settle(page);
      const p = (await covered(page, ':scope > figure img'));
      const para = p.under.find((x) => x.startsWith('p:'));
      assert.ok(para, `the nudged paragraph is not under the picture: ${js(p.under)}`);
      assert.ok(!p.marked.includes(para), `the nudged paragraph is outlined: ${js(p.marked)}`);
      assert.deepEqual(p.marked, p.under.filter((x) => x !== para), 'the other texts left the report');
      const rest = p.under.length - 1;
      assert.ok((await status(page)).message.includes(`${rest} text${rest === 1 ? ' is' : 's are'} under a picture`), (await status(page)).message);
      await clickText(page, '.reveal section.present figure img');
      await press(page, 'ArrowLeft');
      await settle(page);
      const f = await covered(page, ':scope > figure img');
      assert.ok(f.under.length >= 2, `the nudged picture is not over the texts: ${js(f.under)}`);
      assert.deepEqual(f.marked, []);
      assert.ok(!/ (under|over) a /.test((await status(page)).message), (await status(page)).message);
      assert.deepEqual(page.errors, []);
    });

    test(`a text drawn over a picture after a change of layout is named before the picture (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await clickText(page, await lineStart(page, '.reveal section.present > p'));
      await press(page, 'Escape');
      await exec(page, 'arrange.order.front');
      await settle(page);
      assert.notEqual(await render(page), page.source, 'Bring to Front did not act on the paragraph');
      await exec(page, 'slide.layout.wide');
      await settle(page);
      const c = await covered(page, ':scope > figure img');
      const para = c.under.find((x) => x.startsWith('p:'));
      assert.ok(para && c.under.length >= 2, `the layout Wide does not leave the paragraph and a list item under the picture: ${js(c.under)}`);
      assert.equal(await onTop(page, ':scope > figure img', para), 'text');
      const rest = c.under.length - 1;
      const s = await status(page);
      assert.ok(s.message.includes(`${rest} text${rest === 1 ? ' is' : 's are'} under a picture. 1 text is over a picture`), s.message);
      assert.deepEqual(c.marked, c.under);
      assert.deepEqual(page.errors, []);
    });

    test(`a picture and a QR code over texts after a change of layout are named in one sentence (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await exec(page, 'insert.qr');
      await settle(page);
      const p = await page.evaluate(`(() => {
      const slide = document.querySelector('.reveal .slides > section.present');
      const s = slide.getBoundingClientRect();
      const k = s.width / slide.offsetWidth;
      const r = slide.querySelector(':scope > p').getBoundingClientRect();
      return { x: Math.round((r.left - s.left) / k + 100), y: Math.round((r.top - s.top) / k) };
    })()`);
      await exec(page, 'arrange.setPosition', p);
      await settle(page);
      assert.ok((await covered(page, '.qr')).under.length > 0, 'the QR code is not over a text');
      assert.equal((await status(page)).overflow, 0, 'an overlap made by a typed position is reported');
      await exec(page, 'slide.layout.wide');
      await settle(page);
      const qr = await covered(page, '.qr');
      const both = await covered(page, ':scope > figure img, .qr');
      assert.ok(qr.under.length > 0, `the QR code is not over a text after Wide: ${js(qr.under)}`);
      const n = both.under.length;
      const s = await status(page);
      assert.match(s.message, new RegExp(`${n} texts are under a (picture and a QR code|QR code and a picture)`), `the status reads ${js(s.message)} for ${js(both.under)}`);
      assert.deepEqual(both.marked, both.under);
      assert.deepEqual(page.errors, []);
    });
  }

  async function closing(t, platform) {
    const page = await load(t, platform, 0);
    await page.evaluate(`Reveal.slide([...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.matches('.closing')))`);
    await frames(page);
    await exec(page, 'insert.qr');
    await frames(page);
    return page;
  }

  const boxes = (page) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const s = slide.getBoundingClientRect();
  const k = s.width / slide.offsetWidth;
  const px = (r) => ({ left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k });
  const h1 = slide.querySelector('h1');
  const range = document.createRange();
  range.selectNodeContents(h1);
  const codes = slide.querySelectorAll('.qr');
  return { h1: px(h1.getBoundingClientRect()), line: px(range.getClientRects()[0]), qr: px(codes[codes.length - 1].getBoundingClientRect()), marked: h1.classList.contains('beeson-overflow') };
})()`);

  async function put(page, dy) {
    const b = await boxes(page);
    await exec(page, 'arrange.setPosition', { x: Math.round(b.h1.left + 40), y: Math.round(b.h1.top - (b.qr.bottom - b.qr.top) + dy) });
    await frames(page);
    const typed = (await status(page)).overflow;
    await exec(page, 'slide.layout.title');
    await settle(page);
    return { ...(await boxes(page)), typed };
  }

  for (const platform of PLATFORMS) {
    test(`a QR code that ends at the upper edge of a heading is not reported as under its text (${platform})`, async (t) => {
      const page = await closing(t, platform);
      const b = await put(page, 0);
      assert.ok(Math.abs(b.qr.bottom - b.h1.top) < 1, `the QR code does not end at the heading: ${js(b)}`);
      assert.ok(b.qr.right > b.line.left + 2 && b.qr.left < b.line.right - 2, `the QR code is not over the text of the heading: ${js(b)}`);
      assert.ok(b.line.top < b.h1.top - 2, `the line of the heading is inside its box: ${js(b)}`);
      const s = await status(page);
      assert.equal(s.overflow, 0, `the heading is reported: ${js(s.message)}`);
      assert.equal(b.marked, false, 'the heading is outlined');
      assert.deepEqual(page.errors, []);
    });

    test(`a QR code that reaches 10 px into the box of a heading is reported after a change of layout (${platform})`, async (t) => {
      const page = await closing(t, platform);
      const b = await put(page, 10);
      assert.equal(b.typed, 0, 'an overlap made by a typed position is reported');
      assert.ok(Math.abs(b.qr.bottom - b.h1.top - 10) < 1, `the QR code does not reach into the heading: ${js(b)}`);
      const s = await status(page);
      assert.equal(s.overflow, 1, `the heading is not reported: ${js(s.message)}`);
      assert.match(s.message, /1 text is (under|over) a QR code/);
      assert.equal(b.marked, true, 'the heading is not outlined');
      assert.deepEqual(page.errors, []);
    });
  }
});
