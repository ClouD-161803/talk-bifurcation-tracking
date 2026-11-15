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

test('a changed parameter or a new label of a surface asks for a reload, and a changed camera does not', async (t) => {
  await steps(t, [['a mass ratio', (s) => once(s, 'data-function="effective-potential" data-mu="0.05">', 'data-function="effective-potential" data-mu="0.3">'), true]]);
  await steps(t, [['a label', (s) => once(s, '<span class="label" data-at="L5">\\(\\LL{5}\\)</span>\n  </div>\n  <aside class="notes">The mass ratio', '<span class="label" data-at="L5">\\(\\LL{5}\\)</span>\n    <span class="label" data-at="L1">Extra</span>\n  </div>\n  <aside class="notes">The mass ratio'), true]]);
  await steps(t, [['an azimuth', (s) => once(s, 'data-function="effective-potential" data-mu="0.05">', 'data-function="effective-potential" data-mu="0.05" data-azimuth="-20">'), false]]);
});

test('a changed step index and a step taken group the steps as on a fresh page', async (t) => {
  await steps(t, [
    ['an index', (s) => once(s, '<li class="fragment" data-fragment-index="1">Each step', '<li class="fragment" data-fragment-index="2">Each step'), false],
    ['a step taken', (s) => once(s, '<li class="fragment" data-fragment-index="2">Two elements', '<li data-fragment-index="2">Two elements'), false],
  ]);
});

// a slide put before a slide that starts as it does is read as a change inside the heading of this
// slide, whose new bytes close the slide around it
test('a text element whose tags do not balance asks for a reload, and a slide put before a slide with the same start does not', async (t) => {
  await steps(t, [
    ['a slide put before', (s) => once(s, slideWith(s, 'Embedding TyCHO'), `<section>\n  <h2>A new slide</h2>\n  <p>Its only paragraph.</p>\n</section>\n${slideWith(s, 'Embedding TyCHO')}`), false],
    ['an em left open', (s) => once(s, 'Direct the viewer', 'Direct <em>the viewer'), true],
  ]);
});

test('two changes in two text nodes of a paragraph with a formula keep both text nodes', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  const p = `[...document.querySelectorAll('.reveal p')].find((p) => p.textContent.startsWith('where'))`;
  await b.evaluate(`(() => { const p = ${p}; window.__first = p.firstChild; window.__last = p.lastChild; })()`);
  const first = once(b.source, 'where \\(\\tilde U\\) is', 'where X\\(\\tilde U\\) is');
  assert.equal((await applyOn(b, first)).reload, false);
  const second = once(first, 'X\\(\\tilde U\\) is', 'X\\(\\tilde U\\)Y is');
  assert.equal((await applyOn(b, second)).reload, false);
  await applied(b, second, 'two changes');
  assert.deepEqual(await b.evaluate(`(() => { const p = ${p}; return [p.firstChild === window.__first, p.lastChild === window.__last, p.firstChild.data, p.lastChild.data]; })()`), [true, true, 'where X', 'Y is the effective potential.']);
});
