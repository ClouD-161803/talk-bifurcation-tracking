// the apply of the synchronous editor against a fresh page, see src/editor/session/apply.ts. after
// an apply that does not ask for a reload, the page must look as a fresh page opened on the text:
// the same elements, attributes, classes, formulas, steps, and drawings, and what reveal.js and
// the theme set at the start. a change that cannot be made so asks for a reload

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { click, editorPage, press, typeKeys } from './helpers/editor.mjs';
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

// reveal.js marks a step at an open before the editor marks a figure as movable
test('a figure made a step has the classes of reveal.js before those of the editor, as on a fresh page', async (t) => {
  const box = '<div class="figure-box">\n    <video class="for-dark" src="demo/clip-dark.mp4"';
  const step = '<div class="figure-box fragment">\n    <video class="for-dark" src="demo/clip-dark.mp4"';
  await steps(t, [
    ['a step made', (s) => once(s, box, step), false],
    ['a step taken', (s) => once(s, step, box), false],
    ['a step made with a change of a list item', (s) => once(once(s, box, step), 'it does survive PPTX exports.', 'it survives PPTX exports.'), false],
  ]);
});

// the theme numbers the viewers in the order of the deck at an open, see markViewers() in src/print.ts
test('a viewer moved before another, or after another taken off, is numbered as on a fresh page', async (t) => {
  const scenes = (s) => slideWith(s, 'Embedding TyCHO scenes');
  const more = (s) => slideWith(s, 'More TyCHO scenes');
  await steps(t, [
    ['a slide with a viewer added', (s) => once(s, scenes(s), `${scenes(s)}\n\n${scenes(s).replace('<h2>Embedding TyCHO scenes', '<h2>More TyCHO scenes')}`), false],
    ['this slide moved first', (s) => once(once(s, `\n\n${more(s)}`, ''), sectionsOf(s)[0], `${more(s)}\n\n${sectionsOf(s)[0]}`), false],
    ['this slide taken off', (s) => once(s, `${more(s)}\n\n`, ''), false],
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

// an edit of the editor on page a, by a command on two selected text elements, applied on page b
async function commanded(t, heading, first, second, run) {
  const a = await sessionPage(browser);
  const b = await sessionPage(browser);
  t.after(() => Promise.all([a.close(), b.close()]));
  await front(a);
  await showSlide(a, heading);
  await click(a, `section.present ${first}`);
  await press(a, 'Escape');
  await click(a, `section.present ${second}`, { modifiers: 'Shift' });
  await a.waitFor(`${E}.selection().length === 2`);
  await run(a);
  await a.waitFor('window.__changes > 0');
  const text = await a.evaluate(`${E}.session.text()`);
  assert.notEqual(text, a.source, `${heading}: the command changed the text`);
  assert.equal((await applyOn(b, text)).reload, false, `${heading}: the reload of the apply`);
  await applied(b, text, heading);
  await looksFresh(t, browser, b, text, heading);
}

test('a start tag of a text element that a structural apply keeps is set on the page', async (t) => {
  await commanded(t, 'Presenting in HTML', 'h1', 'p.sub', (a) => press(a, 'ArrowRight'));
  await commanded(t, 'Show your steps', 'h2', '> p', (a) => a.evaluate(`${E}.exec('text.align.center')`));
  const items = '<li class="fragment" data-fragment-index="2">Two elements with the same index are shown together.</li>\n    <li class="fragment" data-fragment-index="3">When';
  await steps(t, [['a class added to two items', (s) => once(s, items, items.replaceAll('class="fragment"', 'class="fragment fade-up"')), false]]);
  await steps(t, [['the steps taken off two items', (s) => once(s, items, items.replaceAll(' class="fragment" data-fragment-index="2"', '').replace(' class="fragment" data-fragment-index="3"', '')), false]]);
  await steps(t, [['a width of a paragraph and a text of the next item', (s) => once(s, '<p>Design the complete slide first, then break it up into steps. Direct the viewer\'s attention.</p>\n  <ul>\n    <li class="fragment" data-fragment-index="1">Each', '<p style="width: 400px">Design the complete slide first, then break it up into steps. Direct the viewer\'s attention.</p>\n  <ul>\n    <li class="fragment" data-fragment-index="1">Every'), false]]);
  await steps(t, [['a class of a heading and a new paragraph', (s) => once(s, '<h2>Show your steps one at a time</h2>\n', '<h2 class="center">Show your steps one at a time</h2>\n  <p>New</p>\n'), false]]);
});

// the theme draws a backdrop into its div once, hence a div that becomes a backdrop or stops being
// one is not reused for the other
test('a backdrop that becomes another div asks for a reload, and is placed anew by a structural apply', async (t) => {
  const backdrop = '<div class="backdrop" data-backdrop="tubes" data-cx="0.97" data-cy="0" data-half="0.5">';
  await steps(t, [['a backdrop made a shape', (s) => once(s, backdrop, '<div class="shape" style="width: 200px; height: 100px">'), true]]);
  await steps(t, [['the class of a backdrop taken', (s) => once(s, backdrop, '<div data-backdrop="tubes" data-cx="0.97" data-cy="0" data-half="0.5">'), true]]);
  const shapes = '<section>\n  <h2>Shapes</h2>\n  <div class="shape rounded" style="width: 241px; height: 148px; translate: 279px 463px"><p>Goal</p></div>\n</section>\n\n';
  await steps(t, [['a slide with a shape put before a slide with a backdrop, with an item of this slide changed', (s) => once(once(s, '<!-- content, the default layout', `${shapes}<!-- content, the default layout`), 'are shown together.</li>', 'are ihown together.</li>'), false]]);
});

// the parser of the whole file ignores the slash of a self-closing tag of HTML that is not void, and
// the element left open is carried over the elements after it, where SVG closes it
test('a self-closing tag of a formatting element in a text element asks for a reload, and one of SVG does not', async (t) => {
  await steps(t, [['an em', (s) => once(s, 'Direct the viewer', 'Direct <em/>the viewer'), true]]);
  await steps(t, [['a b', (s) => once(s, 'Direct the viewer', 'Direct <b/>the viewer'), true]]);
  await steps(t, [['a strong in an item', (s) => once(s, 'are shown together.</li>', 'are <strong/>shown together.</li>'), true]]);
  await steps(t, [['a rect of SVG', (s) => once(s, 'Direct the viewer', 'Direct <svg viewBox="0 0 1 1" width="20" height="20"><rect width="1" height="1"/></svg>the viewer'), false]]);
});

// the theme sets a TyCHO viewer to the mode of the deck at an open, see syncViewers() in src/main.ts
test('the theme of a TyCHO viewer follows the mode of the deck, unless the viewer keeps its theme', async (t) => {
  await steps(t, [
    ['a light theme', (s) => once(s, '<tycho-viewer theme="dark" kiosk', '<tycho-viewer theme="light" kiosk'), false],
    ['the theme kept', (s) => once(s, '<tycho-viewer theme="light" kiosk', '<tycho-viewer theme="light" data-keep-theme kiosk'), false],
    ['the theme not kept', (s) => once(s, ' data-keep-theme kiosk', ' kiosk'), false],
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

// a generator of numbers in [0, 1) from seed, by mulberry32
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// the paragraphs, items, and headings of the slides written on one line, outside code and scripts
// and without math, each with its line and its tag
function oneLine(lines) {
  const out = [];
  let slides = false;
  let raw = false;
  for (const [i, l] of lines.entries()) {
    if (l.startsWith('<section')) slides = true;
    if (raw || (/<(pre|script)[\s>]/.test(l) && !/<\/(pre|script)>/.test(l))) {
      raw = !/<\/(pre|script)>/.test(l);
      continue;
    }
    const m = l.match(/^\s*<(p|li|h2)(\s[^>]*)?>(.*)<\/\1>$/);
    if (slides && m && !/<\/?(p|li|h2|div|ul|ol|section)[\s>]/.test(m[3]) && !/[\\$]/.test(l)) out.push({ i, tag: m[1] });
  }
  return out;
}

// the ranges of the lines of the horizontal slides, from the line of the start tag to that of the
// end tag. the slides of a stack are written indented, hence a stack is one range
function slideRanges(lines) {
  const out = [];
  for (const [i, l] of lines.entries()) {
    if (l.startsWith('<section')) out.push([i, i]);
    else if (l.startsWith('</section>')) out.at(-1)[1] = i;
  }
  return out;
}

const isStack = (lines, r) => lines[r[0] + 1].startsWith('  <section');
const cut = (lines, r) => lines.slice(r[0], r[1] + 1);
const WORDS = ['orbit', 'halo', 'family', 'Moon', 'step', 'slide'];

// each change of the text, by its label, its function of the lines and of a pick from a list, and
// the reload that its apply asks for
const MUTATIONS = [
  ['a word', (lines, pick) => {
    const { i } = pick(oneLine(lines));
    const words = [...lines[i].matchAll(/(?<![&\w])[A-Za-z]{3,}\b(?![^<]*>)/g)].filter((m) => m.index > lines[i].indexOf('>'));
    if (!words.length) return;
    const w = pick(words);
    lines[i] = lines[i].slice(0, w.index) + pick(WORDS) + lines[i].slice(w.index + w[0].length);
  }, false],
  ['a section heading', (lines, pick) => {
    const all = [...lines.keys()].filter((i) => /^\s*<h2>/.test(lines[i]) && lines[i - 1].includes('class="sec"'));
    const i = pick(all);
    lines[i] = lines[i].replace(/<h2>.*<\/h2>/, `<h2>${pick(['Chapter one', 'Chapter two', 'Halo orbits', 'Part three'])}</h2>`);
  }, false],
  ['a box moved', (lines, pick) => {
    const i = pick([...lines.keys()].filter((i) => /translate: -?\d+px -?\d+px/.test(lines[i])));
    const n = pick([1, 2]);
    let k = 0;
    lines[i] = lines[i].replace(/-?\d+(?=px)/g, (v) => (++k === n ? String(Number(v) + pick([-40, -7, 9, 30])) : v));
  }, false],
  ['a step', (lines, pick) => {
    const { i } = pick(oneLine(lines).filter((e) => e.tag === 'p'));
    lines[i] = lines[i].includes(' class="fragment">') ? lines[i].replace(' class="fragment">', '>') : lines[i].replace(/^(\s*<p)>/, '$1 class="fragment">');
  }, false],
  ['a step index', (lines, pick) => {
    const i = pick([...lines.keys()].filter((i) => /data-fragment-index="\d"/.test(lines[i]) && !lines[i].includes('<video')));
    const to = pick(['1', '2', '3', '4', null]);
    lines[i] = lines[i].replace(/ data-fragment-index="\d"/, to === null ? '' : ` data-fragment-index="${to}"`);
  }, false],
  ['a line taken', (lines, pick) => {
    const all = oneLine(lines).filter((e) => e.tag !== 'h2' && (e.tag === 'p' || lines[e.i - 1].includes('<li') || lines[e.i + 1].includes('<li')));
    lines.splice(pick(all).i, 1);
  }, false],
  ['a line twice', (lines, pick) => {
    const { i } = pick(oneLine(lines));
    lines.splice(i + 1, 0, lines[i]);
  }, false],
  ['a line moved', (lines, pick) => {
    const all = oneLine(lines).filter((e) => e.tag === 'p' || lines[e.i - 1].includes('<li') || lines[e.i + 1].includes('<li'));
    const from = pick(all);
    const to = pick(oneLine(lines).filter((e) => e.tag === from.tag && e.i !== from.i));
    const [line] = lines.splice(from.i, 1);
    lines.splice(to.i > from.i ? to.i : to.i + 1, 0, line);
  }, false],
  ['a line added', (lines, pick) => {
    const { i } = pick(oneLine(lines).filter((e) => e.tag === 'p'));
    lines.splice(i + 1, 0, `${lines[i].match(/^\s*/)[0]}<p>A new ${pick(WORDS)} line.</p>`);
  }, false],
  ['slides swapped', (lines, pick) => {
    const ranges = slideRanges(lines);
    const a = pick(ranges);
    const b = pick(ranges.filter((r) => r !== a));
    const [first, second] = a[0] < b[0] ? [a, b] : [b, a];
    lines.splice(first[0], second[1] + 1 - first[0], ...cut(lines, second), ...lines.slice(first[1] + 1, second[0]), ...cut(lines, first));
  }, false],
  ['a slide taken', (lines, pick) => {
    const ranges = slideRanges(lines);
    if (ranges.length < 4) return;
    const r = pick(ranges.filter((r) => !cut(lines, r).some((l) => l.includes('<script'))));
    lines.splice(r[0], r[1] + 1 - r[0]);
  }, false],
  ['a slide twice', (lines, pick) => {
    const r = pick(slideRanges(lines).filter((r) => !cut(lines, r).some((l) => l.includes('<script'))));
    lines.splice(r[1] + 1, 0, ...cut(lines, r));
  }, false],
  ['a stack made', (lines, pick) => {
    const ranges = slideRanges(lines);
    const k = pick([...ranges.keys()].slice(0, -1).filter((k) => !isStack(lines, ranges[k]) && !isStack(lines, ranges[k + 1])));
    if (k === undefined) return;
    const [a, b] = [ranges[k], ranges[k + 1]];
    for (const i of [a[0], a[1], b[0], b[1]]) lines[i] = `  ${lines[i]}`;
    lines.splice(b[1] + 1, 0, '</section>');
    lines.splice(a[0], 0, '<section>');
  }, false],
  ['a stack undone', (lines, pick) => {
    const r = pick(slideRanges(lines).filter((r) => isStack(lines, r)));
    if (!r) return;
    for (let i = r[0] + 1; i < r[1]; i++) if (/^ {2}<\/?section/.test(lines[i])) lines[i] = lines[i].slice(2);
    lines.splice(r[1], 1);
    lines.splice(r[0], 1);
  }, false],
  ['a camera', (lines, pick) => {
    const i = pick([...lines.keys()].filter((i) => lines[i].includes('class="surface"')));
    const to = `data-azimuth="${pick([-90, -30, 20, 75])}"`;
    lines[i] = /data-azimuth="[^"]*"/.test(lines[i]) ? lines[i].replace(/data-azimuth="[^"]*"/, to) : lines[i].replace('class="surface"', `class="surface" ${to}`);
  }, false],
  ['a mass ratio', (lines, pick) => {
    const i = pick([...lines.keys()].filter((i) => lines[i].includes('class="surface"')));
    lines[i] = lines[i].replace(/data-mu="[^"]*"/, (m) => (m === 'data-mu="0.1"' ? 'data-mu="0.2"' : 'data-mu="0.1"'));
  }, true],
];

for (const seed of [1, 2, 3]) {
  test(`a page after each change of a seeded sequence looks as a fresh page, with the seed ${seed}`, { timeout: 240000 }, async (t) => {
    let b = await sessionPage(browser);
    t.after(() => b.close());
    const rand = random(seed);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    let text = b.source;
    for (let n = 1; n <= 20; n++) {
      const [label, mutate, reload] = pick(MUTATIONS);
      const lines = text.split('\n');
      mutate(lines, pick);
      if (lines.join('\n') === text) continue;
      text = lines.join('\n');
      const at = `seed ${seed}, change ${n}, ${label}`;
      assert.equal((await applyOn(b, text)).reload, reload, `${at}: the reload of the apply`);
      if (reload) {
        assert.deepEqual(b.errors, [], at);
        await b.close();
        b = await sessionPage(browser, { deck: freshDeck(t, text), text });
        continue;
      }
      await applied(b, text, at);
      await looksFresh(t, browser, b, text, at);
    }
    assert.deepEqual(b.errors, []);
  });
}
