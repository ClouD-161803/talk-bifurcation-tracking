// the port of the synchronous editor with the client of theme/session.js on the edit command, see
// src/editor/session/session.ts: an open composition holds back only the changes of its own text,
// e.g. a change of index.html by another program, while the edits of both people on the other
// elements go on

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd } from './helpers/apply.mjs';
import { C, converge, ONLINE, open, sessionUrl, show, talk, TALK, TEXT } from './helpers/client.mjs';
import { until } from './helpers/session.mjs';

// the element of selector on the slide at index
const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;
const SETTLED = `(${ONLINE} && ${C}.acked()) ? ${TEXT} : null`;

test('during a composition on one page, a change of index.html into the composing text is held back, the edits of both people reach the file and both pages, and the composing text takes the change at its end', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  assert.equal(await converge(server, [a, b]), TALK);
  // page a stays in front until the end of the composition, since a hidden page ends it
  await show(a, 'One');
  await caretAtEnd(a, el(0, 'p'));
  await a.evaluate(`${el(0, 'p')}.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))`);
  // another program changes the composing text, which a holds back. a person cannot change it,
  // since the floor rule of presence.ts takes a out of a text that another person claims
  writeFileSync(server.file, server.read().replace('<p>First slide</p>', '<p>Very First slide</p>'));
  await a.waitFor(`${TEXT}.includes('<p>Very First slide</p>')`);
  // a types into the composing text, and b, behind a, changes a text on the other slide through
  // the document model, since a hidden page cannot take the focus
  await a.evaluate(`document.execCommand('insertText', false, 'q')`);
  await b.evaluate(`window.BeesonEditor.doc.setContent(${el(1, 'li')}, 'Alpha later').then(() => true)`);
  let state = null;
  await until(async () => {
    const file = server.read();
    state = { file: ['<p>Very First slideq</p>', '<li>Alpha later</li>'].map((s) => file.includes(s)), a: (await a.evaluate(SETTLED)) === file, b: (await b.evaluate(SETTLED)) === file };
    return state.file.every(Boolean) && state.a && state.b;
  }, 'the edits of both people to reach the file and both pages during the composition').catch((e) => assert.fail(`${e.message}: ${JSON.stringify(state)}`));
  assert.deepEqual(await a.evaluate(`[${el(0, 'p')}.textContent, ${el(1, 'li')}.textContent]`), ['First slideq', 'Alpha later'], 'the composing text of a is left as it is, and the other text takes the edit of b');
  await a.evaluate(`${el(0, 'p')}.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }))`);
  const end = await converge(server, [a, b]);
  assert.ok(end.includes('<p>Very First slideq</p>') && end.includes('<li>Alpha later</li>'), 'the file holds the edits of both people');
  assert.equal(await a.evaluate(`${el(0, 'p')}.textContent`), 'Very First slideq', 'the composing text takes the change at the end of the composition');
  assert.deepEqual([a.errors, b.errors], [[], []]);
});
