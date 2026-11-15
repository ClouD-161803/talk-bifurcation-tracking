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

// waits for a load of each page after the counts of before, with each page in front in turn
async function reloaded(list, before) {
  await until(async () => {
    for (const [i, page] of list.entries()) {
      await front(page).catch(() => {});
      if ((await loads(page).catch(() => 0)) <= before[i]) return false;
    }
    return true;
  }, 'the pages to load again');
  for (const page of list) await page.waitFor(`document.readyState === 'complete' && ${ONLINE}`);
}

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

test('the edits of two pages reach each other and index.html byte for byte', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  assert.notEqual(await a.evaluate(`${C}.person`), await b.evaluate(`${C}.person`));
  assert.equal(await converge(server, [a, b]), TALK);

  await t.test('typing on one page reaches the other page and the file', async () => {
    await show(a, 'One');
    await caretAtEnd(a, el(0, 'h2'));
    await typeKeys(a, ' more');
    assert.equal(await converge(server, [a, b]), TALK.replace('<h2>One</h2>', '<h2>One more</h2>'));
    assert.equal(await b.evaluate(`${el(0, 'h2')}.textContent`), 'One more');
  });

  await t.test('edits of two elements at the same time are both kept', async () => {
    const before = server.read();
    await show(a, 'One');
    await show(b, 'Two');
    await caretAtEnd(a, el(0, 'p'));
    await caretAtEnd(b, el(1, 'p'));
    await Promise.all([type(a, ' from Ann'), type(b, ' from Ben')]);
    const text = await converge(server, [a, b]);
    assert.equal(text, before.replace('<p>First slide</p>', '<p>First slide from Ann</p>').replace('<p>Second slide</p>', '<p>Second slide from Ben</p>'));
  });

  await t.test('a new slide and a moved element reach the other page', async () => {
    await show(a, 'Two');
    await a.evaluate(`window.BeesonEditor.exec('slide.new')`);
    // the apply of a new slide draws the sections of page b anew
    assert.equal((await converge(server, [a, b])).match(/<section/g).length, 3);
    await show(b, 'One');
    await click(b, '.reveal section.present > h2');
    await press(b, 'Escape');
    await press(b, 'ArrowRight');
    const text = await converge(server, [a, b]);
    assert.equal(text.match(/<section/g).length, 3);
    assert.ok(text.includes('<h2 style="translate: 1px 0px">One more</h2>'), text);
    for (const page of [a, b]) {
      assert.deepEqual(await page.evaluate(`({ slides: document.querySelectorAll('.reveal .slides > section').length, translate: ${el(0, 'h2')}.style.translate })`), { slides: 3, translate: '1px' });
    }
  });

  await t.test('an undo reaches the other page', async () => {
    const before = await converge(server, [a, b]);
    await show(a, 'Two');
    await caretAtEnd(a, el(1, 'li:last-child'));
    await typeKeys(a, ' and Gamma');
    assert.equal(await converge(server, [a, b]), before.replace('<li>Beta</li>', '<li>Beta and Gamma</li>'));
    await front(a);
    await press(a, 'Mod+Z');
    assert.equal(await converge(server, [a, b]), before);
    assert.equal(await b.evaluate(`${el(1, 'li:last-child')}.textContent`), 'Beta');
  });

  await t.test('a change of index.html by another program reaches both pages', async () => {
    const before = await converge(server, [a, b]);
    writeFileSync(server.file, before.replace('<li>Alpha</li>', '<li>Alpha, changed outside</li>'));
    await converge(server, [a, b]);
    for (const page of [a, b]) assert.equal(await page.evaluate(`${el(1, 'li')}.textContent`), 'Alpha, changed outside');
  });

  await t.test('a change of the head loads both pages again, and they join again', async () => {
    const before = await converge(server, [a, b]);
    const counts = [await loads(a), await loads(b)];
    writeFileSync(server.file, before.replace('<title>A session</title>', '<title>A session, renamed</title>'));
    await reloaded([a, b], counts);
    await converge(server, [a, b]);
    for (const [page, name] of [[a, 'Ann'], [b, 'Ben']]) {
      assert.deepEqual(await page.evaluate(`({ title: document.title, name: ${C}.name })`), { title: 'A session, renamed', name });
    }
  });

  await t.test('a page whose deck does not take a text loads again, and it sends nothing of this text', async () => {
    await converge(server, [a, b]);
    const count = await loads(b);
    const sent = await ops(b);
    await b.evaluate(`window.BeesonEditor.session.apply = async () => ({ reload: false, changed: [] })`);
    await show(a, 'One');
    await caretAtEnd(a, el(0, 'p'));
    await type(a, ', kept');
    await reloaded([b], [count]);
    const text = await converge(server, [a, b]);
    assert.ok(text.includes('<p>First slide from Ann, kept</p>'));
    assert.equal(await ops(b), sent, 'the page that did not take the text sent an operation');
  });

  await t.test('Save resolves once every edit of the page is acknowledged', async () => {
    await converge(server, [a, b]);
    await show(a, 'Two');
    await caretAtEnd(a, el(1, 'h2'));
    await type(a, ' saved');
    assert.equal(await a.evaluate(`window.BeesonEditor.save().then(() => ${C}.acked())`), true);
    assert.ok((await converge(server, [a, b])).includes('<h2>Two saved</h2>'));
  });

  await t.test('a page that is closed leaves the people of the others at once', async () => {
    assert.equal(await a.evaluate(`${C}.people.length`), 2);
    clean(b);
    await b.close();
    await a.waitFor(`${C}.people.length === 1`, 5000);
  });

  clean(a);
});

test('a name held by another person asks whether it is this person, and Yes takes the person over', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'ann', wait: false });
  const asked = `document.querySelector('dialog.beeson-edit-dialog[open] h3')?.textContent`;
  await b.waitFor(`${asked} === 'Ann has joined this deck before. Is that you?'`);
  assert.deepEqual(await b.evaluate(`[...document.querySelectorAll('dialog.beeson-edit-dialog[open] .row button')].map((x) => x.textContent)`), ['Use another name', 'Yes, continue']);
  await b.evaluate(`[...document.querySelectorAll('dialog.beeson-edit-dialog[open] .row button')].find((x) => x.textContent === 'Use another name').click()`);
  await b.waitFor(`document.querySelector('dialog.beeson-session-join')?.open`);
  await b.evaluate(`document.querySelector('dialog.beeson-session-join input').value = 'Ann'`);
  await b.evaluate(`document.querySelector('dialog.beeson-session-join .row button').click()`);
  await b.waitFor(`${asked} === 'Ann has joined this deck before. Is that you?'`);
  await b.evaluate(`[...document.querySelectorAll('dialog.beeson-edit-dialog[open] .row button')].find((x) => x.textContent === 'Yes, continue').click()`);
  await b.waitFor(ONLINE);
  assert.equal(await b.evaluate(`${C}.person`), await a.evaluate(`${C}.person`));
  assert.equal(await b.evaluate(`${C}.name`), 'Ann');
  clean(a);
  clean(b);
});

test('a lone surrogate typed into the deck is written as U+FFFD, on the page and in the file', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit));
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await page.evaluate(`document.execCommand('insertText', false, ' \\uD800')`);
  const text = await converge(server, [page]);
  assert.equal(text, TALK.replace('<p>First slide</p>', '<p>First slide �</p>'));
  assert.equal(await page.evaluate(`${el(0, 'p')}.textContent`), 'First slide �');
  clean(page);
});
