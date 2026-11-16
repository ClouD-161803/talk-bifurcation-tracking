// two and three people who type in one paragraph of a session in Chrome, on the edit command
// started on a temporary talk folder: a word that an input method composes reaches the others only
// once it is committed, and the keys that the others type during the composition, at its caret or
// on both sides of it, are kept. the keys of two people that come in one answer on both sides of an
// unread key of the person are kept with it. the letters of two people who type at one point stay
// together. an undo next to a space that the browser writes as &nbsp; removes only the typing of
// the person, and an undo of a word whose trailing space another browser took away is refused

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, STATE, TEXT, converge, show } from './helpers/client.mjs';
import { typeKeys } from './helpers/editor.mjs';
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

test('a word composed with an input method reaches the others once it is committed, and the keys that another person types at its caret during the composition are kept', { timeout: 120_000 }, async (t) => {
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

test('a word composed with an input method between the keys of two other people, one before it and one after it, keeps every key of both', { timeout: 120_000 }, async (t) => {
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

test('the letters of two people who type at one point stay together', { timeout: 120_000 }, async (t) => {
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

test('the keys of two other people that come in one answer on both sides of an unread key of the person are kept with it', { timeout: 120_000 }, async (t) => {
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

// the history of page settled after a command of it
const run = async (page, id) => {
  await front(page);
  await page.evaluate(`${C}.app.commands.run(${JSON.stringify(id)})`);
  await page.evaluate(`${C}.app.history.idle().then(() => true)`);
};

test('an undo of typing next to a space that the browser rewrote as &nbsp; removes only the typing of the person, and the undo of the other person removes only theirs', { timeout: 120_000 }, async (t) => {
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

test('an undo of a word whose trailing space the browser of another person took away is refused, and keeps the letters of the other person', { timeout: 120_000 }, async (t) => {
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
