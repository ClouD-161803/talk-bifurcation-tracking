import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, loads, ONLINE, open, ops, sessionUrl, show, SIGTERM_TELLS_THE_PAGES, STATE, talk, TALK } from './helpers/client.mjs';
import { click, clickText, drag, press, type, typeKeys } from './helpers/editor.mjs';
import { until } from './helpers/session.mjs';
import { cleanPersonName, nameKey } from '../src/session/protocol.ts';

const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;

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
  assert.deepEqual(dialog, { title: 'Join the session', text: 'Type the name that the others will see on your edits and comments.', label: 'Your name', focused: true });
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
  await reloaded([page], [1]);
  assert.equal(await loads(page), 2);
  assert.equal(await page.evaluate(`${C}.name`), 'Ada Lovelace');
  assert.equal(await page.evaluate(`document.querySelector('dialog.beeson-session-join')`), null);
  clean(page);
});

test('a page with edit and without session loads neither theme/session.js nor theme/editor-session.js', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, `${server.edit.url}index.html?edit`, { wait: false });
  await page.waitFor('window.BeesonEditor.status().texts > 0');
  assert.equal(await page.evaluate(`performance.getEntriesByType('resource').some((e) => e.name.includes('session.js'))`), false);
  assert.equal(await page.evaluate(`document.querySelector('script[src*="session.js"]')`), null);
  assert.equal(await page.evaluate(`'BeesonSession' in window || 'BeesonEditorSession' in window || !!document.querySelector('.beeson-session-state')`), false);
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
    await clickText(b, '.reveal section.present > h2');
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

const FIGURE = '  <div class="figure-box tikz" id="tk" data-figure="two" style="width: 300px; height: 200px"></div>\n  <div id="bd" class="later"></div>\n';
for (const [what, from, to, shown] of [
  ['data-figure of a TikZ figure', 'data-figure="two"', 'data-figure="three"', `!!document.querySelector('#tk > svg [id]')?.id.startsWith('tikz-three-')`],
  ['the class backdrop on an element', 'class="later"', 'class="backdrop"', `document.querySelector('#bd').classList.contains('backdrop')`],
]) {
  test(`a change of ${what} by another program loads both pages again, which then show it and take edits`, { timeout: 180_000 }, async (t) => {
    const browser = await launch({ offline: false });
    t.after(() => browser.close());
    const server = await talk(t);
    mkdirSync(join(server.talk, 'figures'));
    const two = readFileSync('test/pages/figures/two.js', 'utf8');
    writeFileSync(join(server.talk, 'figures', 'two.js'), two);
    writeFileSync(join(server.talk, 'figures', 'three.js'), two.replaceAll('"two"', '"three"').replaceAll('tikz-two-', 'tikz-three-'));
    writeFileSync(server.file, TALK.replace('  <p>First slide</p>\n', `  <p>First slide</p>\n${FIGURE}`));
    const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
    const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
    await converge(server, [a, b]);
    await show(b, 'Two');
    await caretAtEnd(b, el(1, 'p'));
    await typeKeys(b, ' early');
    const before = await converge(server, [a, b]);
    assert.ok(before.includes('<p>Second slide early</p>'));
    const counts = [await loads(a), await loads(b)];
    writeFileSync(server.file, before.replace(from, to));
    await reloaded([a, b], counts);
    await converge(server, [a, b]);
    for (const page of [a, b]) {
      await front(page);
      await page.waitFor(`${shown} && ${STATE} === 'Saved to index.html' && !document.querySelector('.reveal .slides').inert`, 20_000);
    }
    await show(a, 'One');
    await caretAtEnd(a, el(0, 'p'));
    await typeKeys(a, ', later');
    const text = await converge(server, [a, b]);
    assert.ok(text.includes(to) && text.includes('<p>First slide, later</p>') && text.includes('<p>Second slide early</p>'), text);
    clean(a);
    clean(b);
  });
}

const typeAtApply = (page, host, keys, compose) => page.evaluate(`(() => {
  const port = window.BeesonEditor.session;
  const apply = port.apply;
  port.apply = (text) => {
    port.apply = apply;
    const host = ${host};
    host.focus();
    const r = document.createRange();
    r.selectNodeContents(host);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    if (${compose}) host.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    document.execCommand('insertText', false, ${JSON.stringify(keys)});
    return apply(text);
  };
})()`);

for (const [what, slide, change, typed] of [
  ['a block element inside a paragraph', '', (text) => text.replace('<p>First slide</p>', '<p>First slide, see <div class="math">\\[x^2\\]</div></p>'), [[1, 'p', 'QQQ', false]]],
  [
    'a composition between a class backdrop taken off and a word changed after it',
    '  <div id="bd" class="backdrop"></div>\n',
    (text) => text.replace('class="backdrop"', 'class="later"').replace('<li>Alpha</li>', '<li>Alfa</li>'),
    [[0, 'h2', 'RRR', true], [1, 'p', 'QQQ', true]],
  ],
]) {
  test(`keys typed as an apply begins that cannot be made in full, with ${what}, reach index.html after both pages load again`, { timeout: 180_000 }, async (t) => {
    const browser = await launch({ offline: false });
    t.after(() => browser.close());
    const server = await talk(t);
    writeFileSync(server.file, TALK.replace('  <p>First slide</p>\n', `  <p>First slide</p>\n${slide}`));
    const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
    const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
    const pages = [a, b];
    await converge(server, pages);
    await show(a, 'Two');
    await show(b, 'Two');
    await caretAtEnd(b, el(1, 'p'));
    await typeKeys(b, ' early');
    const before = await converge(server, pages);
    for (const [page, selector, keys, compose] of typed) await typeAtApply(pages[page], el(1, selector), keys, compose);
    const counts = [await loads(a), await loads(b)];
    writeFileSync(server.file, change(before));
    await reloaded(pages, counts);
    const text = await converge(server, pages);
    assert.ok(text.includes('<p>Second slide earlyQQQ</p>'), text);
    if (typed.length > 1) assert.ok(text.includes('<h2>TwoRRR</h2>'), text);
  });
}

const rejected = (text) => text.replace('<p>Second slide</p>', '<p>Second slide<div>q</div></p>');
for (const [what, change, slow] of [
  ['answers a reload', (text) => text.replace('<p>Second slide', '<p>Second <b>slide')],
  ['is rejected', rejected],
  ['is rejected on a busy page', rejected, true],
]) {
  test(`a word committed at the end of a composition whose held-back change ${what} reaches index.html after both pages load again`, { timeout: 360_000 }, async (t) => {
    const browser = await launch({ offline: false });
    t.after(() => browser.close());
    const server = await talk(t);
    const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
    const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
    const pages = [a, b];
    await converge(server, pages);
    await show(a, 'Two');
    await show(b, 'Two');
    await front(b);
    await caretAtEnd(b, el(1, 'p'));
    await b.evaluate(`(() => {
      const port = window.BeesonEditor.session;
      const text = port.text;
      port.text = () => {
        const r = text();
        if (${el(1, 'p')}.textContent.includes('nih')) window.__read = r;
        return r;
      };
    })()`);
    await b.send('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 });
    await b.send('Input.imeSetComposition', { text: 'nih', selectionStart: 3, selectionEnd: 3 });
    await b.waitFor(`window.BeesonEditor.render().includes('<p>Second slidenih</p>')`);
    await until(async () => (await b.evaluate('window.__read')) === server.read(), 'a read of the client with the composing text shown, in index.html');
    assert.ok(server.read().includes('<p>Second slide</p>'), 'index.html does not hold the composing text');
    await b.evaluate(`(() => {
      const port = window.BeesonEditor.session;
      const apply = port.apply;
      port.apply = (text) => apply(text).then((r) => ((window.__resolved = text), r));
    })()`);
    const counts = [await loads(a), await loads(b)];
    const changed = change(server.read());
    writeFileSync(server.file, changed);
    const marker = changed.match(/<p>Second[^\n]*/)[0];
    await until(() => b.evaluate(`!!window.__resolved?.includes(${JSON.stringify(marker)})`), 'the apply that holds the change back');
    assert.ok((await b.evaluate('window.BeesonEditor.render()')).includes('<p>Second slidenih</p>'));
    if (slow) await b.evaluate(`(() => { window.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), 50); return true; })()`);
    await b.send('Input.insertText', { text: '你好' });
    await reloaded(pages, counts);
    const text = await converge(server, pages, 'the pages and index.html to agree', 30_000);
    const line = text.match(/<p>Second[^\n]*/)[0];
    assert.deepEqual([line.split('你好').length, line.replace('你好', '')], [2, marker], line);
  });
}

const HOLD = `(() => {
  const f = window.fetch.bind(window);
  window.__held = true;
  window.fetch = (...a) => f(...a).then(async (r) => { while (window.__held) await new Promise((d) => setTimeout(d, 20)); return r; });
  return true;
})()`;
const MOVES = {
  'a nudge of another element': { run: async (b) => {
    await b.evaluate(`${C}.app.selection.set('elements', [${el(1, 'ul')}])`);
    await press(b, 'ArrowDown');
  } },
  'a nudge of another element while the answers to the drag wait': { run: async (b) => {
    await b.evaluate(`${C}.app.selection.set('elements', [${el(1, 'ul')}])`);
    await press(b, 'ArrowDown');
  }, held: true },
  'a nudge of the dragged element': { run: async (b) => {
    await b.evaluate(`${C}.app.selection.set('elements', [${el(1, 'p')}])`);
    await press(b, 'ArrowDown');
  }, same: true },
  'a move of another element in the order of the slide': { run: async (b) => {
    await b.evaluate(`(async () => { const ul = ${el(1, 'ul')}; await ${C}.app.doc.move(ul, ul.parentElement, ${el(1, 'h2')}); return true; })()`);
  } },
};

for (const [name, move] of Object.entries(MOVES)) {
  test(`an Undo after a drag takes back the drag only, and not ${name} by another person`, { timeout: 300_000 }, async (t) => {
    const browser = await launch({ offline: false });
    t.after(() => browser.close());
    const server = await talk(t);
    const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
    const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
    await converge(server, [a, b]);
    for (const page of [a, b]) await show(page, 'Two');
    await front(a);
    await a.evaluate(`${C}.app.selection.set('elements', [${el(1, 'p')}])`);
    await a.waitFor(`!!document.querySelector('.beeson-handle')`);
    if (move.held) await a.evaluate(HOLD);
    await drag(a, '.beeson-handle', { dx: 80, dy: 40 });
    if (!move.held) assert.match(await converge(server, [a, b]), /<p style="translate: \d+px \d+px">Second slide<\/p>/);
    const dragged = server.read();
    await front(b);
    await move.run(b);
    if (move.held) {
      await until(() => server.read() !== dragged || null, 'the move of Ben in index.html');
      await a.evaluate('(window.__held = false, true)');
    }
    const moved = await converge(server, [a, b]);
    assert.match(moved, /<p style="translate: \d+px \d+px">Second slide<\/p>/);
    assert.notEqual(moved, dragged, 'Ben moved the list');
    const want = move.same ? moved : moved.replace(/<p style="translate: \d+px \d+px">Second slide<\/p>/, '<p>Second slide</p>');
    await front(a);
    await press(a, 'Mod+Z');
    assert.equal(await converge(server, [a, b]), want, 'the paragraph is back, and the list stays where Ben moved it');
    clean(a);
    clean(b);
  });
}

test('a name held by another person asks whether it is this person, says what continuing does, and Yes, continue takes the person over', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'ann', wait: false });
  const asked = `document.querySelector('dialog.beeson-edit-dialog[open] h3')?.textContent`;
  await b.waitFor(`${asked} === 'Ann has joined this deck before. Is this you?'`);
  assert.equal(await b.evaluate(`document.querySelector('dialog.beeson-edit-dialog[open] h3 bdi')?.textContent`), 'Ann');
  assert.deepEqual(await b.evaluate(`[...document.querySelectorAll('dialog.beeson-edit-dialog[open] .row button')].map((x) => x.textContent)`), ['Use another name', 'Yes, continue']);
  assert.equal(
    await b.evaluate(`document.querySelector('dialog.beeson-edit-dialog[open] p')?.textContent`),
    'If you are not this person, choose Use another name. If you continue, you join as this person, and you can edit and delete the comments of this person.',
  );
  await b.evaluate(`[...document.querySelectorAll('dialog.beeson-edit-dialog[open] .row button')].find((x) => x.textContent === 'Use another name').click()`);
  await b.waitFor(`document.querySelector('dialog.beeson-session-join')?.open`);
  await b.evaluate(`document.querySelector('dialog.beeson-session-join input').value = 'Ann'`);
  await b.evaluate(`document.querySelector('dialog.beeson-session-join .row button').click()`);
  await b.waitFor(`${asked} === 'Ann has joined this deck before. Is this you?'`);
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
  const heights = (p) => p.evaluate(`[...${open_}.querySelectorAll('.row button')].map((b) => b.offsetHeight)`);
  const low = (list) => list.filter((h) => h < 32);
  const other = await open(browser, sessionUrl(server.edit), { ...phone, name: '', wait: false });
  await other.waitFor(`document.querySelector('dialog.beeson-session-join')?.open`);
  assert.deepEqual(low(await heights(other)), [], 'the buttons of the join dialog');
  await other.evaluate(`document.querySelector('dialog.beeson-session-join input').value = 'Ann'`);
  await other.evaluate(`document.querySelector('dialog.beeson-session-join .row button.primary').click()`);
  await other.waitFor(`${open_}?.querySelector('h3').textContent === 'Ann has joined this deck before. Is this you?'`);
  assert.deepEqual(low(await heights(other)), [], 'the buttons of the taken dialog');
  if (SIGTERM_TELLS_THE_PAGES) {
    server.edit.child.kill('SIGTERM');
    await server.edit.exited;
    server.edit = null;
    await page.waitFor(`${open_}?.querySelector('h3').textContent === 'The session has ended'`);
    const ended = await heights(page);
    assert.ok(ended.length === 2 && !low(ended).length, `the buttons of the end dialog are ${ended.join(', ')} px high`);
  }
  clean(page);
});

test('the save state is written once in the title bar, in the title while it has room and otherwise in the button', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const drawn = `[...document.querySelectorAll('.beeson-edit-titlebar .doc .state, .beeson-session-state .name')].filter((el) => el.getClientRects().length).map((el) => [el.matches('.state') ? 'title' : 'button', el.textContent])`;
  const wide = await open(browser, sessionUrl(server.edit), { width: 1440, height: 900 });
  assert.deepEqual(await wide.evaluate(drawn), [['title', 'Saved to index.html']]);
  assert.deepEqual(await wide.evaluate(`(document.querySelector('.beeson-edit-titlebar .doc').classList.add('tight'), ${drawn})`), [['button', 'Saved to index.html']]);
  const phone = await open(browser, sessionUrl(server.edit), { width: 390, height: 844, mobile: true, name: 'Ben' });
  assert.deepEqual(await phone.evaluate(drawn), [['button', 'Saved to index.html']]);
  clean(wide);
  clean(phone);
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
  await front(ann);
  await show(ann, 'One');
  await caretAtEnd(ann, el(0, 'p'));
  await typeKeys(ann, 'x');
  await front(ben);
  await ben.waitFor(`window.__sent.includes('events') && ${el(0, 'p')}.textContent === 'First slidex'`);
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
