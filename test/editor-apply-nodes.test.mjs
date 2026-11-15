// the nodes of the page through an apply of the synchronous editor, see src/editor/session/apply.ts:
// a change outside the slides is a reload, an element whose text did not change keeps its node
// when it is moved, the TyCHO viewer is never made again for a change elsewhere, the current slide
// is kept, and a large apply right after an open is made in full

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { applied, applyOn, sessionPage, showSlide } from './helpers/apply.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

// the slides of text, each from its start tag to its end tag, which start a line in test-deck.html
const sectionsOf = (text) => [...text.matchAll(/^<section[\s\S]*?^<\/section>/gm)].map((m) => m[0]);
const slideWith = (text, heading) => {
  const s = sectionsOf(text).find((s) => s.includes(`<h2>${heading}`) || s.includes(`<h1>${heading}`));
  assert.ok(s, `the slide ${heading} is in the text`);
  return s;
};
// text with the slide of heading taken out, together with the line break after it
const without = (text, heading) => text.replace(`${slideWith(text, heading)}\n`, '');
// text with the slide of heading put before the slide of target
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
  // one character of the scene in base64, after the start tag of its script
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
  // the slides in the reverse order, with a slide taken, a slide put, and texts changed on others
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
