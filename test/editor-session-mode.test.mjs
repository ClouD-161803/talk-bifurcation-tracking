// the session mode of the editor, see src/editor/session/session.ts. a page opened with edit and
// session is in the mode from its start, and begin() and end() of the port turn it on and off
// later. in the mode the editor does not save, keep a draft, autosave, or follow its file, it does
// not ask about unsaved edits, since every edit is already shared, and Open, Open Recent, and Revert
// to Saved are dimmed. the numbers are those of the findings of the review of the port

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { editorPage } from './helpers/editor.mjs';
import { E } from './helpers/apply.mjs';
import { CLIENT, TIMERS, draftText, keepOldDraft, typeGo } from './helpers/session-mode.mjs';

const SESSION = 'edit&still&session';
const status = (page) => page.evaluate(`${E}.status()`);
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
