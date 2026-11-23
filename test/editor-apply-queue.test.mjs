import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { click, editorPage, typeKeys } from './helpers/editor.mjs';
import { E, applyOn, caretAtEnd, frame, front, sessionPage, showSlide } from './helpers/apply.mjs';
import { closeGate, openGate } from './helpers/gate.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

const P1 = `[...document.querySelectorAll('.reveal p')].find((p) => p.textContent.includes('the complete slide'))`;
const P2 = `[...document.querySelectorAll('.reveal p')].find((p) => p.textContent.includes('the code into its box'))`;
const THANKS = `[...document.querySelectorAll('.reveal h1')].find((h) => h.textContent.startsWith('Thank you'))`;
const SECTIONS = `document.querySelectorAll('.reveal .slides > section').length`;
const once = (text, from, to) => {
  assert.equal(text.split(from).length, 2, `${from} is once in the text`);
  return text.replace(from, to);
};
const render = (page) => page.evaluate(`${E}.render()`);
const sessionText = (page) => page.evaluate(`${E}.session.text()`);
const changes = (page) => page.evaluate('window.__changes');

const start = (page, name, text) => page.evaluate(`(() => {
  window.__results ??= {};
  window.__results[${JSON.stringify(name)}] = null;
  ${E}.apply(${JSON.stringify(text)}).then((r) => (window.__results[${JSON.stringify(name)}] = r.reload));
  return true;
})()`);
const resolved = (...names) => names.map((n) => `window.__results?.[${JSON.stringify(n)}] != null`).join(' && ');

async function row(page, n, modifiers = '') {
  const at = await page.evaluate(`(() => {
    const r = document.querySelectorAll('.beeson-edit-nav .row')[${n}];
    if (!r) return null;
    r.scrollIntoView({ block: 'nearest' });
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`);
  assert.ok(at, `the navigator has a row ${n}`);
  await click(page, at, { modifiers });
  await frame(page);
}

test('an edit typed between two queued applies is kept through both, and told through onChange after them', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  const one = once(b.source, 'Copy-paste the code', 'Paste the code');
  const two = once(one, 'Thank you', 'Thanks');
  const told = await changes(b);
  const result = await b.evaluate(`(() => {
    const first = ${E}.apply(${JSON.stringify(one)});
    document.execCommand('insertText', false, ' Typed.');
    const second = ${E}.apply(${JSON.stringify(two)});
    return Promise.all([first, second]).then((r) => r.map((x) => x.reload));
  })()`);
  assert.deepEqual(result, [false, false]);
  const want = once(two, 'viewer\'s attention.</p>', 'viewer\'s attention. Typed.</p>');
  assert.equal(await render(b), want);
  await b.waitFor(`window.__changes > ${told}`);
  assert.equal(await sessionText(b), want);
  assert.deepEqual(b.errors, []);
});

for (const [what, select, from, to, want] of [
  ['an insertion of the apply at the point of the key keeps both, the apply first', false, 'attention.</p>', 'attention. See more.</p>', 'attention. See more.QQQ</p>'],
  ['a change of the apply to the characters that the key replaced keeps the key', true, "viewer's attention.", "viewer's focus.", "viewer's QQQ."],
]) {
  test(`a key that the client has not read and ${what}`, async (t) => {
    const b = await sessionPage(browser);
    t.after(() => b.close());
    await showSlide(b, 'Show your steps');
    await caretAtEnd(b, P1);
    const told = await changes(b);
    const result = await b.evaluate(`(() => {
      const p = ${P1};
      if (${select}) {
        const node = p.firstChild;
        const at = node.data.indexOf('attention');
        getSelection().setBaseAndExtent(node, at, node, at + 'attention'.length);
      }
      document.execCommand('insertText', false, 'QQQ');
      return ${E}.apply(${JSON.stringify(once(b.source, from, to))}).then((r) => r.reload);
    })()`);
    assert.equal(result, false);
    assert.equal(await render(b), once(b.source, from, want));
    const caret = await b.evaluate(`(() => {
      const p = ${P1};
      const s = getSelection();
      const r = document.createRange();
      r.setStart(p, 0);
      r.setEnd(s.anchorNode, s.anchorOffset);
      return { focused: document.activeElement === p, collapsed: s.isCollapsed, before: r.toString().slice(-12) };
    })()`);
    assert.deepEqual(caret, { focused: true, collapsed: true, before: select ? "viewer's QQQ" : 'See more.QQQ' });
    await b.waitFor(`window.__changes > ${told}`);
    assert.equal(await sessionText(b), await render(b));
    assert.deepEqual(b.errors, []);
  });
}

test('a box that the document model inserts while two applies arrive is kept, with its entry of the history', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  const one = once(b.source, 'Copy-paste the code', 'Paste the code');
  const two = once(one, 'Thank you', 'Thanks');
  const told = await changes(b);
  await closeGate(b);
  await b.evaluate(`(() => {
    ${E}.doc.insert(${JSON.stringify('<p>Inserted \\(x^2\\) here.</p>')}, window.__shown);
    return true;
  })()`);
  await b.waitFor('window.__held > 0');
  await start(b, 'one', one);
  await start(b, 'two', two);
  await openGate(b);
  await b.waitFor(resolved('one', 'two'));
  assert.deepEqual(await b.evaluate('window.__results'), { one: false, two: false });
  const got = await render(b);
  for (const part of ['Inserted \\(x^2\\) here.', 'Paste the code', 'Thanks']) assert.ok(got.includes(part), `the page renders ${part}`);
  assert.equal(await b.evaluate(`[...document.querySelectorAll('.reveal p')].some((p) => p.textContent.startsWith('Inserted'))`), true, 'the box is on the page');
  const s = await b.evaluate(`${E}.status()`);
  assert.deepEqual(s.problems, []);
  assert.equal(s.undo, true, 'the insert is kept in the history');
  await b.waitFor(`window.__changes > ${told}`);
  assert.equal(await sessionText(b), got);
  assert.deepEqual(b.errors, []);
});

test('a content that the document model sets while an apply arrives is kept, and told through onChange after the apply', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  await typeKeys(b, '!');
  await b.waitFor('window.__changes > 0');
  const mine = await sessionText(b);
  assert.ok(mine.includes('attention.!</p>'));
  await closeGate(b);
  await b.evaluate(`(() => {
    ${E}.doc.setContent(${P1}, ${JSON.stringify('Local \\(y\\) content')});
    return true;
  })()`);
  await b.waitFor(`window.__held > 0 && ${P1} === undefined`);
  const told = await changes(b);
  await start(b, 'remote', once(mine, 'Thank you', 'Remote Thank you'));
  await openGate(b);
  await b.waitFor(resolved('remote'));
  assert.equal(await b.evaluate('window.__results.remote'), false);
  const want = once(once(mine, 'Thank you', 'Remote Thank you'), 'Design the complete slide first, then break it up into steps. Direct the viewer\'s attention.!', 'Local \\(y\\) content');
  assert.equal(await render(b), want);
  await b.waitFor(`window.__changes > ${told}`);
  assert.equal(await sessionText(b), want);
  assert.deepEqual(b.errors, []);
});

test('slides duplicated while an apply arrives are kept, as the apply merges onto the text read before the duplicate', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  const n = await b.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].indexOf(window.__shown)`);
  await row(b, n);
  await row(b, n + 1, 'Shift');
  assert.equal((await b.evaluate(`${E}.state('slide.duplicate')`)).label, 'Duplicate Slides');
  const count = await b.evaluate(SECTIONS);
  const mine = await sessionText(b);
  const told = await changes(b);
  await closeGate(b, `${SECTIONS} === ${count + 2}`);
  await b.evaluate(`(() => {
    ${E}.exec('slide.duplicate');
    return true;
  })()`);
  await b.waitFor('window.__held > 0');
  await start(b, 'remote', once(mine, '<h1>Thank you</h1>', '<h1>Thank you XYZ</h1>'));
  await openGate(b);
  await b.waitFor(resolved('remote'));
  assert.equal(await b.evaluate('window.__results.remote'), false);
  assert.equal(await b.evaluate(SECTIONS), count + 2, 'both copies are on the page');
  const got = await render(b);
  assert.equal(got.split('<h2>Show your steps one at a time</h2>').length, 3, 'both copies are in the text');
  assert.ok(got.includes('<h1>Thank you XYZ</h1>'), 'the change of the other person is in the text');
  await b.waitFor(`window.__changes > ${told}`);
  assert.equal(await sessionText(b), got);
  assert.deepEqual(b.errors, []);
});

test('an edit of the person is kept when the apply removes more than half of the text', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Thank you');
  await caretAtEnd(b, THANKS);
  const from = b.source.indexOf('<section>\n  <h2>Show your steps');
  const to = b.source.indexOf('<section class="closing">');
  assert.ok(from > 0 && to - from > b.source.length / 2, 'the apply removes more than half of the text');
  const remote = b.source.slice(0, from) + b.source.slice(to);
  const result = await b.evaluate(`(() => {
    const done = ${E}.apply(${JSON.stringify(remote)});
    document.execCommand('insertText', false, ' Typed');
    return done.then((r) => r.reload);
  })()`);
  assert.equal(result, false);
  const want = once(remote, '<h1>Thank you</h1>', '<h1>Thank you Typed</h1>');
  assert.equal(await render(b), want);
  assert.equal(await sessionText(b), want);
  assert.deepEqual(b.errors, []);
});

test('a key typed before the engine of the port is loaded is kept by its first apply', async (t) => {
  const b = await editorPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Thank you');
  await caretAtEnd(b, THANKS);
  await typeKeys(b, ' Typed');
  const remote = once(b.source, 'Design the complete', 'Plan the complete');
  const result = await applyOn(b, remote);
  assert.equal(result.reload, false);
  const want = once(remote, '<h1>Thank you</h1>', '<h1>Thank you Typed</h1>');
  assert.equal(await render(b), want);
  assert.equal(await sessionText(b), want);
  assert.deepEqual(b.errors, []);
});

const PLAN = (text) => once(text, 'Design the complete', 'Plan the complete');
const compose = (page, type) => page.evaluate(`${P1}.dispatchEvent(new CompositionEvent(${JSON.stringify(type)}, { bubbles: true, data: '' }))`);

test('during a composition, an apply into the composing text resolves at once and holds back only this text, which takes the change at the end of the composition', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  await compose(b, 'compositionstart');
  const first = PLAN(b.source);
  const second = once(first, '<h1>Thank you</h1>', '<h1>Thank you Y</h1>');
  const told = await changes(b);
  await start(b, 'first', first);
  await start(b, 'second', second);
  await b.evaluate(`document.execCommand('insertText', false, 'q')`);
  await b.waitFor(resolved('first', 'second'));
  assert.deepEqual(await b.evaluate('window.__results'), { first: false, second: false });
  assert.equal(await b.evaluate(`${THANKS}.textContent`), 'Thank you Y');
  await b.waitFor(`window.__changes > ${told}`);
  const want = once(second, 'viewer\'s attention.</p>', 'viewer\'s attention.q</p>');
  assert.equal(await sessionText(b), second, 'the text read during the composition, without the composing text');
  assert.equal(await b.evaluate(`${P1}.textContent`), 'Design the complete slide first, then break it up into steps. Direct the viewer\'s attention.q', 'the composing text is left as it is');
  await compose(b, 'compositionend');
  await b.waitFor(`${P1}?.textContent.startsWith('Plan the complete')`);
  assert.equal(await render(b), want);
  assert.equal(await sessionText(b), want);
  assert.deepEqual((await b.evaluate(`${E}.status()`)).problems, []);
  assert.deepEqual(b.errors, []);
});

test('during a composition, the changes before and after the composing text are applied at once', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  await compose(b, 'compositionstart');
  let text = once(b.source, '<h2>Chapter one</h2>', '<h2>Chapter one A</h2>');
  text = once(text, '<h2>Show your steps one at a time</h2>', '<h2>Show your steps one at a time B</h2>');
  text = PLAN(text);
  text = once(text, 'Two elements with the same index', 'Two items with the same index');
  text = once(text, 'one slide per step.</li>\n  </ul>\n', 'one slide per step.</li>\n  </ul>\n  <p>A box of another person.</p>\n');
  text = once(text, '<h1>Thank you</h1>', '<h1>Thank you C</h1>');
  await start(b, 'all', text);
  await b.waitFor(`(() => {
    const heads = [...document.querySelectorAll('.reveal h2')].map((h) => h.textContent);
    return heads.includes('Chapter one A') && heads.includes('Show your steps one at a time B') && ${THANKS}?.textContent === 'Thank you C'
      && [...document.querySelectorAll('.reveal li')].some((li) => li.textContent.startsWith('Two items'))
      && [...document.querySelectorAll('.reveal p')].some((p) => p.textContent === 'A box of another person.');
  })()`);
  assert.equal(await b.evaluate(`${P1}.textContent`), 'Design the complete slide first, then break it up into steps. Direct the viewer\'s attention.', 'the composing text is left as it is');
  await compose(b, 'compositionend');
  await b.waitFor(`${P1}?.textContent.startsWith('Plan the complete')`);
  assert.equal(await b.evaluate('window.__results.all'), false);
  assert.equal(await render(b), text);
  assert.deepEqual((await b.evaluate(`${E}.status()`)).problems, []);
  assert.deepEqual(b.errors, []);
});

const SAFARI_COMMIT = (key) => `(async () => {
  const p = ${P1};
  const node = p.lastChild;
  p.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: ${JSON.stringify(key)} }));
  for (let i = 0; i < 100; i++) await null;
  node.appendData(${JSON.stringify(key)});
  getSelection().collapse(node, node.length);
  p.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromComposition', data: ${JSON.stringify(key)} }));
  return true;
})()`;

test('a change held back across a tag is applied after the input that Safari sends after the end of the composition, and the committed text is kept', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  await compose(b, 'compositionstart');
  const text = once(b.source, 'Design the complete slide', 'Design the <b>complete</b> slide');
  await start(b, 'held', text);
  await b.waitFor(resolved('held'));
  assert.equal(await b.evaluate(`!!${P1}.querySelector('b')`), false, 'the change is held back');
  await b.evaluate(SAFARI_COMMIT('q'));
  await b.waitFor(`!!${P1}?.querySelector('b')`);
  const want = once(text, 'viewer\'s attention.</p>', 'viewer\'s attention.q</p>');
  assert.equal(await b.evaluate(`${P1}.textContent.endsWith('attention.q')`), true, 'the committed text is kept');
  assert.equal(await render(b), want);
  assert.deepEqual((await b.evaluate(`${E}.status()`)).problems, []);
  assert.deepEqual(b.errors, []);
});

test('a key typed at the point of a remote insertion that waits for its turn is kept after the insertion', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  const text = once(b.source, 'viewer\'s attention.</p>', 'viewer\'s attention.R</p>');
  const result = await b.evaluate(`(() => {
    const done = ${E}.apply(${JSON.stringify(text)});
    document.execCommand('insertText', false, 'k');
    return done.then((r) => r.reload);
  })()`);
  assert.equal(result, false);
  const want = once(text, 'viewer\'s attention.R</p>', 'viewer\'s attention.Rk</p>');
  assert.equal(await render(b), want);
  assert.equal(await sessionText(b), want);
  assert.deepEqual(b.errors, []);
});

test('an insertion held back at the end of the composing word is kept with the committed word', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  await compose(b, 'compositionstart');
  const text = once(b.source, 'viewer\'s attention.</p>', 'viewer\'s attention. R</p>');
  await start(b, 'held', text);
  await b.waitFor(resolved('held'));
  await b.evaluate(`document.execCommand('insertText', false, 'q')`);
  const want = once(text, 'viewer\'s attention. R</p>', 'viewer\'s attention. Rq</p>');
  assert.equal(await b.evaluate(`${E}.session.copy()`), want, 'the text read during the composition');
  await compose(b, 'compositionend');
  await b.waitFor(`${P1}?.textContent.endsWith(' Rq')`);
  assert.equal(await render(b), want);
  assert.deepEqual(b.errors, []);
});

test('a composing text that loses the focus without the end of its composition takes the change held back, and is read from then on', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  await compose(b, 'compositionstart');
  const text = PLAN(b.source);
  await start(b, 'first', text);
  await b.waitFor(`${E}.session.text() === ${JSON.stringify(text)}`);
  assert.equal(await b.evaluate(`${P1}.textContent.startsWith('Design')`), true, 'the change is held back');
  await b.evaluate(`document.execCommand('insertText', false, 'q')`);
  assert.equal(await sessionText(b), text, 'the text read during the composition, without the composing text');
  const want = once(text, 'viewer\'s attention.</p>', 'viewer\'s attention.q</p>');
  await caretAtEnd(b, `[...document.querySelectorAll('.reveal h2')].find((h) => h.textContent.startsWith('Show your steps'))`);
  await b.waitFor(`${P1}?.textContent.startsWith('Plan the complete')`);
  assert.equal(await render(b), want);
  assert.equal(await sessionText(b), want, 'the text read after the composition, with the composing text');
  assert.deepEqual(b.errors, []);
});

test('a composing text that loses the focus without the end of its composition while nothing is held back is told to the client', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  await compose(b, 'compositionstart');
  await b.evaluate(`document.execCommand('insertText', false, 'q')`);
  await b.waitFor(`window.__changes > 0`);
  assert.equal(await b.evaluate(`${E}.session.text().includes("attention.q")`), false, 'the text read during the composition, without the composing text');
  const told = await b.evaluate('window.__changes');
  await caretAtEnd(b, `[...document.querySelectorAll('.reveal h2')].find((h) => h.textContent.startsWith('Show your steps'))`);
  await b.waitFor(`window.__changes > ${told}`, 15_000);
  assert.equal(await b.evaluate(`${E}.session.text().includes("attention.q")`), true, 'the text read after the focus is lost, with the composing text');
  assert.deepEqual(b.errors, []);
});

test('a composing text on a page that is hidden without the end of its composition takes the change held back, and is read from then on', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  await compose(b, 'compositionstart');
  const text = PLAN(b.source);
  await start(b, 'first', text);
  await b.waitFor(`${E}.session.text() === ${JSON.stringify(text)}`);
  assert.equal(await b.evaluate(`${P1}.textContent.startsWith('Design')`), true, 'the change is held back');
  await b.evaluate(`document.execCommand('insertText', false, 'q')`);
  assert.equal(await sessionText(b), text, 'the text read during the composition, without the composing text');
  const want = once(text, 'viewer\'s attention.</p>', 'viewer\'s attention.q</p>');
  const other = await browser.newPage();
  t.after(() => other.close());
  await front(other);
  await b.waitFor('document.hidden');
  await b.waitFor(`${P1}?.textContent.startsWith('Plan the complete')`);
  assert.equal(await render(b), want);
  assert.equal(await sessionText(b), want, 'the text read after the composition, with the composing text');
  assert.deepEqual(b.errors, []);
});

test('a change held back during a composition that cannot be made in full at its end loads the page again through onReload', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await b.evaluate(`(() => {
    window.__reloads = 0;
    ${E}.session.onReload(() => window.__reloads++);
    return true;
  })()`);
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  await compose(b, 'compositionstart');
  const text = once(b.source, "viewer's attention.</p>", "viewer's attention. <div>q</div></p>");
  await start(b, 'first', text);
  await b.waitFor(resolved('first'));
  assert.equal(await b.evaluate('window.__results.first'), false);
  assert.equal(await render(b), b.source, 'the change is held back');
  await compose(b, 'compositionend');
  await b.waitFor('window.__reloads > 0');
  assert.deepEqual(b.errors, []);
});

const HOLD_CHECKS = `(() => {
  const set = window.setTimeout.bind(window);
  const clear = window.clearTimeout.bind(window);
  const held = new Map();
  let n = 0;
  window.setTimeout = (fn, ms, ...args) => {
    if (typeof fn !== 'function' || fn.name !== 'check') return set(fn, ms, ...args);
    held.set(--n, () => fn(...args));
    return n;
  };
  window.clearTimeout = (id) => void (held.delete(id) || clear(id));
  window.__checks = () => {
    const fns = [...held.values()];
    held.clear();
    for (const fn of fns) fn();
    return fns.length;
  };
  window.__reloads = 0;
  ${E}.session.onReload(() => window.__reloads++);
  return true;
})()`;

const BREAK = `(() => {
  const p = ${P2};
  p.firstChild.data = p.firstChild.data.replace('Copy-paste', 'Broken');
  return true;
})()`;

test('a page that does not read as its text after an apply is loaded again through onReload', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await b.evaluate(HOLD_CHECKS);
  const one = once(b.source, 'Thank you', 'Thanks');
  assert.equal((await applyOn(b, one)).reload, false);
  assert.equal(await b.evaluate('window.__checks()'), 1, 'the apply sets the check');
  assert.equal(await b.evaluate('window.__reloads'), 0, 'a page that reads as its text is not loaded again');
  await b.evaluate(BREAK);
  const two = once(one, 'Design the complete', 'Plan the complete');
  assert.equal((await applyOn(b, two)).reload, false);
  assert.equal(await b.evaluate('window.__checks()'), 1);
  assert.equal(await b.evaluate('window.__reloads'), 1);
  assert.deepEqual(b.errors, []);
});

test('a page that does not read as its text after an apply is loaded again when the person types right after the apply', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await b.evaluate(HOLD_CHECKS);
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  const one = once(b.source, 'Thank you', 'Thanks');
  assert.equal((await applyOn(b, one)).reload, false);
  await b.evaluate(BREAK);
  assert.equal((await applyOn(b, once(one, '<h2>Chapter one</h2>', '<h2>Chapter one A</h2>'))).reload, false);
  await typeKeys(b, 'k');
  await b.waitFor(`${P1}.textContent.endsWith('attention.k')`);
  await b.evaluate('window.__checks()');
  assert.equal(await b.evaluate('window.__reloads'), 1);
  assert.deepEqual(b.errors, []);
});

test('an edit without a key right after an apply does not load the page again through the check of onReload', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await b.evaluate(HOLD_CHECKS);
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  assert.equal((await applyOn(b, once(b.source, 'Thank you', 'Thanks'))).reload, false);
  await b.evaluate(`document.execCommand('insertText', false, ' Spoken')`);
  assert.equal(await b.evaluate('window.__checks()'), 1, 'the check runs after the edit');
  assert.equal(await b.evaluate('window.__reloads'), 0);
  assert.deepEqual(b.errors, []);
});

test('copy() reads the deck with the edits of the person while an apply runs, and leaves the text handed to the client as it is', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  const remote = once(await sessionText(b), '<h1>Thank you</h1>', '<h1>Thank you \\(x\\)</h1>');
  const told = await changes(b);
  await closeGate(b);
  await start(b, 'remote', remote);
  await b.waitFor('window.__held > 0');
  await b.evaluate(`document.execCommand('insertText', false, ' Typed.')`);
  const want = once(remote, 'viewer\'s attention.</p>', 'viewer\'s attention. Typed.</p>');
  assert.deepEqual(await b.evaluate(`[${E}.session.copy(), ${E}.session.text(), ${E}.session.copy()]`), [want, remote, want]);
  await openGate(b);
  await b.waitFor(resolved('remote'));
  await b.waitFor(`window.__changes > ${told}`);
  assert.equal(await sessionText(b), want);
  assert.deepEqual(b.errors, []);
});

test('text() hands back the last text while a duplicate of a slide waits for its typeset, and the whole duplicate and an edit typed during it after it', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  const count = await b.evaluate(SECTIONS);
  const before = await sessionText(b);
  const told = await changes(b);
  await closeGate(b, `${SECTIONS} === ${count + 1}`);
  await b.evaluate(`(${E}.exec('slide.duplicate'), true)`);
  await b.waitFor(`window.__held > 0 && ${E}.doc.busy`);
  const typed = await b.evaluate(`(() => {
    const p = ${P1};
    p.focus();
    getSelection().selectAllChildren(p);
    getSelection().collapseToEnd();
    return document.execCommand('insertText', false, ' Typed.');
  })()`);
  assert.equal(typed, true, 'the edit is typed during the duplicate');
  assert.equal(await sessionText(b), before, 'the text read during the duplicate');
  await openGate(b);
  await b.waitFor(`!${E}.doc.busy && window.__changes > ${told}`);
  const got = await sessionText(b);
  assert.equal(got.split('<h2>Show your steps one at a time</h2>').length, 3, 'both slides are in the text');
  assert.ok(got.includes('viewer\'s attention. Typed.</p>'), 'the edit is in the text');
  assert.equal(got, await render(b));
  assert.deepEqual(b.errors, []);
});
