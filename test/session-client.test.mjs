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
import { cleanPersonName, nameKey } from '../src/session/protocol.ts';

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
    return { title: d.querySelector('h3').textContent, text: d.querySelector('p').textContent, label: d.querySelector('label').textContent, focused: document.activeElement === d.querySelector('input') };
  })()`);
  assert.deepEqual(dialog, { title: 'Start the session', text: 'Type the name that the others will see on your edits.', label: 'Your name', focused: true });
  // the field takes 40 characters, also of emoji, which are two UTF-16 code units each
  const field = `document.querySelector('dialog.beeson-session-join input')`;
  await page.send('Input.insertText', { text: '😀'.repeat(41) });
  assert.equal(await page.evaluate(`Array.from(${field}.value).join(' ')`), Array(40).fill('😀').join(' '));
  await page.evaluate(`(${field}.value = '', ${field}.dispatchEvent(new Event('input')), true)`);
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

  // the loads of both pages before and after each change of one page that the other page takes
  const loaded = {};
  const both = async () => [await loads(a), await loads(b)];

  await t.test('a new slide and a moved element reach the other page', async () => {
    await show(a, 'Two');
    let before = await both();
    await a.evaluate(`window.BeesonEditor.exec('slide.new')`);
    assert.equal((await converge(server, [a, b])).match(/<section/g).length, 3);
    loaded['a new slide of page a'] = [before, await both()];
    await show(b, 'One');
    before = await both();
    await click(b, '.reveal section.present > h2');
    await press(b, 'Escape');
    await press(b, 'ArrowRight');
    const text = await converge(server, [a, b]);
    loaded['an element moved on page b'] = [before, await both()];
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
    const counts = await both();
    await press(a, 'Mod+Z');
    assert.equal(await converge(server, [a, b]), before);
    loaded['an undo on page a'] = [counts, await both()];
    assert.equal(await b.evaluate(`${el(1, 'li:last-child')}.textContent`), 'Beta');
  });

  await t.test('a change of index.html by another program reaches both pages', async () => {
    const before = await converge(server, [a, b]);
    const counts = await both();
    writeFileSync(server.file, before.replace('<li>Alpha</li>', '<li>Alpha, changed outside</li>'));
    await converge(server, [a, b]);
    loaded['a change of index.html by another program'] = [counts, await both()];
    for (const page of [a, b]) assert.equal(await page.evaluate(`${el(1, 'li')}.textContent`), 'Alpha, changed outside');
  });

  await t.test('a new slide of page a does not load page b again', () => {
    const [before, after] = loaded['a new slide of page a'];
    assert.deepEqual(after, before);
  });

  await t.test('a moved element, an undo, and a change of index.html by another program do not load a page again', () => {
    for (const what of ['an element moved on page b', 'an undo on page a', 'a change of index.html by another program']) {
      const [before, after] = loaded[what];
      assert.deepEqual(after, before, what);
    }
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
  // the name is isolated from the text around it, which a name in a right-to-left script would reorder
  assert.equal(await b.evaluate(`document.querySelector('dialog.beeson-edit-dialog[open] h3 bdi')?.textContent`), 'Ann');
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

test('a name keeps an emoji with joiners and a name in a right-to-left script, and loses every other format character', () => {
  for (const name of ['👨\u200d👩\u200d👧\u200d👦', 'مه\u200cسا', 'דוד כהן', '❤️ Ann']) assert.equal(cleanPersonName(name), name);
  const format = ['\u202a', '\u202b', '\u202c', '\u202d', '\u202e', '\u2066', '\u2067', '\u2068', '\u2069', '\u200e', '\u200f', '\u061c', '\u0600', '\u06dd', '\u070f', '\u08e2', '\ufff9', '\ufffb', '\u200b', '\u2060', '\ufeff', '\u00ad', '\u{13430}', '\u{e0041}'];
  for (const c of format) {
    const code = `U+${c.codePointAt(0).toString(16)}`;
    assert.equal(cleanPersonName(`A${c}nn`), 'Ann', code);
    assert.equal(cleanPersonName(`${c}Ann${c}`), 'Ann', code);
  }
  // a joiner is kept only between two characters that are not spaces
  for (const j of ['\u200c', '\u200d']) {
    assert.equal(cleanPersonName(`${j}Ann ${j} Ben${j}`), 'Ann Ben');
    assert.equal(nameKey(`An${j}n`), nameKey('Ann'));
  }
  assert.equal(nameKey('👨\u200d👩\u200d👧'), nameKey('👨👩👧'));
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

test('the save state is in view on a phone of 390 px and takes a tap, and the buttons of the dialogs are 32 px high', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const phone = { width: 390, height: 844, mobile: true };
  const page = await open(browser, sessionUrl(server.edit), phone);
  const box = await page.evaluate(`(() => {
    const b = document.querySelector('.beeson-session-state');
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const after = getComputedStyle(b, '::after');
    return { inside: r.left >= 0 && r.right <= innerWidth, hit: b.contains(hit), height: r.height - parseFloat(after.top) - parseFloat(after.bottom), label: b.getAttribute('aria-label') };
  })()`);
  assert.deepEqual(box, { inside: true, hit: true, height: 32, label: 'Saved to index.html' });

  const open_ = `document.querySelector('dialog.beeson-edit-dialog[open]')`;
  // the layout height, which the transform of the animation at the open does not change
  const heights = (p) => p.evaluate(`[...${open_}.querySelectorAll('.row button')].map((b) => b.offsetHeight)`);
  const low = (list) => list.filter((h) => h < 32);
  const other = await open(browser, sessionUrl(server.edit), { ...phone, name: '', wait: false });
  await other.waitFor(`document.querySelector('dialog.beeson-session-join')?.open`);
  assert.deepEqual(low(await heights(other)), [], 'the buttons of the join dialog');
  await other.evaluate(`document.querySelector('dialog.beeson-session-join input').value = 'Ann'`);
  await other.evaluate(`document.querySelector('dialog.beeson-session-join .row button.primary').click()`);
  await other.waitFor(`${open_}?.querySelector('h3').textContent === 'Ann has joined this deck before. Is that you?'`);
  assert.deepEqual(low(await heights(other)), [], 'the buttons of the taken dialog');
  // a signal ends a process at once on Windows, where a page is thus not told the end of the session
  if (process.platform !== 'win32') {
    server.edit.child.kill('SIGTERM');
    await server.edit.exited;
    server.edit = null;
    await page.waitFor(`${open_}?.querySelector('h3').textContent === 'The session has ended'`);
    const ended = await heights(page);
    assert.ok(ended.length === 2 && !low(ended).length, `the buttons of the end dialog are ${ended.join(', ')} px high`);
  }
  clean(page);
});

test('a page that is hidden for good sends nothing after its bye, and stays out of the session', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const ann = await open(browser, url, { name: 'Ann Smith' });
  const ben = await open(browser, url, { name: 'Ben Carter' });
  await front(ann);
  await ann.waitFor(`${C}.people.length === 2`);
  // the route of every request of Ben, in order, and the number of answers of a poll that its
  // client has read. an answer is read here in full first, so that the client reads it, takes it,
  // and sends its next request within one turn of the tasks
  await front(ben);
  await ben.evaluate(`(() => {
    window.__sent = [];
    window.__read = 0;
    const fetched = window.fetch;
    window.fetch = function (input, init) {
      const route = (typeof input === 'string' ? input : input.url).replace(/^.*[/][.]session[/]/, '').replace(/[?].*$/, '');
      window.__sent.push(route);
      const answer = fetched.call(this, input, init);
      if (route !== 'events') return answer;
      return answer.then(async (response) => {
        const copy = new Response(await response.text(), { status: response.status, headers: response.headers });
        const text = copy.text.bind(copy);
        copy.text = () => text().then((value) => (window.__read++, value));
        return copy;
      });
    };
  })()`);
  // an edit of Ann answers the poll of Ben that waits, hence the next poll of Ben is recorded
  await front(ann);
  await show(ann, 'One');
  await caretAtEnd(ann, el(0, 'p'));
  await typeKeys(ann, 'x');
  await front(ben);
  await ben.waitFor(`window.__sent.includes('events') && ${el(0, 'p')}.textContent === 'First slidex'`);
  // the page is hidden for good, as at a close, and the edit command answers its poll at the bye
  const read = await ben.evaluate(`(() => {
    const before = window.__read;
    window.__sent.length = 0;
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    return before;
  })()`);
  await ben.waitFor(`window.__read > ${read}`);
  const sent = await ben.evaluate(`new Promise((done) => setTimeout(() => done(window.__sent), 0))`);
  assert.deepEqual(sent, ['bye'], `Ben sent ${sent.join(', ')}`);
  await front(ann);
  await ann.waitFor(`${C}.people.length === 1`);
  clean(ann);
  clean(ben);
});
