// a warning note of the editor is shown in full in a window too narrow for the title bar to show it
// (#57), and every row of a menu of the editor is at least 24 px tall, the target size of WCAG 2.2
// success criterion 2.5.8 (#82)

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch } from '../scripts/chrome.mjs';
import { center, editorPage, press } from './helpers/editor.mjs';
import { sessionPage } from './helpers/apply.mjs';

let browser;
let dir;
before(async () => {
  browser = await launch();
  dir = mkdtempSync(join(tmpdir(), 'beeson-notes-'));
});
after(async () => {
  await browser?.close();
  rmSync(dir, { recursive: true, force: true });
});

const js = (v) => JSON.stringify(v);

// a trusted drop of the file name from the Finder onto the middle of the slide, which the editor
// refuses with a warning note, since the file is not an image, a PDF, or a video
async function dropRefused(page, name) {
  const path = join(dir, name);
  writeFileSync(path, 'not a picture');
  const at = await center(page, '.reveal section.present');
  const data = { items: [], files: [path], dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop']) await page.send('Input.dispatchDragEvent', { type, x: at.x, y: at.y, data });
  await page.waitFor(`window.BeesonEditor.status().message.includes(${js(name)})`);
}

// the live region that shows the whole note within the window, or null
const shown = (page, words) => page.evaluate(`(() => {
  const el = [...document.querySelectorAll('[aria-live]')].find((e) => e.textContent.includes(${js(words)}) && e.checkVisibility());
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const whole = el.scrollWidth <= el.clientWidth + 1 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
  return whole ? el.textContent : null;
})()`);

for (const [label, size, name] of [
  ['a phone', { width: 390, height: 844, mobile: true }, 'orbit.xyz'],
  ['a window narrower than 900 px', { width: 899, height: 800 }, 'orbit.xyz'],
  ['a window where the title bar cuts the note', { width: 1000, height: 800 }, 'a-figure-of-the-transfer-from-the-l1-halo-orbit-to-the-l2-halo-orbit-of-the-earth-and-the-moon.xyz'],
]) {
  test(`a warning note is shown in full in ${label}, and the next key or tap hides it (#57)`, { timeout: 120000 }, async (t) => {
    const page = await editorPage(browser, { page: size });
    t.after(() => page.close());
    await dropRefused(page, name);
    await page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))');
    assert.match((await shown(page, `${name} is not`)) ?? '', new RegExp(`${name.replace(/\./g, '\\.')} is not an image`));
    await press(page, 'Escape');
    await page.waitFor(`![...document.querySelectorAll('[aria-live]')].some((e) => e.textContent.includes(${js(name)}) && e.checkVisibility())`);
    assert.deepEqual(page.errors, []);
  });
}

test('every row of the menus of the editor is at least 24 px tall (#82)', { timeout: 120000 }, async (t) => {
  const page = await editorPage(browser, { page: { width: 390, height: 844, mobile: true } });
  t.after(() => page.close());
  const heights = {};
  for (const name of ['File', 'Edit', 'Insert', 'Slide', 'Arrange', 'View']) {
    await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent === ${js(name)}).click()`);
    await page.waitFor(`document.querySelectorAll('.beeson-edit-menu .item').length > 0`);
    heights[name] = await page.evaluate(`Math.min(...[...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => i.getBoundingClientRect().height))`);
    await press(page, 'Escape');
    await page.waitFor(`!document.querySelector('.beeson-edit-menu')`);
  }
  for (const [name, h] of Object.entries(heights)) assert.ok(h >= 24, `a row of the menu ${name} is ${h} px tall`);
  assert.deepEqual(page.errors, []);
});

test('in a session, a row of the File menu with its note on its line is at least 24 px tall (#82)', { timeout: 120000 }, async (t) => {
  const page = await sessionPage(browser, { page: { width: 1280, height: 800 } });
  t.after(() => page.close());
  await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent === 'File').click()`);
  await page.waitFor(`document.querySelectorAll('.beeson-edit-menu .item.noted').length > 0`);
  const heights = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item.noted')].map((i) => i.getBoundingClientRect().height)`);
  assert.ok(Math.min(...heights) >= 24, `the rows with a note are ${heights.join(', ')} px tall`);
  assert.deepEqual(page.errors, []);
});
