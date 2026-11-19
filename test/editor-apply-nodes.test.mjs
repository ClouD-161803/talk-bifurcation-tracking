import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { E, applied, applyOn, sessionPage, showSlide } from './helpers/apply.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

const sectionsOf = (text) => [...text.matchAll(/^<section[\s\S]*?^<\/section>/gm)].map((m) => m[0]);
const slideWith = (text, heading) => {
  const s = sectionsOf(text).find((s) => s.includes(`<h2>${heading}`) || s.includes(`<h1>${heading}`));
  assert.ok(s, `the slide ${heading} is in the text`);
  return s;
};
const without = (text, heading) => text.replace(`${slideWith(text, heading)}\n`, '');
const moveBefore = (text, heading, target) => {
  const s = slideWith(text, heading);
  const rest = without(text, heading);
  const at = rest.indexOf(slideWith(rest, target));
  return `${rest.slice(0, at)}${s}\n${rest.slice(at)}`;
};
const once = (text, from, to) => {
  assert.equal(text.split(from).length, 2, `${from} is once in the text`);
  return text.replace(from, to);
};

const NEW_SLIDE = '<section>\n  <h2>A slide of the apply</h2>\n  <p>Its only paragraph.</p>\n</section>\n';
const findSlide = (heading) => `[...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector('h1, h2')?.textContent.startsWith(${JSON.stringify(heading)}))`;

test('a change in the head or in a script of the file is a reload, and the deck is left as it was', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  const head = once(b.source, '<title>', '<title>Draft of ');
  assert.equal((await applyOn(b, head)).reload, true);
  await applied(b, b.source, 'head');
  const tycho = slideWith(b.source, 'Embedding TyCHO');
  const script = tycho.slice(tycho.indexOf('<script'), tycho.indexOf('</script>'));
  const at = script.indexOf('>') + 20;
  const changed = once(b.source, script, `${script.slice(0, at)}${script[at] === 'A' ? 'B' : 'A'}${script.slice(at + 1)}`);
  assert.equal((await applyOn(b, changed)).reload, true);
  await applied(b, b.source, 'script');
});

test('an element whose text is unchanged keeps its node when its slide is moved, and when it is moved to another slide', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await b.evaluate(`(() => {
    window.__slide = ${findSlide('Figures are first class')};
    window.__figure = window.__slide.querySelector('figure');
    window.__image = window.__figure.querySelector('img');
  })()`);
  const moved = moveBefore(b.source, 'Figures are first class', 'Show your steps');
  assert.equal((await applyOn(b, moved)).reload, false);
  await applied(b, moved, 'slide moved');
  assert.equal(await b.evaluate(`${findSlide('Figures are first class')} === window.__slide && window.__slide.querySelector('figure') === window.__figure && window.__figure.querySelector('img') === window.__image`), true);
  const figure = moved.slice(moved.indexOf('  <figure class="figure-box">'), moved.indexOf('</figure>') + '</figure>\n'.length);
  const code = slideWith(moved, 'Code boxes');
  const across = once(once(moved, figure, ''), code, code.replace('  <aside class="notes">', `${figure}  <aside class="notes">`));
  const result = await applyOn(b, across);
  assert.equal(result.reload, false);
  await applied(b, across, 'figure moved to another slide');
  assert.equal(await b.evaluate(`window.__figure.isConnected && window.__figure.closest('section') === ${findSlide('Code boxes')} && window.__figure.querySelector('img') === window.__image`), true);
});

test('the TyCHO viewer keeps its node through the applies of changes on other slides and around it', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await b.evaluate(`(() => {
    window.__slide = ${findSlide('Embedding TyCHO')};
    window.__viewer = window.__slide.querySelector('tycho-viewer');
  })()`);
  assert.equal(await b.evaluate('!!window.__viewer'), true, 'the TyCHO slide has a viewer');
  let text = b.source;
  const steps = [
    ['a text on another slide', (s) => once(s, 'Direct the viewer', 'Direct your viewer')],
    ['a new slide before it', (s) => s.replace(slideWith(s, 'Embedding TyCHO'), `${NEW_SLIDE}${slideWith(s, 'Embedding TyCHO')}`)],
    ['a slide removed before it', (s) => without(s, 'Color the terms')],
    ['its own foot', (s) => {
      const slide = slideWith(s, 'Embedding TyCHO');
      return once(s, slide, slide.replace('<div class="foot">', '<div class="foot">Look: '));
    }],
    ['its own heading', (s) => once(s, '<h2>Embedding TyCHO scenes</h2>', '<h2>Embedding TyCHO scenes in a slide</h2>')],
  ];
  for (const [label, edit] of steps) {
    text = edit(text);
    assert.equal((await applyOn(b, text)).reload, false, label);
    await applied(b, text, label);
    assert.equal(await b.evaluate(`window.__slide.isConnected && window.__slide.querySelector('tycho-viewer') === window.__viewer`), true, `${label}: the viewer is the same node`);
  }
});

test('the current slide is kept when a slide is put or taken before it, and a current slide taken away shows the slide after it', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Embedding videos');
  await b.evaluate('window.__current = Reveal.getCurrentSlide()');
  const index = () => b.evaluate('Reveal.getIndices().h');
  const start = await index();
  let text = once(b.source, '<!-- stepped math', `${NEW_SLIDE}\n<!-- stepped math`);
  assert.equal((await applyOn(b, text)).reload, false);
  await applied(b, text, 'a slide put before');
  assert.equal(await b.evaluate('Reveal.getCurrentSlide() === window.__current'), true, 'the slide shown after a slide put before it');
  assert.equal(await index(), start + 1);
  text = without(without(text, 'A slide of the apply'), 'Show your steps');
  assert.equal((await applyOn(b, text)).reload, false);
  await applied(b, text, 'slides taken before');
  assert.equal(await b.evaluate('Reveal.getCurrentSlide() === window.__current'), true, 'the slide shown after slides taken before it');
  assert.equal(await index(), start - 1);
  text = without(text, 'Embedding videos');
  assert.equal((await applyOn(b, text)).reload, false);
  await applied(b, text, 'the current slide taken');
  assert.equal(await b.evaluate(`Reveal.getCurrentSlide() === ${findSlide('Starting a video')}`), true, 'the slide after the current slide is shown');
  assert.equal(await index(), start - 1);
});

test('a large apply right after an open makes the deck read as the text in full', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  const sections = sectionsOf(b.source);
  const first = b.source.indexOf(sections[0]);
  const last = b.source.indexOf(sections.at(-1)) + sections.at(-1).length;
  const kept = sections.filter((s) => !s.includes('<h2>Starting a video'));
  const reversed = [NEW_SLIDE.trimEnd(), ...kept.reverse()].join('\n\n');
  let text = `${b.source.slice(0, first)}${reversed}${b.source.slice(last)}`;
  text = once(once(text, 'Thank you', 'Thank you all'), 'Direct the viewer', 'Direct your viewer');
  const result = await applyOn(b, text);
  assert.equal(result.reload, false);
  await applied(b, text, 'join');
  const order = await b.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].map((s) => s.querySelector('h1, h2')?.textContent)`);
  assert.equal(order[0], 'A slide of the apply');
  assert.equal(order[1], 'Thank you all');
  assert.deepEqual(b.errors, []);
});

test('a change of data-figure on a TikZ figure is a reload that leaves the port as it was, and a change of data-part on a step of one is not', async (t) => {
  const b = await sessionPage(browser, { deck: 'test/pages/tikz.html' });
  t.after(() => b.close());
  const parted = once(b.source, 'data-part="b" data-fragment-index="2"', 'data-part="a" data-fragment-index="2"');
  assert.equal((await applyOn(b, parted)).reload, false);
  await applied(b, parted, 'data-part');
  assert.equal((await applyOn(b, once(parted, 'data-figure="missing"', 'data-figure="two"'))).reload, true);
  assert.equal(await b.evaluate(`${E}.session.text()`), parted, 'the port reads as before the reload');
});

test('a TikZ figure placed by an apply is drawn in a deck without MathJax', async (t) => {
  const b = await sessionPage(browser, { deck: 'test/pages/tikz.html' });
  t.after(() => b.close());
  assert.equal(await b.evaluate('typeof MathJax'), 'undefined', 'the deck loads MathJax');
  const end = '<div class="figure-box tikz" data-figure="missing"></div>\n    </section>\n';
  const placed = once(b.source, end, `${end}    <section>\n      <h2>A figure of the apply</h2>\n      <div class="figure-box tikz" id="placed" data-figure="two"></div>\n    </section>\n`);
  assert.equal((await applyOn(b, placed)).reload, false);
  const drawn = await b.waitFor(`!!document.querySelector('#placed > svg')`, 5000).then(() => true, () => false);
  assert.ok(drawn, 'the placed figure is not drawn');
  await applied(b, placed, 'placed');
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
  window.__page = true;
  return true;
})()`;

test('a change of plain characters in a text node with a character reference keeps the node, and the page is not loaded again', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await b.evaluate(HOLD_CHECKS);
  const P = `[...document.querySelectorAll('.reveal p')].find((p) => p.textContent.includes('complete slide first'))`;
  await b.evaluate(`window.__node = ${P}.firstChild`);
  let text = b.source;
  const steps = [
    ['a typed ampersand', (s) => once(s, 'slide first, then', 'slide first &amp; then')],
    ['a change next to &amp;', (s) => once(s, '<p>Design the complete', '<p>Plan the complete')],
    ['a trailing space, which the file holds as &nbsp;', (s) => once(s, 'attention.</p>', 'attention.&nbsp;</p>')],
    ['a change next to &nbsp;', (s) => once(s, 'Direct the viewer', 'Direct your viewer')],
    ['a bare ampersand', (s) => once(s, 'break it up', 'break it R&D up')],
    ['a change next to a bare ampersand', (s) => once(s, "viewer's attention", "viewer's eyes")],
  ];
  for (const [label, edit] of steps) {
    text = edit(text);
    assert.equal((await applyOn(b, text)).reload, false, label);
    await applied(b, text, label);
    assert.equal(await b.evaluate(`${P}?.firstChild === window.__node`), true, `${label}: the text node is the same`);
    await b.evaluate('window.__checks()');
    assert.equal(await b.evaluate('window.__page === true && window.__reloads'), 0, `${label}: the page is not loaded again`);
  }
  assert.equal(await b.evaluate(`${P}.textContent`), "Plan the complete slide first & then break it R&D up into steps. Direct your viewer's eyes.\u00a0");
  assert.deepEqual(b.errors, []);
});
