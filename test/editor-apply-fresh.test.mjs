// the apply of the synchronous editor against a fresh page, see src/editor/session/apply.ts. after
// an apply that does not ask for a reload, the page must look as a fresh page opened on the text:
// the same elements, attributes, classes, formulas, steps, and drawings, and what reveal.js and
// the theme set at the start. a change that cannot be made so asks for a reload

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { editorPage, typeKeys } from './helpers/editor.mjs';
import { E, applied, applyOn, caretAtEnd, front, sessionPage, showSlide } from './helpers/apply.mjs';
import { freshDeck, looksFresh } from './helpers/fresh.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

const once = (text, from, to) => {
  assert.equal(text.split(from).length, 2, `${JSON.stringify(from.slice(0, 60))} is once in the text`);
  return text.replace(from, to);
};
const sectionsOf = (text) => [...text.matchAll(/^<section[\s\S]*?^<\/section>/gm)].map((m) => m[0]);
const slideWith = (text, heading) => sectionsOf(text).find((s) => s.includes(`<h2>${heading}`) || s.includes(`<h1>${heading}`));

// each text applied in turn on a session page, with the reload that each apply must ask for, and
// the page compared with a fresh page after each apply that does not
async function steps(t, changes) {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  let text = b.source;
  for (const [label, change, reload] of changes) {
    text = change(text);
    assert.equal((await applyOn(b, text)).reload, reload, `${label}: the reload of the apply`);
    if (reload) return b;
    await applied(b, text, label);
    await looksFresh(t, browser, b, text, label);
  }
  assert.deepEqual(b.errors, []);
  return b;
}

test('a text element whose content stops being text asks for a reload', async (t) => {
  await steps(t, [['a footnote of code alone', (s) => once(s, '<div class="foot">Natural parameter continuation of a Halo family, from <code>demo/tycho-scene.py</code>.</div>', '<div class="foot"><code>demo/tycho-scene.py</code></div>'), true]]);
  await steps(t, [['a label of a space', (s) => once(s, 'data-dy="36">Moon</span>\n  </div>\n  <div class="foot">Slides can', 'data-dy="36"> </span>\n  </div>\n  <div class="foot">Slides can'), true]]);
});
