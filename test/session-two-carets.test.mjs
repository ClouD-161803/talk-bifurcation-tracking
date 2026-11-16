// two and three people who type in one paragraph of a session in Chrome, on the edit command
// started on a temporary talk folder: a word that an input method composes reaches the others only
// once it is committed, and the keys, deletions, and pastes of the others during the composition,
// at its caret or around it, are kept with the word at its point. the keys of two people that come
// in one answer on both sides of an unread key of the person are kept with it, also after a long
// paste, the same letter typed by both is kept twice, and the same replacement made by both is kept
// once. an unread key stays whole beside a key of another person, and goes before an element that
// another person puts around the word after it. two people who take turns at one point each keep a
// run of their own. an undo next to a space that the browser writes as &nbsp; removes only the
// typing of the person, and an undo of a word whose trailing space another browser took away is
// refused. the keys of the person before a composition that starts while the history is busy are
// kept

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, STATE, TEXT, converge, loads, show } from './helpers/client.mjs';
import { press, typeKeys } from './helpers/editor.mjs';
import { NET } from './helpers/net.mjs';
import { el, session } from './helpers/presence.mjs';
import { until } from './helpers/session.mjs';

const p = el(1, 'p');
const para = (text) => text.match(/<p>[^\n]*<\/p>/g)[1];
const loose = (text) => text.replaceAll('&nbsp;', ' ');
const STEPS = ['n', 'ni', 'nih', 'niha', 'nihao'];

// the caret of a page put into the paragraph, at offset of its first text node
const caretAt = (page, offset) => page.evaluate(`(() => { const q = ${p}; q.focus(); getSelection().collapse(q.firstChild, ${offset}); return document.activeElement === q; })()`);
// every text that the paragraph of a page shows from now on, in window.__shown
const record = (page) => page.evaluate(`(() => {
  const q = ${p};
  window.__shown = [q.textContent];
  new MutationObserver(() => window.__shown.push(q.textContent)).observe(q, { characterData: true, childList: true, subtree: true });
  return true;
})()`);
const shown = (page) => page.evaluate('window.__shown');

// the paragraph read without the keys of others, which must be the paragraph before the composition
const without = (text, keys) => [...text].filter((c) => !keys.includes(c)).join('');

/**
 * Ana composes nihao at the offset 6 of the paragraph and commits 你好, while each other page types
 * its key at each step. index.html and the text that Ana reads take every key before the next step,
 * and the state line of Ana says that her deck is saved, since nothing waits for the composition.
 * The paragraph of index.html at each step is returned in files, and each text that the page of
 * another person showed before the commit in views.
 */
async function compose(server, ana, others) {
  const typed = others.map(() => '');
  const files = [];
  for (const s of STEPS) {
    await ana.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length });
    for (const [i, { page, keys }] of others.entries()) {
      const key = keys[typed[i].length % keys.length];
      await typeKeys(page, key);
      typed[i] += key;
    }
    const count = typed.join('').length;
    files.push(await until(async () => {
      const text = server.read();
      const got = para(text);
      return [...got].filter((c) => 'yz'.includes(c)).length === count && (await ana.evaluate(TEXT)) === text && (await ana.evaluate(STATE)) === 'Saved to index.html' ? got : null;
    }, `the ${count} keys of the others in index.html and in the text that Ana reads, and Saved on her page, with ${s} composed`));
  }
  const views = [];
  for (const { page } of others) views.push(...(await shown(page)));
  await ana.send('Input.insertText', { text: '你好' });
  return { typed, files, views };
}

// index.html and the pages of the others did not hold the composing word before its commit
function unseen({ files, views }) {
  for (const file of files) assert.equal(without(file, 'yz'), '<p>Second slide</p>', 'index.html does not hold the composing word');
  for (const text of views) assert.equal(without(text, 'yz'), 'Second slide', 'the page of another person does not show the composing word');
}

test('a word composed with an input method reaches the others once it is committed, and the keys that another person types at its caret during the composition are kept', { timeout: 300_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben']);
  const [ana, ben] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  assert.ok(await caretAt(ana, 6));
  assert.ok(await caretAt(ben, 6));
  await record(ben);
  const done = await compose(server, ana, [{ page: ben, keys: 'yz' }]);
  const [keys] = done.typed;
  const text = para(await converge(server, pages));
  assert.equal([...text].filter((c) => 'yz'.includes(c)).join(''), keys, `every key of Ben is in ${text}`);
  assert.equal(text.split('你好').length, 2, `the committed word is once in ${text}`);
  unseen(done);
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

test('a word composed with an input method between the keys of two other people, one before it and one after it, keeps every key of both', { timeout: 360_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben', 'Cleo']);
  const [ana, ben, cleo] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  assert.ok(await caretAt(ana, 6));
  assert.ok(await caretAt(ben, 0));
  assert.ok(await caretAt(cleo, 'Second slide'.length));
  await record(ben);
  await record(cleo);
  const done = await compose(server, ana, [{ page: ben, keys: 'y' }, { page: cleo, keys: 'z' }]);
  const text = para(await converge(server, pages));
  assert.equal(text, '<p>yyyyySecond你好 slidezzzzz</p>');
  unseen(done);
  assert.deepEqual([ana.errors, ben.errors, cleo.errors], [[], [], []]);
});

test('the letters of two people who take turns at one point each stay in a run of their own', { timeout: 240_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben']);
  const [ana, ben] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  assert.ok(await caretAt(ana, 6));
  assert.ok(await caretAt(ben, 6));
  // each turn is read by both pages before the next one, hence no key meets an unread key
  for (const [page, keys] of [[ben, 'ab'], [ana, 'yz'], [ben, 'c'], [ana, 'w']]) {
    await typeKeys(page, keys);
    await converge(server, pages);
  }
  assert.equal(para(server.read()), '<p>Secondyzwabc slide</p>');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

test('the keys of two other people that come in one answer on both sides of an unread key of the person are kept with it', { timeout: 300_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben', 'Cleo'], { pages: [{ script: NET }] });
  const [ana, ben, cleo] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  assert.ok(await caretAt(ana, 6));
  // a key of Ana typed after the client read the deck and before the apply of both keys reads it
  await ana.evaluate(`(() => {
    const port = window.BeesonEditor.session;
    const apply = port.apply;
    window.__armed = true;
    port.apply = function (text) {
      if (window.__armed && text.includes('BSecond slideC')) {
        window.__armed = false;
        document.execCommand('insertText', false, 'A');
      }
      return apply.call(this, text);
    };
    return true;
  })()`);
  // the poll of Ana is held, hence both keys come in its next answer
  await ana.evaluate(`__net.rule('/.session/events', 'hold') && __net.drop('/.session/events')`);
  await until(() => ana.evaluate('__net.held.length > 0'), 'a held poll of Ana');
  assert.ok(await caretAt(ben, 0));
  await typeKeys(ben, 'B');
  await caretAtEnd(cleo, p);
  await typeKeys(cleo, 'C');
  await until(() => para(server.read()) === '<p>BSecond slideC</p>', 'both keys in index.html');
  await ana.evaluate(`__net.clear() && __net.release('/.session/events')`);
  await until(() => ana.evaluate('window.__armed === false'), 'the key of Ana at the apply');
  const text = await converge(server, pages);
  assert.equal(para(text), '<p>BSecondA slideC</p>');
  assert.deepEqual([ana.errors, ben.errors, cleo.errors], [[], [], []]);
});

// the selection of a page put on the offsets a to b of the first text node of the paragraph
const selectIn = (page, a, b) => page.evaluate(`(() => { const q = ${p}; q.focus(); getSelection().setBaseAndExtent(q.firstChild, ${a}, q.firstChild, ${b}); return document.activeElement === q; })()`);

/**
 * Ana types key at her selection a to b inside the apply whose text holds marker, i.e. after her
 * client read the deck, while her poll is held until the change of the others is in index.html, so
 * that all of it comes in one answer. Returns the paragraph that the pages and index.html agree on.
 */
async function race(t, { names = ['Ana', 'Ben'], edits = [], ana: [a, b, key], marker, ben }) {
  const { server, pages } = await session(t, names, { edits, pages: [{ script: NET }] });
  const [ana, ...others] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  assert.ok(await selectIn(ana, a, b));
  await ana.evaluate(`(() => {
    const port = window.BeesonEditor.session;
    const apply = port.apply;
    window.__armed = true;
    port.apply = function (text) {
      if (window.__armed && text.includes(${JSON.stringify(marker)})) {
        window.__armed = false;
        document.execCommand('insertText', false, ${JSON.stringify(key)});
      }
      return apply.call(this, text);
    };
    return true;
  })()`);
  await ana.evaluate(`__net.rule('/.session/events', 'hold') && __net.drop('/.session/events')`);
  await until(() => ana.evaluate('__net.held.length > 0'), 'a held poll of Ana');
  await ben(...others);
  await until(() => para(server.read()).includes(marker), 'the change of the others in index.html');
  await ana.evaluate(`__net.clear() && __net.release('/.session/events')`);
  await until(() => ana.evaluate('window.__armed === false'), 'the key of Ana at the apply');
  const text = para(await converge(server, pages));
  assert.deepEqual(pages.map((page) => page.errors), pages.map(() => []));
  return text;
}

// the history of page settled after a command of it
const run = async (page, id) => {
  await front(page);
  await page.evaluate(`${C}.app.commands.run(${JSON.stringify(id)})`);
  await page.evaluate(`${C}.app.history.idle().then(() => true)`);
};

test('an undo of typing next to a space that the browser rewrote as &nbsp; removes only the typing of the person, and the undo of the other person removes only theirs', { timeout: 240_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben'], { edits: [['  <p>Second slide</p>', '  <p>Second <code>x+1</code> slide</p>']] });
  const [ana, ben] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  // both carets after the space that follows the code element
  const after = (page) => page.evaluate(`(() => { const q = ${p}; q.focus(); getSelection().collapse(q.lastChild, 1); return document.activeElement === q; })()`);
  assert.ok(await after(ana));
  await typeKeys(ana, 'ab cd');
  await converge(server, pages);
  assert.match(await ana.evaluate(`${p}.innerHTML`), /<\/code>&nbsp;ab cdslide$/, 'Chrome writes the space before the typing of Ana as &nbsp;');
  assert.ok(await after(ben));
  await typeKeys(ben, 'q');
  let text = await converge(server, pages);
  assert.equal(loose(para(text)), '<p>Second <code>x+1</code> qab cdslide</p>');
  await run(ana, 'edit.undo');
  text = await converge(server, pages);
  assert.equal(loose(para(text)), '<p>Second <code>x+1</code> qslide</p>', 'the undo of Ana removes her typing alone');
  await run(ben, 'edit.undo');
  text = await converge(server, pages);
  assert.equal(loose(para(text)), '<p>Second <code>x+1</code> slide</p>', 'the undo of Ben removes his typing alone');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

test('an undo of a word whose trailing space the browser of another person took away is refused, and keeps the letters of the other person', { timeout: 240_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben']);
  const [ana, ben] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await caretAtEnd(ana, p);
  await typeKeys(ana, ' foo ');
  await converge(server, pages);
  await caretAtEnd(ben, p);
  await typeKeys(ben, 'bar');
  let text = await converge(server, pages);
  assert.equal(para(text), '<p>Second slide foobar</p>', 'Chrome of Ben takes away the trailing space of Ana');
  assert.equal(await ana.evaluate(`${C}.app.history.undoLabel`), 'typing');
  await run(ana, 'edit.undo');
  text = await converge(server, pages);
  assert.equal(para(text), '<p>Second slide foobar</p>');
  assert.equal(await ana.evaluate(`${C}.app.history.undoLabel`), null, 'the refused entry is dropped');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

// Ben makes the word slide bold or italic with a command
const format = (id) => async (page) => {
  assert.ok(await selectIn(page, 7, 12));
  await run(page, id);
};

test('an unread less-than sign that replaces a letter stays one character reference beside the key of another person after the letter', { timeout: 240_000 }, async (t) => {
  const text = await race(t, {
    ana: [8, 9, '<'],
    marker: 'slZide',
    ben: async (page) => {
      assert.ok(await selectIn(page, 9, 9));
      await typeKeys(page, 'Z');
    },
  });
  assert.equal(text, '<p>Second s&lt;Zide</p>');
});

test('an unread ampersand that replaces a letter stays one character reference beside the key of another person after the letter', { timeout: 240_000 }, async (t) => {
  const text = await race(t, {
    edits: [['  <p>Second slide</p>', '  <p>Second cat</p>']],
    ana: [8, 9, '&'],
    marker: 'caZt',
    ben: async (page) => {
      assert.ok(await selectIn(page, 9, 9));
      await typeKeys(page, 'Z');
    },
  });
  assert.equal(text, '<p>Second c&amp;Zt</p>');
});

test('an unread key at the start of a word that another person makes italic goes before the new element', { timeout: 240_000 }, async (t) => {
  const text = await race(t, { ana: [7, 7, 'Z'], marker: '<em>slide</em>', ben: format('text.italic') });
  assert.equal(text, '<p>Second Z<em>slide</em></p>');
});

test('a word composed at the start of a word that another person makes bold during the composition goes before the new element', { timeout: 240_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben']);
  const [ana, ben] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  assert.ok(await caretAt(ana, 7));
  for (const s of ['n', 'ni']) await ana.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length });
  await format('text.bold')(ben);
  await until(() => para(server.read()).includes('<strong>'), 'the bold of Ben in index.html');
  await until(async () => (await ana.evaluate(TEXT)).includes('<strong>'), 'the bold of Ben in the text that Ana reads');
  await ana.send('Input.imeSetComposition', { text: 'nih', selectionStart: 3, selectionEnd: 3 });
  await ana.send('Input.insertText', { text: '你好' });
  const text = para(await converge(server, pages));
  assert.equal(text, '<p>Second 你好<strong>slide</strong></p>');
  assert.deepEqual([await loads(ana), ana.errors, ben.errors], [1, [], []], 'the page of Ana is not loaded again');
});

const prose = 'The spacecraft leaves the halo orbit near the second Lagrange point and follows the stable manifold toward the Moon. ';
for (const [what, paste, words, at] of [
  ['more than 500 characters', 'x'.repeat(600), 'Second slide', 6],
  ['1,200 characters of English prose', prose.repeat(11).slice(0, 1200), 'Second slide', 6],
  ['600 Chinese characters', '天地玄黄宇宙洪荒日月盈昃辰宿列张'.repeat(40).slice(0, 600), '今天我们讨论轨道', 4],
]) {
  test(`a paste of ${what} and a key of a third person on the other side of an unread key of the person are kept with it`, { timeout: 300_000 }, async (t) => {
    const text = await race(t, {
      names: ['Ana', 'Ben', 'Cleo'],
      edits: words === 'Second slide' ? [] : [['  <p>Second slide</p>', `  <p>${words}</p>`]],
      ana: [at, at, 'A'],
      marker: `${words}C`,
      ben: async (ben, cleo) => {
        assert.ok(await caretAt(ben, 0));
        await ben.evaluate(`document.execCommand('insertText', false, ${JSON.stringify(paste)})`);
        await caretAtEnd(cleo, p);
        await typeKeys(cleo, 'C');
      },
    });
    assert.equal(text, `<p>${paste}${words.slice(0, at)}A${words.slice(at)}C</p>`);
  });
}

test('the same letter typed at one point by another person and as an unread key of the person is kept twice', { timeout: 240_000 }, async (t) => {
  const text = await race(t, {
    ana: [6, 6, 'e'],
    marker: 'Seconde',
    ben: async (ben) => {
      assert.ok(await caretAt(ben, 6));
      await typeKeys(ben, 'e');
    },
  });
  assert.equal(text, '<p>Secondee slide</p>');
});

// the diff of each page gives the change as a removal and an insertion, e.g. of sli and ck for
// slide into deck, which are one change of each person
for (const [words, a, b, word, want] of [
  ['Second slide', 7, 12, 'deck', 'Second deck'],
  ['Second teh slide', 7, 10, 'the', 'Second the slide'],
]) {
  test(`the same replacement of ${words.slice(a, b)} by ${word} made by another person and as an unread change of the person is kept once`, { timeout: 240_000 }, async (t) => {
    const text = await race(t, {
      edits: words === 'Second slide' ? [] : [['  <p>Second slide</p>', `  <p>${words}</p>`]],
      ana: [a, b, word],
      marker: want,
      ben: async (ben) => {
        assert.ok(await selectIn(ben, a, b));
        await ben.evaluate(`document.execCommand('insertText', false, ${JSON.stringify(word)})`);
      },
    });
    assert.equal(text, `<p>${want}</p>`);
  });
}

// two pages in the paragraph, with the focus of each emulated, so that both hold a caret at once
async function pair(t) {
  const s = await session(t, ['Ana', 'Ben']);
  for (const page of s.pages) await show(page, 'Two');
  for (const page of s.pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  return s;
}

// Ana composes each step, and act(i) runs on the page of Ben after step i. when act returns true,
// the step waits until index.html changes and Ana reads it
async function stepped(server, ana, steps, act) {
  for (const [i, s] of steps.entries()) {
    await ana.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length });
    const was = server.read();
    if (await act(i)) await until(async () => server.read() !== was && (await ana.evaluate(TEXT)) === server.read(), `the edit of Ben with ${s} composed`);
  }
}

test('a key of another person at the caret of a composition that equals the first letter of the reading is kept, at each step', { timeout: 240_000 }, async (t) => {
  const { server, pages } = await pair(t);
  const [ana, ben] = pages;
  assert.ok(await caretAt(ana, 6));
  assert.ok(await caretAt(ben, 6));
  await stepped(server, ana, ['n', 'ni', 'nih'], async () => (await typeKeys(ben, 'n'), true));
  await ana.send('Input.insertText', { text: '你好' });
  assert.equal(para(await converge(server, pages)), '<p>Secondnnn你好 slide</p>');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

test('two keys of another person at the caret of a composition, the first of which equals the reading, are kept', { timeout: 180_000 }, async (t) => {
  const { server, pages } = await pair(t);
  const [ana, ben] = pages;
  assert.ok(await caretAt(ana, 6));
  assert.ok(await caretAt(ben, 6));
  await stepped(server, ana, ['n', 'ni', 'nih'], async (i) => (i === 0 ? (await typeKeys(ben, 'nx'), true) : false));
  await ana.send('Input.insertText', { text: '你好' });
  assert.equal(para(await converge(server, pages)), '<p>Secondnx你好 slide</p>');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

test('a letter that another person deletes before the caret of a composition whose reading starts with it stays deleted', { timeout: 180_000 }, async (t) => {
  const { server, pages } = await pair(t);
  const [ana, ben] = pages;
  assert.ok(await caretAt(ana, 6));
  assert.ok(await caretAt(ben, 6));
  await stepped(server, ana, ['d', 'da', 'dao'], async (i) => (i === 1 ? (await press(ben, 'Backspace'), true) : false));
  await ana.send('Input.insertText', { text: '到' });
  assert.equal(para(await converge(server, pages)), '<p>Secon到 slide</p>');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

test('a sentence that another person pastes over the paragraph around the caret of a composition is kept whole, with the committed word once', { timeout: 180_000 }, async (t) => {
  const { server, pages } = await pair(t);
  const [ana, ben] = pages;
  assert.ok(await caretAt(ana, 6));
  await ana.send('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 });
  assert.ok(await ben.evaluate(`(() => { const q = ${p}; q.focus(); getSelection().selectAllChildren(q); return document.activeElement === q; })()`));
  await ben.send('Input.insertText', { text: 'Secret plan' });
  await until(async () => para(server.read()) === '<p>Secret plan</p>' && (await ana.evaluate(TEXT)) === server.read(), 'the sentence of Ben in index.html and in the text that Ana reads');
  await ana.send('Input.insertText', { text: '你好' });
  assert.equal(para(await converge(server, pages)), '<p>Secret你好 plan</p>');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

test('a key typed right before a composition that starts while an apply waits reaches index.html before the commit', { timeout: 180_000 }, async (t) => {
  const { server, pages } = await pair(t);
  const [ana, ben] = pages;
  assert.ok(await caretAt(ana, 6));
  assert.ok(await caretAt(ben, 0));
  // the key x of Ana and the start of her composition come while the apply of the key of Ben waits
  await ana.evaluate(`(() => {
    const port = window.BeesonEditor.session;
    const apply = port.apply;
    window.__armed = true;
    port.apply = function (text) {
      const r = apply.call(this, text);
      if (window.__armed && text.includes('BSecond')) {
        window.__armed = false;
        document.execCommand('insertText', false, 'x');
        ${p}.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
      }
      return r;
    };
    return true;
  })()`);
  await typeKeys(ben, 'B');
  await until(() => ana.evaluate('window.__armed === false'), 'the key of Ana at the apply');
  await until(() => para(server.read()) === '<p>BSecondx slide</p>', 'the key of Ana in index.html during the composition');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

const first = (text) => text.match(/<p>[^\n]*<\/p>/g)[0];

// Ana types MN in the paragraph of slide One, which her client reads, and starts a composition in
// the paragraph of slide Two while a transaction of her history is open, as an undo with a TeX
// restore, a paste of a picture, or an inline formula keeps one open. the test ends the transaction
// during the composition
for (const between of [false, true]) {
  test(`the keys of the person before a composition that starts while the history is busy stay in index.html${between ? ', also with a key of another person during the composition' : ''}`, { timeout: 240_000 }, async (t) => {
    const { server, pages } = await pair(t);
    const [ana, ben] = pages;
    await show(ana, 'One');
    await caretAtEnd(ana, el(0, 'p'));
    await typeKeys(ana, 'MN');
    await until(async () => first(server.read()) === '<p>First slideMN</p>' && (await ana.evaluate(`${C}.acked()`)), 'MN in index.html');
    await show(ana, 'Two');
    assert.ok(await caretAt(ana, 6));
    await ana.evaluate(`(() => { ${C}.app.history.transact('Wait', () => new Promise((end) => (window.__end = end))); return true; })()`);
    await ana.send('Input.imeSetComposition', { text: 'K', selectionStart: 1, selectionEnd: 1 });
    await ana.evaluate(`(window.__end(), ${C}.app.history.settle().then(() => true))`);
    await ana.send('Input.imeSetComposition', { text: 'KJ', selectionStart: 2, selectionEnd: 2 });
    if (between) {
      await caretAtEnd(ben, el(1, 'h2'));
      await typeKeys(ben, 'Z');
      await until(async () => (await ana.evaluate(TEXT)).includes('TwoZ'), 'the key of Ben in the text that Ana reads');
    }
    await until(async () => (await ana.evaluate(`${C}.acked()`)) && (await ana.evaluate(TEXT)) === server.read(), 'the text that Ana reads during the composition in index.html');
    assert.equal(first(server.read()), '<p>First slideMN</p>', 'index.html keeps MN during the composition');
    await ana.send('Input.insertText', { text: '你好' });
    const text = await converge(server, pages);
    assert.equal(`${first(text)} ${para(text)}`, '<p>First slideMN</p> <p>Second你好 slide</p>');
    assert.deepEqual([ana.errors, ben.errors], [[], []]);
  });
}
