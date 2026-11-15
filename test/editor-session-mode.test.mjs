// the session mode of the editor, see src/editor/session/session.ts. a page opened with edit and
// session is in the mode from its start, and begin() and end() of the port turn it on and off
// later. in the mode the editor does not save, keep a draft, autosave, or follow its file, it does
// not ask about unsaved edits, since every edit is already shared, and Open, Open Recent, and Revert
// to Saved are dimmed. the numbers are those of the findings of the review of the port

import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { editorPage } from './helpers/editor.mjs';
import { E } from './helpers/apply.mjs';
import { CLIENT, HELD_SAVER, NO_TABS, TIMERS, draftText, fileMenu, keepOldDraft, release, typeGo } from './helpers/session-mode.mjs';

const SESSION = 'edit&still&session';
const NOTE = 'Not available in a session';
const status = (page) => page.evaluate(`${E}.status()`);
const enabled = (page, id) => page.evaluate(`${E}.state(${JSON.stringify(id)}).enabled`);
const exec = (page, id) => {
  const run = page.evaluate(`${E}.exec(${JSON.stringify(id)}).then(() => true)`);
  run.catch(() => {});
  return run;
};
const askShown = `!!document.querySelector('dialog.beeson-edit-dialog.ask[open]')`;
const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));

let browser;
before(async () => {
  browser = await launch({ offline: false });
});
after(() => browser?.close());

// 22: a draft of an earlier visit without a session is not offered on a page of a session, and an
// edit in the session does not replace it
test('22: a page opened with edit and session neither offers nor keeps a draft', async () => {
  const earlier = await editorPage(browser, { page: { drafts: true }, clear: true });
  const old = await keepOldDraft(earlier);
  await earlier.close();
  const page = await editorPage(browser, { client: CLIENT, query: SESSION, page: { drafts: true } });
  try {
    let s = await status(page);
    assert.equal(s.recover, false, 'the dialog of the draft is open');
    await page.evaluate(TIMERS);
    await typeGo(page);
    await page.evaluate('window.__timers.run(), true');
    assert.equal(await page.evaluate(draftText), old, 'the draft of the earlier visit was replaced');
    s = await status(page);
    assert.equal(s.recover, false);
    assert.deepEqual(errors(page), []);
  } finally {
    await page.close();
  }
});

// 22: begin() after an edit, whose draft timer was set before it, and begin() while the dialog of a
// draft is open
test('22: begin() cancels a pending draft and closes the dialog of a draft', async () => {
  const page = await editorPage(browser, { page: { drafts: true }, clear: true });
  try {
    await page.evaluate(TIMERS);
    await typeGo(page);
    await page.waitFor('window.__timers.pending() > 0');
    await page.evaluate(`${E}.session.begin(), true`);
    await page.evaluate('window.__timers.run(), true');
    assert.equal(await page.evaluate(draftText), null, 'a draft was kept after begin()');
    assert.equal((await status(page)).draft, false);
  } finally {
    await page.close();
  }
  const earlier = await editorPage(browser, { page: { drafts: true }, clear: true });
  await keepOldDraft(earlier);
  await earlier.close();
  const late = await editorPage(browser, { page: { drafts: true } });
  try {
    assert.equal((await status(late)).recover, true, 'the draft is offered without a session');
    await late.evaluate(`${E}.session.begin(), true`);
    assert.equal((await status(late)).recover, false, 'the dialog of the draft is still open after begin()');
  } finally {
    await late.close();
  }
});

// a copy of the repository in a temporary folder, served with test-deck.html as index.html, which a
// test changes as another person of the session does through the edit command
async function served(t) {
  const dir = mkdtempSync(join(tmpdir(), 'beeson-mode-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of readdirSync('.')) if (name !== 'index.html' && name !== 'node_modules' && name !== '.git') symlinkSync(resolve(name), join(dir, name));
  const file = join(dir, 'index.html');
  writeFileSync(file, readFileSync('test-deck.html', 'utf8'));
  const server = await serve(dir);
  t.after(() => server.close());
  const open = async (query) => {
    const page = await browser.newPage();
    t.after(() => page.close());
    // the watch of follow.ts skips a page behind another, and window.__ticks counts its ticks
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: WATCHED });
    if (/(^|&)session(&|$)/.test(query)) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: CLIENT });
    await page.goto(`${server.origin}/index.html?${query}`);
    await page.waitFor(deckSettled);
    await page.waitFor(`window.BeesonEditor && window.BeesonEditor.ready.then(() => window.BeesonEditor.status().texts > 0)`);
    await page.evaluate('window.__before = true');
    return page;
  };
  const edit = (from, to) => {
    const text = readFileSync(file, 'utf8');
    assert.equal(text.split(from).length, 2, `${from} is not once in index.html`);
    writeFileSync(file, text.replace(from, to));
  };
  return { open, edit };
}

// a script run before the page, which shows the page as visible, and counts the calls of the
// intervals of 1 s in window.__ticks, among them the watch of follow.ts
const WATCHED = `{
  Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
  window.__ticks = 0;
  const every = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...args) => every(typeof fn === 'function' && ms === 1000 ? (...a) => (window.__ticks++, fn(...a)) : fn, ms, ...args);
}`;

// a page reloaded by follow.ts no longer has window.__before
const kept = (page) => page.evaluate('window.__before === true').catch(() => false);

// 23: the page of a session is not loaded again when the file changes, which happens at each edit
// of another person
test('23: a page opened with edit and session does not follow its file', async (t) => {
  const { open, edit } = await served(t);
  const page = await open(SESSION);
  const n = await page.evaluate('window.__ticks');
  edit('Thank you', 'Thanks to everyone');
  await page.waitFor(`window.__before !== true || window.__ticks >= ${n + 4}`);
  assert.equal(await kept(page), true, 'the page of the session was loaded again');
  const s = await status(page);
  assert.doesNotMatch(s.message, /The file was changed/);
  assert.deepEqual(s.changed, []);
});

// 23: begin() after the watch marked a slide changed, and the watch after end()
test('23: begin() clears the changes of the file from the state line, and end() follows the file again', async (t) => {
  const { open, edit } = await served(t);
  const page = await open('edit&still');
  await typeGo(page);
  edit('Thank you', 'Thanks to everyone');
  await page.waitFor(`${E}.status().message.includes('The file was changed')`);
  await page.evaluate(`(${E}.session.begin(), ${E}.session.setStatus('Saved'), true)`);
  assert.doesNotMatch((await status(page)).message, /The file was changed/);
  const session = await open(SESSION);
  await session.evaluate(`${E}.session.end(), true`);
  edit('Thanks to everyone', 'Thank you all');
  await session.waitFor(`${E}.status().message.includes('The file was changed')`);
  assert.equal(await kept(session), true, 'the page was loaded again over its edits');
});

// 24: the state line of a session does not speak of the autosave, and its switch is hidden
test('24: a session hides the Autosave switch and its sentence until end()', async () => {
  const page = await editorPage(browser, { clear: true });
  try {
    if (!(await status(page)).supported) return;
    await page.evaluate(`${E}.toggleAutosave(), true`);
    await typeGo(page);
    assert.match((await status(page)).message, /autosave starts after the first save/);
    const autosave = `document.querySelector('button.autosave')`;
    const shown = () => page.evaluate(`${autosave}.getClientRects().length > 0`);
    assert.equal(await shown(), true);
    await page.evaluate(`(${E}.session.begin(), ${E}.session.setStatus('Saved'), true)`);
    assert.match((await status(page)).message, /^Saved/);
    assert.doesNotMatch((await status(page)).message, /autosave/);
    assert.equal(await shown(), false, 'the Autosave switch is shown in a session');
    await page.evaluate(`${E}.session.end(), true`);
    assert.equal(await shown(), true, 'the Autosave switch is hidden after end()');
    assert.match((await status(page)).message, /autosave starts after the first save/);
  } finally {
    await page.close();
  }
});

// 10 and 12: Present, the exports, and Print wait for the saver of the session and go on without a
// question, and they keep the edit and its history
test('10 and 12: Present, Export, and Print in a session wait for the saver and keep the edits', async () => {
  const page = await editorPage(browser, { client: CLIENT, query: `${SESSION}&v=abc.1` });
  try {
    await page.evaluate(HELD_SAVER);
    await page.evaluate(NO_TABS);
    await typeGo(page);
    for (const [id, saves] of [['file.export.pdf', 1], ['file.print', 2]]) {
      const done = exec(page, id);
      await page.waitFor(`window.__saves === ${saves}`);
      assert.equal(await page.evaluate(askShown), false, `${id} asks about unsaved changes`);
      assert.equal(await page.evaluate('window.__opened.length'), saves - 1, `${id} goes on before the save`);
      await release(page);
      await done;
      const opened = await page.evaluate('window.__opened.at(-1)');
      assert.match(opened, /print-pdf/, `${id} does not open the print view`);
      assert.doesNotMatch(opened, /[?&](v|session|edit)(=|&|$)/, `${id} opens the print view of an old version`);
    }
    const pptx = exec(page, 'file.export.pptx');
    await page.waitFor('window.__saves === 3');
    assert.equal(await page.evaluate(`!!document.querySelector('dialog.beeson-edit-dialog.pptx[open]')`), false);
    await release(page);
    await page.waitFor(`!!document.querySelector('dialog.beeson-edit-dialog.pptx[open]')`);
    await page.evaluate(`document.querySelector('dialog.beeson-edit-dialog.pptx [value="close"], dialog.beeson-edit-dialog.pptx button:last-child').click(), true`);
    await pptx;
    const present = exec(page, 'file.present');
    await page.waitFor('window.__saves === 4');
    assert.equal(await page.evaluate(askShown), false, 'Present asks about unsaved changes');
    await release(page);
    await present;
    const src = await page.evaluate(`document.querySelector('.beeson-edit-show iframe')?.src ?? null`);
    assert.ok(src, 'the show is not played');
    assert.doesNotMatch(src, /[?&](v|session|edit)(=|&|$)/, 'the show plays an old version');
    await page.evaluate(`document.querySelector('.beeson-edit-show').remove(), true`);
    const s = await status(page);
    assert.ok((await page.evaluate(`${E}.render()`)).includes(' Go.'), 'the edit was undone');
    assert.equal(s.undo, true, 'the history was cleared');
    assert.deepEqual(errors(page), []);
  } finally {
    await page.close();
  }
});

// 10: the commands that would replace the deck of everyone are dimmed, with a note in the menu
test('10: Open, Open Recent, Revert to Saved, and Autosave are dimmed in a session, with a note', async () => {
  const page = await editorPage(browser, { client: CLIENT, query: SESSION });
  try {
    await typeGo(page);
    for (const id of ['file.open', 'file.revert', 'file.recent.none', 'file.autosave']) assert.equal(await enabled(page, id), false, `${id} is enabled in a session`);
    const items = await fileMenu(page);
    for (const id of ['file.open', 'file.revert', 'file.autosave']) {
      assert.ok(items[id], `the File menu does not have ${id}`);
      assert.equal(items[id].disabled, true);
      assert.ok(items[id].label.endsWith(NOTE), `${id} reads ${items[id].label}`);
    }
    const recent = Object.values(items).find((i) => i.label.startsWith('Open Recent'));
    assert.ok(recent && recent.disabled && recent.label.endsWith(NOTE), 'Open Recent is not dimmed with the note');
    await exec(page, 'file.open');
    assert.equal(await page.evaluate(askShown), false);
    // the key of Open is kept from the browser, whose own Open would leave the page of the session
    const held = await page.evaluate(`(() => {
      const mac = /Mac|iPhone|iPad/.test(navigator.platform);
      const ev = new KeyboardEvent('keydown', { key: 'o', code: 'KeyO', keyCode: 79, metaKey: mac, ctrlKey: !mac, bubbles: true, cancelable: true });
      document.querySelector('.reveal').dispatchEvent(ev);
      return ev.defaultPrevented;
    })()`);
    assert.equal(held, true, 'the key of Open reaches the browser in a session');
    assert.ok((await page.evaluate(`${E}.render()`)).includes(' Go.'));
    assert.equal((await status(page)).undo, true);
    assert.deepEqual(errors(page), []);
  } finally {
    await page.close();
  }
});
