// the work and the time of an apply of a change of one character, see src/editor/session/apply.ts.
// the apply writes only the text element of the character and parses no file, and it renders the
// deck only when the person typed a key into a heading before it, once, to keep the key. the work
// is counted, since the tests run on shared machines, and a time is bounded only with a margin of
// five over the times measured: on test-deck.html, with 13 slides, an apply costs at most ten times
// the same apply on a deck of three slides, and at most two opens of the same text, each of which
// parses the file and pairs it with the page. the same bounds hold for an apply into the text
// element with a formula in which the person types, which keeps the entry of the typing. each time
// is the median of 21 applies, with the CPU of Chrome at full speed and throttled six times

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { E, front, showSlide } from './helpers/apply.mjs';
import { editorPage } from './helpers/editor.mjs';
import { freshDeck } from './helpers/fresh.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

// the heading of the page that starts with typed
const headingOf = (typed) => `[...document.querySelectorAll('.reveal h1, .reveal h2')].find((h) => h.textContent.startsWith(${JSON.stringify(typed)}))`;

// the medians in ms of an apply that changes the first character of word, each after a key typed
// at the end of the text element of the expression host when host is given, and of an open
const measure = (page, word, host) => page.evaluate(`(async () => {
  const base = ${JSON.stringify(page.source)};
  const at = base.indexOf(${JSON.stringify(word)});
  const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  const host = ${host ?? 'null'};
  if (${!!host} && !host) return null;
  const apply = [];
  for (let i = 0; i < 21; i++) {
    if (host) {
      host.focus();
      getSelection().selectAllChildren(host);
      getSelection().collapseToEnd();
      document.execCommand('insertText', false, 'x');
      // the page draws the key before the apply is timed, as between two keys of the person
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    }
    const text = base.slice(0, at) + 'abcdefghijk'[i % 11] + base.slice(at + 1);
    const t0 = performance.now();
    const r = await ${E}.apply(text);
    apply.push(performance.now() - t0);
    if (r.reload) return null;
  }
  if (host && !${E}.render().includes('x'.repeat(21))) return null;
  const open = [];
  for (let i = 0; i < 5; i++) {
    const text = ${E}.render();
    const t0 = performance.now();
    ${E}.open(text, false);
    open.push(performance.now() - t0);
  }
  return { apply: median(apply), open: median(open) };
})()`);

// the work of 21 applies as measure makes them: the parses of a text as long as half the file, the
// changes written outside the text element of word, the attributes read of the elements of other
// slides, and those read by one render of the deck, which reads the attributes of every element in
// a text element. a section is left out, since the slide strip reads the attributes of each slide
const work = (page, word, typed) => page.evaluate(`(async () => {
  const base = ${JSON.stringify(page.source)};
  const at = base.indexOf(${JSON.stringify(word)});
  const deck = document.querySelector('.reveal .slides');
  const target = [...deck.querySelectorAll('p, li, h1, h2')].find((el) => el.textContent.includes(${JSON.stringify(word)}));
  const slide = target?.closest('.reveal .slides > section');
  const host = ${typed ? `[...document.querySelectorAll('.reveal h1, .reveal h2')].find((h) => h.textContent.startsWith(${JSON.stringify(typed)}))` : 'null'};
  if (!slide || (${!!typed} && !host)) return null;
  const count = { parses: 0, writes: [], reads: 0, render: 0 };
  let on = false;
  const parse = DOMParser.prototype.parseFromString;
  const get = Element.prototype.getAttribute;
  DOMParser.prototype.parseFromString = function (s, type) {
    if (on && s.length >= base.length / 2) count.parses++;
    return parse.call(this, s, type);
  };
  Element.prototype.getAttribute = function (name) {
    if (on && this.localName !== 'section' && deck.contains(this) && !slide.contains(this)) count.reads++;
    return get.call(this, name);
  };
  // a class list sets its attribute again also when it does not change
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (!on || target.contains(r.target) || (r.type === 'attributes' && r.oldValue === get.call(r.target, r.attributeName))) continue;
      count.writes.push(r.type + ' of ' + (r.target.localName ?? 'a text node'));
    }
  });
  observer.observe(deck, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true });
  try {
    on = true;
    ${E}.render();
    on = false;
    count.render = count.reads;
    count.reads = 0;
    for (let i = 0; i < 21; i++) {
      if (host) {
        host.focus();
        getSelection().selectAllChildren(host);
        getSelection().collapseToEnd();
        document.execCommand('insertText', false, 'x');
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      }
      on = true;
      const r = await ${E}.apply(base.slice(0, at) + 'abcdefghijk'[i % 11] + base.slice(at + 1));
      on = false;
      if (r.reload) return null;
    }
  } finally {
    on = false;
    DOMParser.prototype.parseFromString = parse;
    Element.prototype.getAttribute = get;
    observer.disconnect();
  }
  count.writes = [...new Set(count.writes)];
  return count;
})()`);

for (const typed of [false, true]) {
  test(`an apply of one character writes only its text element, parses no file, and renders the deck ${typed ? 'once, after a key typed by the person' : 'not at all'}`, async (t) => {
    const page = await editorPage(browser);
    t.after(() => page.close());
    await front(page);
    const got = await work(page, 'Direct the viewer', typed && 'Presenting in HTML');
    assert.ok(got, 'the applies did not need a reload');
    t.diagnostic(`a render reads ${got.render} attributes of other slides, and the applies ${got.reads}`);
    assert.ok(got.render > 0, 'a render reads the attributes of other slides');
    assert.equal(got.parses, 0, 'the parses of the file');
    assert.deepEqual(got.writes, [], 'the changes written outside the text element');
    assert.ok(got.reads < (typed ? 22 : 1) * got.render, `the applies read ${got.reads} attributes of other slides, and a render ${got.render}`);
  });
}

const DECKS = [
  ['test-deck.html', undefined, 'Direct the viewer', 'Presenting in HTML'],
  ['a deck of three slides', 'test/pages/editor-hidden.html', 'The first slide', 'Shown'],
];

for (const typed of [false, true]) {
  for (const rate of [1, 6]) {
    const typing = typed ? ', after a key typed by the person' : '';
    test(`an apply of one character costs less than two opens, and grows little with the deck${typing}, with the CPU throttled ${rate} times`, { timeout: 300000 }, async (t) => {
      // the pages are opened one after the other, since a page behind does not draw frames
      const pages = [];
      t.after(() => Promise.all(pages.map((p) => p.close())));
      for (const [, deck] of DECKS) pages.push(await editorPage(browser, deck ? { deck } : {}));
      let found = '';
      for (let round = 1; round <= 3; round++) {
        const times = [];
        for (const [i, page] of pages.entries()) {
          await front(page);
          await page.send('Emulation.setCPUThrottlingRate', { rate });
          try {
            times.push(await measure(page, DECKS[i][2], typed ? headingOf(DECKS[i][3]) : null));
          } finally {
            await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
          }
          assert.ok(times[i], `${DECKS[i][0]}: the apply did not need a reload, and kept the keys typed`);
        }
        const [deck, small] = times;
        found = `${deck.apply.toFixed(1)} ms on test-deck.html against ${small.apply.toFixed(1)} ms on a deck of three slides, and an open of test-deck.html in ${deck.open.toFixed(1)} ms`;
        t.diagnostic(`round ${round}: an apply in ${found}`);
        if (deck.apply <= 10 * Math.max(small.apply, 0.1) && deck.apply <= 2 * deck.open) return;
      }
      assert.fail(`an apply in ${found}, in each of three rounds`);
    });
  }
}

// a paragraph with a formula, in which the person types at the end and another person changes the
// first character of a word, on test-deck.html and on the deck of three slides with MathJax
const FORMULA = `[...document.querySelectorAll('.reveal p')].find((p) => p.textContent.includes('is the effective potential.'))`;
const SMALL = readFileSync('test/pages/editor-hidden.html', 'utf8')
  .replaceAll('../../theme/', 'theme/')
  .replace('</head>', '<script src="theme/mathjax-config.js"></script>\n<script src="theme/vendor/mathjax/tex-svg.js"></script>\n</head>')
  .replace('<p>The first slide.</p>', '<p>The first slide.</p>\n      <p>where \\(\\tilde U\\) is the effective potential.</p>');

for (const rate of [1, 6]) {
  test(`an apply of one character into the text element with a formula in which the person types costs less than two opens, and grows little with the deck, with the CPU throttled ${rate} times`, { timeout: 300000 }, async (t) => {
    const pages = [];
    t.after(() => Promise.all(pages.map((p) => p.close())));
    pages.push(await editorPage(browser));
    pages.push(await editorPage(browser, { deck: freshDeck(t, SMALL), text: SMALL }));
    const decks = [['test-deck.html', 'Equations are first class'], ['a deck of three slides', 'Shown']];
    let found = '';
    for (let round = 1; round <= 3; round++) {
      const times = [];
      for (const [i, page] of pages.entries()) {
        await front(page);
        await showSlide(page, decks[i][1]);
        await page.send('Emulation.setCPUThrottlingRate', { rate });
        try {
          times.push(await measure(page, 'effective potential.', FORMULA));
        } finally {
          await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        }
        assert.ok(times[i], `${decks[i][0]}: the apply did not need a reload, and kept the keys typed`);
      }
      const [deck, small] = times;
      found = `${deck.apply.toFixed(1)} ms on test-deck.html against ${small.apply.toFixed(1)} ms on a deck of three slides, and an open of test-deck.html in ${deck.open.toFixed(1)} ms`;
      t.diagnostic(`round ${round}: an apply in ${found}`);
      if (deck.apply <= 10 * Math.max(small.apply, 0.1) && deck.apply <= 2 * deck.open) return;
    }
    assert.fail(`an apply in ${found}, in each of three rounds`);
  });
}
