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

test('the outlines and the running heads follow a removed section slide and a changed section heading', async (t) => {
  await steps(t, [
    ['a section slide taken', (s) => s.replace(`${slideWith(s, 'Chapter two')}\n`, ''), false],
  ]);
  await steps(t, [
    ['a section heading changed', (s) => once(s, '<h2>Chapter two</h2>', '<h2>Capter two</h2>'), false],
    ['a slide moved before a section slide', (s) => {
      const moved = slideWith(s, 'Embedding videos');
      return s.replace(`${moved}\n`, '').replace(slideWith(s, 'Chapter one'), `${moved}\n${slideWith(s, 'Chapter one')}`);
    }, false],
  ]);
});

// the text of the outlines and of the running heads of page
const CHROME = `[...document.querySelectorAll('.reveal ul.outline, .reveal .run[data-generated]')].map((e) => e.textContent)`;

test('the outlines and the running heads follow the typing of the person in a section heading', async (t) => {
  const a = await sessionPage(browser);
  t.after(() => a.close());
  await showSlide(a, 'Chapter two');
  await caretAtEnd(a, `Reveal.getCurrentSlide().querySelector('h2')`);
  await typeKeys(a, ' and');
  const text = await a.evaluate(`${E}.session.text()`);
  assert.ok(text.includes('<h2>Chapter two and</h2>'), 'the typing is in the text');
  const c = await editorPage(browser, { deck: freshDeck(t, text), text });
  t.after(() => c.close());
  assert.deepEqual(await a.evaluate(CHROME), await c.evaluate(CHROME));
});

test('a slide that becomes a vertical stack, and back, looks as on a fresh page', async (t) => {
  let base = null;
  await steps(t, [
    ['a stack made', (s) => {
      base = s;
      const slide = slideWith(s, 'Embedding videos');
      return once(s, slide, `<section>\n${slide}\n<section>\n  <h2>Below</h2>\n  <p>A slide below.</p>\n</section>\n</section>`);
    }, false],
    ['the stack undone', () => base, false],
  ]);
});
