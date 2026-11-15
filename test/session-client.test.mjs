// the client of a session in Chrome, on the edit command started on a temporary talk folder: the
// join, the edits of two pages that reach each other and index.html byte for byte, a structural
// change, an undo, a change of the file from outside, a change of the head that loads the page
// again, and the guard that never sends a text that the deck did not take as an edit

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, loads, ONLINE, open, ops, sessionUrl, show, STATE, talk, TALK } from './helpers/client.mjs';
import { click, press, type, typeKeys } from './helpers/editor.mjs';
import { until } from './helpers/session.mjs';

// the element of selector on the slide at index
const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;

test('a page joins with the name typed in the dialog, and again without it', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { name: '', wait: false });
  await page.waitFor(`document.querySelector('dialog.beeson-session-join')?.open`);
  const dialog = await page.evaluate(`(() => {
    const d = document.querySelector('dialog.beeson-session-join');
    return { title: d.querySelector('h3').textContent, text: d.querySelector('p').textContent, label: d.querySelector('label').textContent, max: d.querySelector('input').maxLength, focused: document.activeElement === d.querySelector('input') };
  })()`);
  assert.deepEqual(dialog, { title: 'Start the session', text: 'Type the name that the others will see on your edits and comments.', label: 'Your name', max: 40, focused: true });
  await typeKeys(page, 'Ada Lovelace');
  assert.equal(await page.evaluate(`document.querySelector('dialog.beeson-session-join .swatch').textContent`), 'AL');
  await press(page, 'Enter');
  await page.waitFor(ONLINE);
  assert.deepEqual(await page.evaluate(`({ name: ${C}.name, host: ${C}.host, shown: !!document.querySelector('dialog.beeson-session-join[open]'), state: ${STATE} })`), { name: 'Ada Lovelace', host: true, shown: false, state: 'Saved to index.html' });

  await page.evaluate('location.reload()');
  await page.waitFor(`document.readyState === 'complete' && ${ONLINE}`);
  assert.equal(await loads(page), 2);
  assert.equal(await page.evaluate(`${C}.name`), 'Ada Lovelace');
  assert.equal(await page.evaluate(`document.querySelector('dialog.beeson-session-join')`), null);
  clean(page);
});

test('a page with edit and without session does not load theme/session.js', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, `${server.edit.url}index.html?edit`, { wait: false });
  await page.waitFor('window.BeesonEditor.status().texts > 0');
  assert.equal(await page.evaluate(`performance.getEntriesByType('resource').some((e) => e.name.includes('session.js'))`), false);
  assert.equal(await page.evaluate(`'BeesonSession' in window || !!document.querySelector('.beeson-session-state')`), false);
  clean(page);
});
