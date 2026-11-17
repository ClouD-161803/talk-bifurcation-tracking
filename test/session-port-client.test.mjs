// the port of the synchronous editor with the client of theme/session.js on the edit command, see
// src/editor/session/session.ts: an open composition holds back only the changes of its own text,
// e.g. a change of index.html by another program, while the edits of both people on the other
// elements go on, and a save resolves once the edits of the person made before it are acknowledged

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
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

test('a save in the same task as an edit resolves once the edit is acknowledged by the edit command', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const a = await open(browser, sessionUrl(server.edit));
  assert.equal(await converge(server, [a]), TALK);
  await show(a, 'Two');
  await caretAtEnd(a, el(1, 'p'));
  const got = await a.evaluate(`(() => {
    document.execCommand('insertText', false, ' saved');
    return window.BeesonEditor.save().then(() => ({ acked: ${C}.acked(), sent: ${C}.snapshot().base.includes('<p>Second slide saved</p>') }));
  })()`);
  assert.deepEqual(got, { acked: true, sent: true }, 'the edit is acknowledged when the save resolves');
  await until(() => server.read().includes('<p>Second slide saved</p>'), 'the file to hold the edit');
  assert.deepEqual(a.errors, []);
});

test('a save while an apply holds onChange back resolves once the edit of the person is acknowledged', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  assert.equal(await converge(server, [a, b]), TALK);
  // b has a MathJax whose typeset waits for a gate, which holds an apply of a formula
  await b.evaluate(`(() => {
    let open;
    window.__gate = new Promise((done) => (open = done));
    window.__openGate = open;
    window.__held = 0;
    window.MathJax = { startup: { promise: Promise.resolve(), document: { getMathItemsWithin: () => [] } }, typesetClear() {}, typesetPromise: () => (window.__held++, window.__gate) };
    return true;
  })()`);
  await show(b, 'Two');
  await caretAtEnd(b, el(1, 'p'));
  await show(a, 'One');
  await caretAtEnd(a, el(0, 'p'));
  await a.evaluate(`document.execCommand('insertText', false, ' \\\\(x\\\\)')`);
  await front(b);
  await b.waitFor('window.__held > 0');
  await b.evaluate(`(() => {
    window.__saved = null;
    document.execCommand('insertText', false, ' saved');
    window.BeesonEditor.save().then(() => (window.__saved = { acked: ${C}.acked(), sent: ${C}.snapshot().base.includes('<p>Second slide saved</p>') }));
    return true;
  })()`);
  await b.evaluate('(window.__openGate(), true)');
  await b.waitFor('window.__saved !== null');
  assert.deepEqual(await b.evaluate('window.__saved'), { acked: true, sent: true }, 'the edit is acknowledged when the save resolves');
  const end = await converge(server, [a, b]);
  assert.ok(end.includes('<p>First slide \\(x\\)</p>') && end.includes('<p>Second slide saved</p>'), 'the file holds the edits of both people');
  assert.deepEqual([a.errors, b.errors], [[], []]);
});
