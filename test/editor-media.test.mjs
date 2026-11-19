import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { textProblems, themeClasses } from '../src/editor/model/scope.ts';
import { click, press } from './helpers/editor.mjs';

const LAYOUTS = 'test/pages/editor-layouts.html';
const PLATFORMS = ['mac', 'other'];
const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
const PANEL = '#beeson-edit-panel-format';

const IMAGE = resolve('demo/figure-light.png');
const VIDEO = resolve('demo/clip-dark.mp4');
const IMAGE_BYTES = readFileSync(IMAGE).length;
const VIDEO_BYTES = readFileSync(VIDEO).length;

const SPLIT_FIGURE_BOX = '<div class="figure-box"></div>';
const DARK = '<img class="for-dark" src="../../demo/figure-dark.png" alt="A figure, dark version">';
const LIGHT = '<img class="for-light" src="../../demo/figure-light.png" alt="A figure, light version">';
const WHITE_FIGURE = '<img class="white-figure" src="../../demo/figure-light.png" alt="A white raster figure">';
const CLIP = '<video src="../../demo/clip-dark.mp4" poster="../../demo/clip-dark.png" muted loop></video>';

const HIDDEN_DECK = 'test/pages/media-hidden.tmp.html';
const HIDDEN_IMAGE = '<img class="for-dark fragment fade-up faint" src="../../demo/figure-dark.png" style="width: 400px; rotate: 5deg" data-fragment-index="1" alt="A plot">';
const HIDDEN_PDF = '<img class="for-dark fragment" src="../../demo/figure-dark.png" data-pdf="figure.pdf" data-page="2" alt="A page">';
const HIDDEN_VIDEO = '<video class="for-dark fragment play" src="../../demo/clip-dark.mp4" poster="../../demo/clip-dark.png" muted loop data-fragment-index="1"></video>';
function writeHiddenDeck() {
  const layouts = readFileSync(LAYOUTS, 'utf8');
  const head = layouts.slice(0, layouts.indexOf('<div class="slides">') + '<div class="slides">'.length);
  const tail = layouts.slice(layouts.lastIndexOf('</div>\n</div>'));
  const slide = (title, picture) => `<section class="figure">\n  <h2>${title}</h2>\n  <div class="plate">\n    ${picture}\n  </div>\n</section>\n`;
  writeFileSync(HIDDEN_DECK, `${head}\n${slide('A hidden image', HIDDEN_IMAGE)}${slide('A hidden video', HIDDEN_VIDEO)}${slide('A hidden PDF figure', HIDDEN_PDF)}${tail}`);
}

let browser;
let server;
before(async () => {
  browser = await launch({ offline: false });
  server = await serve('.');
});
after(async () => {
  await browser?.close();
  server?.close();
  rmSync(HIDDEN_DECK, { force: true });
});

let last = null;

const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)})`);
const render = (page) => page.evaluate('window.BeesonEditor.render()');
const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
const status = (page) => page.evaluate('window.BeesonEditor.status()');
const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
const url = (platform, deck = LAYOUTS, query = '') => `${server.origin}/${deck}?edit&still&edit-platform=${platform}${query}`;

const CLEAR = `(async () => {
  localStorage.clear();
  await new Promise((done) => { const r = indexedDB.deleteDatabase('beeson-media'); r.onsuccess = r.onerror = r.onblocked = () => done(); });
  const root = await navigator.storage.getDirectory();
  for await (const name of root.keys()) await root.removeEntry(name, { recursive: true });
  return true;
})()`;

const ROWS = `new Promise((done) => { const r = indexedDB.open('beeson-media'); r.onsuccess = () => { const q = r.result.transaction('files').objectStore('files').getAll(); q.onsuccess = () => { done(q.result.map((row) => [row.path, row.blob.size])); r.result.close(); }; }; })`;

const HOLD = `(() => {
  const open = IDBFactory.prototype.open;
  let release;
  const released = new Promise((done) => { release = done; });
  window.__release = () => { release(); return true; };
  window.__writes = [];
  IDBFactory.prototype.open = function (...args) {
    const real = open.apply(this, args);
    return {
      get result() { return real.result; },
      get error() { return real.error; },
      set onupgradeneeded(fn) { real.onupgradeneeded = fn; },
      set onerror(fn) { real.onerror = fn; },
      set onsuccess(fn) { real.onsuccess = () => released.then(fn); },
    };
  };
  for (const name of ['put', 'delete']) {
    const method = IDBObjectStore.prototype[name];
    IDBObjectStore.prototype[name] = function (...args) {
      const write = { name, done: false };
      window.__writes.push(write);
      this.transaction.addEventListener('complete', () => { write.done = true; });
      return method.apply(this, args);
    };
  }
})()`;

async function load(platform, { clear = true, drafts = false, hold = false, deck = LAYOUTS, query = '' } = {}) {
  await last?.close().catch(() => {});
  const page = await browser.newPage({ drafts });
  last = page;
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  if (clear) {
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate(CLEAR);
  }
  if (hold) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: HOLD });
  await page.goto(url(platform, deck, query));
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = readFileSync(deck, 'utf8');
  return page;
}

async function mediaPage(platform, n = 0, options = {}) {
  const page = await load(platform, options);
  const s = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
  assert.deepEqual(s.problems, []);
  if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
  await page.evaluate(`Reveal.slide(${n})`);
  await frames(page);
  return page;
}

const slideWith = (text) => readFileSync(LAYOUTS, 'utf8').split('<section').slice(1).findIndex((s) => s.includes(text));

async function emptyFigureBox(page) {
  await exec(page, 'slide.new.split');
  await frames(page);
  const text = await render(page);
  assert.equal(text.split(SPLIT_FIGURE_BOX).length, 2);
  return text;
}

const centerOf = (page, selector) =>
  page.evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.getBoundingClientRect().width > 0); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

async function dropFiles(page, at, paths) {
  const data = { items: [], files: paths, dragOperationsMask: 1 };
  await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: at.x, y: at.y, data });
  await page.send('Input.dispatchDragEvent', { type: 'dragOver', x: at.x, y: at.y, data });
  const outline = await page.evaluate(`(() => { const b = document.querySelector('.beeson-drop'); return b && !b.hidden ? b.textContent : null; })()`);
  await page.send('Input.dispatchDragEvent', { type: 'drop', x: at.x, y: at.y, data });
  return outline;
}

async function choose(page, paths) {
  await page.waitFor(`!!document.querySelector('input.beeson-media-input')`);
  const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('input.beeson-media-input')` });
  await page.send('DOM.setFileInputFiles', { files: paths, objectId: result.objectId });
}

async function tap(page, name) {
  const at = await page.evaluate(`(() => {
    const b = [...document.querySelectorAll('${PANEL} button')].find((b) => b.textContent.trim() === ${JSON.stringify(name)});
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  assert.ok(at, `the inspector does not have a button ${name}`);
  await click(page, at);
}

const waitText = (page, text) => page.waitFor(`window.BeesonEditor.render().includes(${JSON.stringify(text)})`, 30000);

async function inScope(page) {
  const now = textProblems(await render(page), THEME);
  for (const p of textProblems(page.source, THEME)) now.splice(now.indexOf(p), 1);
  assert.deepEqual(now, []);
}

async function undoRedo(page, before, after) {
  await undo(page);
  assert.equal(await render(page), before);
  await redo(page);
  assert.equal(await render(page), after);
}

const shownFrom = (page, selector, attr = 'src') => page.evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => el.getAttribute(${JSON.stringify(attr)}))`);

const SAVE_INTO = (folder) => `(async () => {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(${JSON.stringify(folder)}, { create: true });
  const deck = await dir.getFileHandle('deck.html', { create: true });
  window.__picked = 0;
  window.showDirectoryPicker = async () => { window.__picked++; return dir; };
  window.BeesonEditor.attach(deck);
  await window.BeesonEditor.save();
  const files = {};
  try {
    const media = await dir.getDirectoryHandle('media');
    for await (const [name, h] of media.entries()) {
      const f = await h.getFile();
      files[name] = { size: f.size, head: [...new Uint8Array(await f.slice(0, 8).arrayBuffer())] };
    }
  } catch {}
  return { text: await (await deck.getFile()).text(), files, picked: window.__picked };
})()`;


const PNG = [137, 80, 78, 71, 13, 10, 26, 10];

async function reopen(page, text) {
  const s = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(text)})`);
  assert.deepEqual(s.problems, []);
  assert.equal(await render(page), text);
}

for (const platform of PLATFORMS) {
  test(`${platform}: an image dropped onto an empty zone is written into media/ at the save`, async () => {
    const page = await mediaPage(platform);
    const before = await emptyFigureBox(page);
    const outline = await dropFiles(page, await centerOf(page, '.reveal section.present > .figure-box'), [IMAGE]);
    assert.match(outline ?? '', /^Add (Image|Media) Here$/);
    await waitText(page, 'media/figure-light.png');
    const after = await render(page);
    assert.equal(after, before.replace(SPLIT_FIGURE_BOX, '<div class="figure-box">\n    <img src="media/figure-light.png">\n  </div>'));
    assert.match((await shownFrom(page, '.reveal section.present > .figure-box > img'))[0], /^blob:/);
    assert.equal((await status(page)).undo, true);
    await undoRedo(page, before, after);
    await inScope(page);
    await page.evaluate(`window.BeesonEditor.exec('shell.format')`).catch(() => {});
    const saved = await page.evaluate(SAVE_INTO(`drop-${platform}`));
    assert.equal(saved.text, after);
    assert.equal(saved.picked, 1);
    assert.deepEqual(Object.keys(saved.files), ['figure-light.png']);
    assert.equal(saved.files['figure-light.png'].size, IMAGE_BYTES);
    assert.deepEqual(saved.files['figure-light.png'].head, PNG);
    assert.match((await status(page)).message, /1 new file written into media/);
    await reopen(page, saved.text);
    assert.equal((await page.evaluate(SAVE_INTO(`drop-${platform}`))).picked, 0);
    assert.deepEqual(page.errors, []);
  });

  test(`${platform}: an undo before the save leaves nothing on the disk`, async () => {
    const page = await mediaPage(platform);
    const before = await emptyFigureBox(page);
    await dropFiles(page, await centerOf(page, '.reveal section.present > .figure-box'), [IMAGE]);
    await waitText(page, 'media/figure-light.png');
    await undo(page);
    assert.equal(await render(page), before);
    const saved = await page.evaluate(SAVE_INTO(`undo-${platform}`));
    assert.equal(saved.text, before);
    assert.deepEqual(saved.files, {});
    assert.equal(saved.picked, 0);
    assert.equal(await page.evaluate(`(async () => { const root = await navigator.storage.getDirectory(); const dir = await root.getDirectoryHandle('undo-${platform}'); try { await dir.getDirectoryHandle('media'); return true; } catch { return false; } })()`), false);
    assert.deepEqual(page.errors, []);
  });

  test(`${platform}: a video from the file chooser gets a poster of its first frame`, async () => {
    const page = await mediaPage(platform);
    const before = await emptyFigureBox(page);
    if (platform === 'mac') {
      await click(page, await centerOf(page, '.reveal section.present > .text-column > h2'));
      await press(page, 'Escape');
      await press(page, 'Mod+Shift+V');
      assert.equal(await page.evaluate(`document.querySelector('input.beeson-media-input')?.accept ?? null`), 'image/*,application/pdf,.pdf,video/*,.mp4,.m4v,.webm,.mov');
      await page.evaluate(`document.querySelector('input.beeson-media-input').dispatchEvent(new Event('cancel'))`);
    }
    const row = await page.evaluate(`(() => {
      window.BeesonEditorShell.openMenu(window.BeesonEditorShell.menuItems('Insert'), { x: 200, y: 200 });
      const row = [...document.querySelectorAll('[role^="menuitem"]')].find((r) => r.textContent.includes('Choose File…'));
      const text = row?.textContent ?? null;
      window.BeesonEditorShell.closeMenus();
      return text;
    })()`);
    assert.ok(row, 'the Insert menu does not have Choose File…');
    assert.equal(/V/.test(row.replace('Choose File…', '')), platform === 'mac');
    await page.evaluate(`window.__done = window.BeesonEditor.exec('insert.video').then(() => true); 0`);
    await choose(page, [VIDEO]);
    await page.waitFor('window.__done', 30000);
    const after = await render(page);
    assert.equal(after, before.replace(SPLIT_FIGURE_BOX, '<div class="figure-box">\n    <video src="media/clip-dark.mp4" poster="media/clip-dark.png" muted loop data-autoplay></video>\n  </div>'));
    const [src, poster] = await page.evaluate(`(() => { const v = document.querySelector('.reveal section.present > .figure-box > video'); return [v.getAttribute('src'), v.getAttribute('poster')]; })()`);
    assert.match(src, /^blob:/);
    assert.match(poster, /^blob:/);
    await undoRedo(page, before, after);
    await inScope(page);
    const saved = await page.evaluate(SAVE_INTO(`video-${platform}`));
    assert.equal(saved.text, after);
    assert.deepEqual(Object.keys(saved.files).sort(), ['clip-dark.mp4', 'clip-dark.png']);
    assert.equal(saved.files['clip-dark.mp4'].size, VIDEO_BYTES);
    assert.deepEqual(saved.files['clip-dark.png'].head, PNG);
    await reopen(page, saved.text);
    assert.deepEqual(page.errors, []);
  });

  test(`${platform}: Replace… and Capture Poster of the inspector change the file of a figure`, async () => {
    const page = await mediaPage(platform, slideWith('<figure class="figure-box fragment"'));
    await click(page, await centerOf(page, '.reveal section.present figure.figure-box > img'));
    await frames(page);
    assert.equal(await page.evaluate(`document.querySelector('${PANEL} .ed-panes')?.dataset.pane ?? null`), 'image');
    const shown = (await shownFrom(page, '.reveal section.present figure.figure-box > img')).length;
    assert.equal(shown, 2);
    const dark = await page.evaluate(`getComputedStyle(document.querySelector('.reveal section.present figure.figure-box > img.for-dark')).display !== 'none'`);
    const old = dark ? DARK : LIGHT;
    await tap(page, 'Replace…');
    await choose(page, [IMAGE]);
    await waitText(page, 'media/figure-light.png');
    const after = page.source.replace(old, old.replace(/src="[^"]*"/, 'src="media/figure-light.png"'));
    assert.equal(await render(page), after);
    assert.equal((await status(page)).undo, true);
    await undoRedo(page, page.source, after);
    assert.match((await shownFrom(page, `.reveal section.present figure.figure-box > img.${dark ? 'for-dark' : 'for-light'}`))[0], /^blob:/);
    await inScope(page);
    await frames(page);
    const pane = await page.evaluate(`document.querySelector('${PANEL} .ed-well .name')?.textContent ?? null`);
    assert.equal(pane, 'figure-light.png');
    const saved = await page.evaluate(SAVE_INTO(`replace-${platform}`));
    assert.equal(saved.text, after);
    assert.deepEqual(Object.keys(saved.files), ['figure-light.png']);
    await reopen(page, saved.text);

    await page.evaluate(`Reveal.slide(${slideWith(CLIP)})`);
    await frames(page);
    const base = await render(page);
    await click(page, await centerOf(page, '.reveal section.present .figure-box > video'));
    await frames(page);
    assert.equal(await page.evaluate(`document.querySelector('${PANEL} .ed-panes')?.dataset.pane ?? null`), 'video');
    await tap(page, 'Capture Poster');
    await waitText(page, 'poster="media/clip-dark.png"');
    const captured = base.replace(CLIP, CLIP.replace('poster="../../demo/clip-dark.png"', 'poster="media/clip-dark.png"'));
    assert.equal(await render(page), captured);
    await undoRedo(page, base, captured);
    const again = await page.evaluate(SAVE_INTO(`replace-${platform}`));
    assert.deepEqual(Object.keys(again.files).sort(), ['clip-dark.png', 'figure-light.png']);
    assert.deepEqual(again.files['clip-dark.png'].head, PNG);
    await reopen(page, again.text);
    assert.deepEqual(page.errors, []);
  });

  test(`${platform}: a video dropped onto an image puts a video in its place`, async () => {
    const page = await mediaPage(platform, slideWith(WHITE_FIGURE));
    const outline = await dropFiles(page, await centerOf(page, '.reveal section.present .plate > img'), [VIDEO]);
    assert.equal(outline, 'Replace Image');
    await waitText(page, 'media/clip-dark.mp4');
    const after = page.source.replace(WHITE_FIGURE, '<video src="media/clip-dark.mp4" poster="media/clip-dark.png" muted loop data-autoplay></video>');
    assert.equal(await render(page), after);
    await undoRedo(page, page.source, after);
    await inScope(page);
    assert.match((await shownFrom(page, '.reveal section.present .plate > video', 'poster'))[0], /^blob:/);
    assert.deepEqual(page.errors, []);
  });

  test(`${platform}: a save without a press of a key asks for the folder with a dialog`, async () => {
    const page = await mediaPage(platform);
    await emptyFigureBox(page);
    await dropFiles(page, await centerOf(page, '.reveal section.present > .figure-box'), [IMAGE]);
    await waitText(page, 'media/figure-light.png');
    await page.evaluate(`(async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('ask-${platform}', { create: true });
      const deck = await dir.getFileHandle('deck.html', { create: true });
      window.__calls = 0;
      window.showDirectoryPicker = async () => {
        if (window.__calls++ === 0) throw new DOMException('Must be handling a user gesture to show a file picker.', 'SecurityError');
        return dir;
      };
      window.BeesonEditor.attach(deck);
      window.__saved = window.BeesonEditor.save().then(() => true);
      return true;
    })()`);
    await page.waitFor(`!!document.querySelector('dialog.media-folder[open]')`);
    await click(page, await centerOf(page, 'dialog.media-folder[open] button.primary'));
    await page.waitFor('window.__saved');
    const written = await page.evaluate(`(async () => {
      const root = await navigator.storage.getDirectory();
      const media = await (await root.getDirectoryHandle('ask-${platform}')).getDirectoryHandle('media');
      return [(await (await media.getFileHandle('figure-light.png')).getFile()).size, window.__calls];
    })()`);
    assert.deepEqual(written, [IMAGE_BYTES, 2]);
    assert.deepEqual(page.errors, []);
  });

  test(`${platform}: without the pickers, the new files are downloaded with the deck`, async () => {
    const page = await mediaPage(platform);
    await page.evaluate(`{
      window.showOpenFilePicker = undefined;
      window.showSaveFilePicker = undefined;
      window.showDirectoryPicker = undefined;
      window.__downloads = [];
      HTMLAnchorElement.prototype.click = function () { window.__downloads.push(fetch(this.href).then((r) => r.blob()).then((b) => ({ name: this.download, size: b.size }))); };
    }`);
    const before = await emptyFigureBox(page);
    await dropFiles(page, await centerOf(page, '.reveal section.present > .figure-box'), [IMAGE]);
    await waitText(page, 'media/figure-light.png');
    await page.evaluate('window.BeesonEditor.save()');
    const downloads = await page.evaluate('Promise.all(window.__downloads)');
    assert.deepEqual(downloads.map((d) => d.name), ['figure-light.png', 'editor-layouts.html']);
    assert.equal(downloads[0].size, IMAGE_BYTES);
    assert.match((await status(page)).message, /Put figure-light\.png into the folder media next to it/);
    assert.notEqual(await render(page), before);
    assert.deepEqual(page.errors, []);
  });

  test(`${platform}: an image dropped before the kept files are read at the start is kept`, async () => {
    const page = await mediaPage(platform, 0, { hold: true });
    await emptyFigureBox(page);
    await dropFiles(page, await centerOf(page, '.reveal section.present > .figure-box'), [IMAGE]);
    await waitText(page, 'media/figure-light.png');
    await page.evaluate('window.__release()');
    await page.waitFor('window.__writes.length === 2 && window.__writes.every((w) => w.done)');
    assert.deepEqual(await page.evaluate(ROWS), [['media/figure-light.png', IMAGE_BYTES]]);
    assert.deepEqual(page.errors, []);
  });

  test(`${platform}: a draft with an image is restored with the image`, async () => {
    let page = await mediaPage(platform, 0, { drafts: true });
    await emptyFigureBox(page);
    await dropFiles(page, await centerOf(page, '.reveal section.present > .figure-box'), [IMAGE]);
    await waitText(page, 'media/figure-light.png');
    const edited = await render(page);
    await page.waitFor(`!!Object.keys(localStorage).find((k) => k.startsWith('beeson-draft:'))`);
    await page.waitFor(`${ROWS}.then((rows) => rows.length === 1)`);
    assert.deepEqual(await page.evaluate(ROWS), [['media/figure-light.png', IMAGE_BYTES]]);

    page = await load(platform, { clear: false, drafts: true });
    await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    await page.waitFor(`!!document.querySelector('dialog.recover[open]')`);
    await page.evaluate(`(async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('restore-${platform}', { create: true });
      const deck = await dir.getFileHandle('deck.html', { create: true });
      window.showSaveFilePicker = async () => deck;
      window.showDirectoryPicker = async () => dir;
      window.__restoring = true;
      window.BeesonEditor.restoreDraft();
      return true;
    })()`);
    const reloaded = async () => {
      try {
        return await page.evaluate(`!window.__restoring && document.readyState === 'complete' && !!window.BeesonEditor`);
      } catch {
        return false;
      }
    };
    for (let i = 0; !(await reloaded()); i++) {
      assert.ok(i < 300, 'the page was not loaded again after the restore');
      await new Promise((done) => setTimeout(done, 50));
    }
    await page.waitFor('window.BeesonEditor.ready.then(() => true)');
    const result = await page.evaluate(`(async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('restore-${platform}');
      const deck = await dir.getFileHandle('deck.html');
      const media = await dir.getDirectoryHandle('media');
      const f = await (await media.getFileHandle('figure-light.png')).getFile();
      return { text: await (await deck.getFile()).text(), size: f.size, draft: Object.keys(localStorage).filter((k) => k.startsWith('beeson-draft:')).length };
    })()`);
    assert.equal(result.text, edited);
    assert.equal(result.size, IMAGE_BYTES);
    assert.equal(result.draft, 0);
    await page.waitFor(`${ROWS}.then((rows) => rows.length === 0)`);
    assert.deepEqual(page.errors, []);
  });

  test(`${platform}: Replace… on a picture hidden by the mode adds a twin with its step`, async () => {
    writeHiddenDeck();
    const cases = [
      [0, '.plate', IMAGE, HIDDEN_IMAGE, '<img class="for-light fragment fade-up faint" src="media/figure-light.png" style="width: 400px; rotate: 5deg" data-fragment-index="1" alt="A plot">'],
      [1, '.plate', VIDEO, HIDDEN_VIDEO, '<video class="for-light fragment play" src="media/clip-dark.mp4" poster="media/clip-dark.png" muted loop data-fragment-index="1"></video>'],
      [2, '.plate', IMAGE, HIDDEN_PDF, '<img class="for-light fragment" src="media/figure-light.png" alt="A page">'],
    ];
    for (const [n, slot, file, hidden, twin] of cases) {
      const page = await mediaPage(platform, n, { deck: HIDDEN_DECK, query: '&theme=light' });
      await click(page, await centerOf(page, `.reveal section.present ${slot}`));
      await frames(page);
      assert.match((await state(page, 'media.replace')).label, /Light Mode/);
      const replaced = exec(page, 'media.replace');
      await choose(page, [file]);
      await replaced;
      await waitText(page, 'class="for-light');
      const text = await render(page);
      const tags = text.match(/<(img|video) class="for-light[^>]*>(<\/video>)?/g);
      assert.deepEqual(tags, [twin]);
      assert.equal(text.replace(/\s*<(img|video) class="for-light[^>]*>(<\/video>)?/, ''), page.source);
      assert.ok(text.includes(`${hidden}\n`), 'the hidden picture was changed');
      await undoRedo(page, page.source, text);
      await inScope(page);
      assert.deepEqual(page.errors, []);
    }
  });
}
