// the caret of the person through an apply of the synchronous editor, see
// src/editor/session/session.ts. a caret that the person moves while the formulas of an apply are
// typeset is left where the person put it, and a caret whose paragraph another person moves to a
// slide that is not shown stays in the paragraph: the person stays on the slide, and the first key
// that types shows the slide of the paragraph and goes into it

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { press, typeKeys } from './helpers/editor.mjs';
import { E, applyOn, caretAtEnd, sessionPage, showSlide } from './helpers/apply.mjs';
import { closeGate, openGate } from './helpers/gate.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

const P1 = `[...document.querySelectorAll('.reveal p')].find((p) => p.textContent.includes('the complete slide'))`;
const H2 = `[...document.querySelectorAll('.reveal h2')].find((h) => h.textContent.startsWith('Show your steps'))`;
const LINE = '  <p>Design the complete slide first, then break it up into steps. Direct the viewer\'s attention.</p>\n';
const once = (text, from, to) => {
  assert.equal(text.split(from).length, 2, `${from} is once in the text`);
  return text.replace(from, to);
};

// the text with the slide whose heading starts with heading put again after it
function duplicated(text, heading) {
  const from = text.lastIndexOf('<section', text.indexOf(`<h2>${heading}`));
  const to = text.indexOf('</section>', from) + '</section>\n'.length;
  assert.ok(from > 0 && to > from, `the slide ${heading} is in the text`);
  return text.slice(0, to) + text.slice(from, to) + text.slice(to);
}

const MOVED = [
  ['a slide with formulas placed by the apply', (text) => duplicated(text, 'Equations are first class')],
  ['a tag put into the text of the caret', (text) => once(text, 'Design the complete', 'Design <strong>Hi</strong> the complete')],
];

for (const [label, change] of MOVED) {
  test(`a caret moved by the person while the formulas of an apply are typeset stays where the person put it, after ${label}`, async (t) => {
    const b = await sessionPage(browser);
    t.after(() => b.close());
    await showSlide(b, 'Show your steps');
    assert.equal(await b.evaluate(`(() => {
      const p = ${P1};
      p.focus();
      getSelection().collapse(p.firstChild, 6);
      return document.activeElement === p;
    })()`), true);
    await closeGate(b);
    await b.evaluate(`(() => {
      window.__result = null;
      ${E}.apply(${JSON.stringify(change(b.source))}).then((r) => (window.__result = r.reload));
      return true;
    })()`);
    await b.waitFor('window.__held > 0');
    // the person puts the caret into the heading of the slide while the typeset waits
    assert.equal(await b.evaluate(`(() => {
      const h = ${H2};
      h.focus();
      getSelection().collapse(h.firstChild, 4);
      return document.activeElement === h;
    })()`), true);
    await openGate(b);
    await b.waitFor('window.__result !== null');
    assert.equal(await b.evaluate('window.__result'), false);
    assert.deepEqual(await b.evaluate(`(() => {
      const h = ${H2};
      const sel = getSelection();
      return { active: document.activeElement === h, node: sel.focusNode === h.firstChild, offset: sel.focusOffset };
    })()`), { active: true, node: true, offset: 4 });
    assert.deepEqual(b.errors, []);
  });
}
