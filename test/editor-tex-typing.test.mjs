// the substitution TeX Formulas of Edit > Substitutions: $tex$ or \(tex\) typed is made an inline
// formula at its closing sign, and $$tex$$ or \[tex\] typed as a whole paragraph a display. one
// undo gives back the signs as typed. a dollar before a space or a digit, TeX that MathJax cannot
// typeset, code, and typing with the switch off are left as typed

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { texDisplay, texSpan } from '../src/editor/text/substitute.ts';
import { editorPage } from './helpers/editor.mjs';

const DECK = 'test/pages/editor-tex-typing.html';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const js = (v) => JSON.stringify(v);
const render = (page) => page.evaluate('window.BeesonEditor.render()');
const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
const para = (i) => `document.querySelectorAll('.reveal section.present > p')[${i}]`;

// the caret at the end of paragraph i, or in its inline code after two characters
async function load(t, i = 0, inCode = false) {
  const page = await editorPage(browser, { deck: DECK, page: { width: 1600, height: 1000 } });
  t.after(() => page.close().catch(() => {}));
  await page.evaluate(`(() => {
    const p = ${para(i)};
    p.focus();
    const r = document.createRange();
    if (${inCode}) r.setStart(p.querySelector('code').firstChild, 2);
    else r.selectNodeContents(p);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    return true;
  })()`);
  return page;
}

// each character typed as a trusted key, one after the other, as a person types
async function typeKeys(page, text) {
  for (const c of text) {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: c, text: c, unmodifiedText: c });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: c });
  }
}

// the paragraph i of the deck saved once its count of formulas is n
async function saved(page, i, n) {
  await page.waitFor(`${para(i)}.querySelectorAll('mjx-container').length === ${n}`);
  return (await render(page)).match(/<p style="width: 900px">.*<\/p>/g)[i];
}

test('the formula that a closing sign typed last closes is found, and a dollar of money is left', () => {
  assert.deepEqual(texSpan('a $x^2$'), { start: 2, tex: 'x^2' });
  assert.deepEqual(texSpan(String.raw`a \(x^2\)`), { start: 2, tex: 'x^2' });
  assert.deepEqual(texSpan("$f'(x)$"), { start: 0, tex: "f'(x)" });
  assert.deepEqual(texSpan('a $x$ and $y$'), { start: 10, tex: 'y' });
  // a dollar before a space or a digit, after a backslash or a dollar, a formula that ends in a
  // space, and an empty formula are left as typed
  for (const text of ['$5 and $10$', 'a $ x$', 'a $x $', '$$x$', '$$x$$', String.raw`a \$x$`, String.raw`a \(\)`]) assert.equal(texSpan(text), null, text);
  assert.equal(texDisplay('$$E = mc^2$$'), 'E = mc^2');
  assert.equal(texDisplay(String.raw` \[x\] `), 'x');
  assert.equal(texDisplay('a $$x$$'), null);
  // a dollar inside a formula that is still open belongs to its TeX
  for (const text of [String.raw`\(\text{$x$`, String.raw`\[\text{case $x$`]) assert.equal(texSpan(text), null, text);
});

test('$tex$ typed is an inline formula, the typing after it is outside, and one undo gives back the dollars', async (t) => {
  const page = await load(t);
  await typeKeys(page, ' $\\theta^2$');
  assert.equal(await saved(page, 0, 1), String.raw`<p style="width: 900px">The orbit \(\theta^2\)</p>`);
  assert.equal(await undoLabel(page), 'Undo TeX Formula');
  await typeKeys(page, ' x');
  assert.equal(await saved(page, 0, 1), String.raw`<p style="width: 900px">The orbit \(\theta^2\) x</p>`);
  await page.evaluate('window.BeesonEditor.undo()');
  assert.equal(await saved(page, 0, 1), String.raw`<p style="width: 900px">The orbit \(\theta^2\)</p>`);
  await page.evaluate('window.BeesonEditor.undo()');
  assert.equal(await saved(page, 0, 0), String.raw`<p style="width: 900px">The orbit $\theta^2$</p>`);
  assert.deepEqual(page.errors, []);
});

test('a formula typed in the middle of a text leaves the caret after it, with nothing selected', async (t) => {
  const page = await load(t);
  await page.evaluate(`(getSelection().collapse(${para(0)}.firstChild, 3), true)`);
  await typeKeys(page, ' $x$');
  await page.waitFor(`${para(0)}.querySelectorAll('mjx-container').length === 1`);
  await page.waitFor(`getSelection().isCollapsed`);
  await typeKeys(page, 'Z');
  assert.equal(await saved(page, 0, 1), String.raw`<p style="width: 900px">The \(x\)Z orbit</p>`);
});

test('\\(tex\\) typed is typeset', async (t) => {
  const page = await load(t);
  await typeKeys(page, ' \\(a_1\\)');
  assert.equal(await saved(page, 0, 1), String.raw`<p style="width: 900px">The orbit \(a_1\)</p>`);
  assert.equal(await page.evaluate(`${para(0)}.querySelector('mjx-container').getAttribute('contenteditable')`), 'false');
});

test('$$tex$$ and \\[tex\\] typed as a whole paragraph are a display, and one undo gives back the paragraph as typed', async (t) => {
  const page = await load(t, 1);
  await page.evaluate(`(getSelection().selectAllChildren(${para(1)}), true)`);
  await typeKeys(page, '$$E = mc^2$$');
  await page.waitFor(`!!document.querySelector('.reveal section.present div.math mjx-container')`);
  assert.ok((await render(page)).includes(String.raw`<div class="math" style="width: 900px">\[E = mc^2\]</div>`), 'the display is not written as Insert > Formula writes it');
  assert.equal(await undoLabel(page), 'Undo TeX Formula');
  await page.evaluate('window.BeesonEditor.undo()');
  await page.waitFor(`!document.querySelector('.reveal section.present div.math')`);
  assert.ok((await render(page)).includes('<p style="width: 900px">$$E = mc^2$$</p>'));
  await page.evaluate(`(() => { const p = ${para(1)}; p.focus(); getSelection().selectAllChildren(p); return true; })()`);
  await typeKeys(page, '\\[x\\]');
  await page.waitFor(`!!document.querySelector('.reveal section.present div.math mjx-container')`);
  assert.ok((await render(page)).includes(String.raw`<div class="math" style="width: 900px">\[x\]</div>`));
});

test('a display keeps the dollars of its TeX', async (t) => {
  const page = await load(t, 1);
  await page.evaluate(`(getSelection().selectAllChildren(${para(1)}), true)`);
  await typeKeys(page, String.raw`\[\text{case $1$}\]`);
  await page.waitFor(`!!document.querySelector('.reveal section.present div.math mjx-container')`);
  assert.ok((await render(page)).includes(String.raw`<div class="math" style="width: 900px">\[\text{case $1$}\]</div>`), 'the TeX of the display is not written as typed');
});

test('after the undo of a display, only a closing sign makes the paragraph a display again', async (t) => {
  const page = await load(t, 1);
  await page.evaluate(`(getSelection().selectAllChildren(${para(1)}), true)`);
  await typeKeys(page, '$$E = mc^2$$');
  await page.waitFor(`!!document.querySelector('.reveal section.present div.math mjx-container')`);
  await page.evaluate('window.BeesonEditor.undo()');
  await page.waitFor(`!document.querySelector('.reveal section.present div.math')`);
  await page.evaluate(`(() => { const p = ${para(1)}; p.focus(); getSelection().selectAllChildren(p); getSelection().collapseToEnd(); return true; })()`);
  await typeKeys(page, ' ');
  await page.waitFor(`/\\s$/.test(${para(1)}.textContent) || !!document.querySelector('.reveal section.present div.math')`);
  // the TeX is read by MathJax before a display is written, hence the check waits for it
  await page.evaluate('window.MathJax.tex2svgPromise("x").then(() => new Promise((done) => setTimeout(() => done(true), 50)))');
  assert.equal(await page.evaluate(`!!document.querySelector('.reveal section.present div.math')`), false, 'a space typed after the undo made the paragraph a display again');
});

test('with TeX Formulas off, a dollar does not open TeX, and a quote typed after it is curly', async (t) => {
  const off = await load(t);
  await off.evaluate(`Promise.resolve(window.BeesonEditor.exec('text.smart.tex')).then(() => true)`);
  try {
    await typeKeys(off, " $HOME, it's");
    await off.waitFor(`/it.s$/.test(${para(0)}.textContent)`);
    assert.equal(await saved(off, 0, 0), '<p style="width: 900px">The orbit $HOME, it’s</p>');
  } finally {
    // the switch is kept in the storage of the origin, which the next test reads
    await off.evaluate(`(localStorage.removeItem('beeson-edit-smart-tex'), true)`);
  }
});

test('money, TeX that MathJax cannot typeset, code, and typing with TeX Formulas off are left as typed', async (t) => {
  const page = await load(t);
  await typeKeys(page, ' $5 and $10 $x^$');
  // the error of MathJax is read before the formula is written, hence the check waits for it
  await page.evaluate('window.MathJax.tex2svgPromise("x").then(() => true)');
  assert.equal(await saved(page, 0, 0), '<p style="width: 900px">The orbit $5 and $10 $x^$</p>');
  const code = await load(t, 2, true);
  await typeKeys(code, '$x$');
  await code.evaluate('window.MathJax.tex2svgPromise("x").then(() => true)');
  assert.equal(await saved(code, 2, 0), '<p style="width: 900px">Run <code>co$x$st</code> now</p>');
  const off = await load(t);
  t.after(() => off.evaluate(`localStorage.removeItem('beeson-edit-smart-tex')`).catch(() => {}));
  await off.evaluate(`Promise.resolve(window.BeesonEditor.exec('text.smart.tex')).then(() => true)`);
  assert.equal(await off.evaluate(`window.BeesonEditor.state('text.smart.tex').checked`), false);
  assert.equal(await off.evaluate(`localStorage.getItem('beeson-edit-smart-tex')`), 'off');
  await typeKeys(off, ' $y$');
  await off.evaluate('window.MathJax.tex2svgPromise("x").then(() => true)');
  assert.equal(await saved(off, 0, 0), '<p style="width: 900px">The orbit $y$</p>');
  assert.equal(js(await off.evaluate(`window.BeesonEditor.state('text.smart.tex').label`)), js('TeX Formulas'));
});
