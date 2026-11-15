// a page of a session compared with a fresh page opened on the same text, see
// test/editor-apply-fresh.test.mjs

import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { editorPage } from './editor.mjs';
import { front } from './apply.mjs';

// a copy of the repository in a temporary folder, with the deck at text. the folders are linked.
// tex.js and its sources are copied, since the fresh page of a Windows runner did not get a linked
// tex.js
export function freshDeck(t, text) {
  const dir = mkdtempSync(join(tmpdir(), 'beeson-fresh-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of readdirSync('.')) {
    if (name === 'node_modules' || name === '.git') continue;
    if (statSync(name).isDirectory()) symlinkSync(resolve(name), join(dir, name));
    else if (/\.(js|tex|bib)$/.test(name)) copyFileSync(name, join(dir, name));
  }
  const file = join(dir, 'deck.html');
  writeFileSync(file, text);
  return file;
}

// a function of the page that describes the slides and their backgrounds as lines: each element
// with its attributes, its classes, its style, and its offset in the file, each text node, each
// formula by its TeX and the size of its markup, the counts and the indexes of reveal.js, and what
// each backdrop, surface, and plot of the theme read from its element. the lines leave out what
// tells which slides were shown or near the slide shown: data-fragment, data-previous-indexv, and
// data-loaded, which reveal.js sets on a slide and a stack that were shown or near, data-complete, data-held,
// data-shown, and the classes hl-*, which the theme sets on a slide when it is shown or mounted,
// the size of the canvases and
// the places of the labels of a drawing, which are set when it is drawn, and the classes past,
// present, and future, hidden, and aria-hidden of the slides of a stack that is not shown. they
// also leave out the view of a backdrop fitted to its drawing, which the editor sets when it syncs
// its backdrops, the number of a TikZ figure in its ids, which counts the figures of a page in the
// order in which their outputs were loaded, the data-latex of a formula, which MathJax writes with
// another spacing the first time it loads a package, the text nodes of white space, an empty class,
// the way a style is
// written, and the selection, the caret, and the focus, which are not part of the page that a text
// opens
export const PICTURE = `(() => {
  const slides = document.querySelector('.reveal .slides');
  const items = window.MathJax?.startup?.document?.getMathItemsWithin([slides]) ?? [];
  const tex = new Map(items.filter((i) => i.typesetRoot).map((i) => [i.typesetRoot, (i.display ? 'D:' : 'I:') + i.math]));
  const at = (el) => window.BeesonEditor.session.offsetOf(el);
  const current = Reveal.getCurrentSlide();
  const NAV = new Set(['past', 'present', 'future']);
  const LEFT = new Set(['data-previous-indexv', 'data-loaded', 'data-complete', 'data-held', 'data-shown']);
  const attrsOf = (el) => {
    const away = el.localName === 'section' && el.parentElement?.localName === 'section' && !el.parentElement.contains(current);
    const out = [];
    for (const a of el.attributes) {
      let v = a.value;
      if (LEFT.has(a.name) || (a.name === 'data-fragment' && el.localName === 'section') || (away && (a.name === 'hidden' || a.name === 'aria-hidden'))) continue;
      if ((a.name === 'width' || a.name === 'height') && el.matches('.backdrop > canvas, .surface > canvas, .plot canvas')) continue;
      if (a.name === 'class') v = [...el.classList].filter((c) => !c.startsWith('hl-') && !(away && NAV.has(c))).join(' ');
      if (a.name === 'style') v = el.matches('.backdrop > .label, .surface > .label') ? '' : [...el.style].sort().map((p) => p + ': ' + el.style.getPropertyValue(p) + (el.style.getPropertyPriority(p) ? ' !important' : '')).join('; ');
      if ((a.name === 'class' || a.name === 'style') && !v) continue;
      if (v.includes('tikz-')) v = v.replace(/(tikz-.+?-(?:dark|light)-)\\d+-/g, '$1');
      out.push(a.name + '=' + v);
    }
    return out.sort();
  };
  const out = [];
  const walk = (el, depth) => {
    if (el.localName === 'mjx-container') {
      out.push(depth + 'math ' + tex.get(el) + ' ' + el.innerHTML.replace(/ hl-[a-z]+| data-latex="[^"]*"/g, '').length);
      return;
    }
    const attrs = attrsOf(el);
    const off = at(el);
    out.push(depth + el.localName + ' ' + attrs.join(' ') + (off === null ? '' : ' @' + off));
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { if (n.data.trim()) out.push(depth + ' "' + n.data + '"'); }
      else if (n.nodeType === 1) walk(n, depth + ' ');
    }
  };
  walk(slides, '');
  walk(document.querySelector('.reveal .backgrounds'), '');
  out.push('reveal ' + JSON.stringify({ total: Reveal.getTotalSlides(), h: Reveal.getHorizontalSlides().length, idx: Reveal.getIndices() }));
  const labels = (o) => o.labels.map((l) => (l.isConnected ? l.dataset.at : 'gone'));
  const fitted = (o) => o.el.dataset.trajectories !== undefined && o.el.dataset.half === undefined;
  const drawn = [
    ...Beeson.backdrops.map((o) => [o.el, { ...(fitted(o) ? {} : { cx: o.cx, cy: o.cy, half: o.half }), loop: o.loop, duration: o.duration, stagger: o.stagger, n: o.trajectories.length, labels: labels(o) }]),
    ...Beeson.surfaces.map((s) => [s.el, { zscale: s.zscale, rate: s.rate, azimuth: s.azimuth, elevation: s.elevation, zoom: s.zoom, zmin: s.zmin, zmax: s.zmax, labels: labels(s) }]),
    ...Beeson.plots.map((p) => [p.el, { tab: p.tab, panels: p.panels.length }]),
  ];
  const lines = drawn.filter(([el]) => slides.contains(el)).map(([el, state]) => 'drawn ' + el.className + ' @' + at(el) + ' ' + JSON.stringify(state));
  return [...out, ...lines.sort()];
})()`;

// the first lines where got and want differ, with the lines before them
function difference(got, want) {
  let i = 0;
  while (i < got.length && i < want.length && got[i] === want[i]) i++;
  let j = 0;
  while (j < got.length - i && j < want.length - i && got[got.length - 1 - j] === want[want.length - 1 - j]) j++;
  return `after\n${got.slice(Math.max(0, i - 3), i).join('\n')}\nthe page has\n${got.slice(i, got.length - j).slice(0, 12).join('\n')}\nwhere a fresh page has\n${want.slice(i, want.length - j).slice(0, 12).join('\n')}`;
}

/**
 * Asserts that page b looks as a fresh page opened on text in browser, both at the slide that b
 * shows.
 */
export async function looksFresh(t, browser, b, text, label = '') {
  const c = await editorPage(browser, { deck: freshDeck(t, text), text });
  try {
    const idx = await b.evaluate('Reveal.getIndices()');
    await c.evaluate(`Reveal.slide(${idx.h}, ${idx.v ?? 0})`);
    await c.waitFor(`(() => { const i = Reveal.getIndices(); return i.h === ${idx.h} && (i.v ?? 0) === ${idx.v ?? 0}; })()`);
    await front(c);
    const want = await c.evaluate(PICTURE);
    await front(b);
    const got = await b.evaluate(PICTURE);
    if (got.join('\n') !== want.join('\n')) assert.fail(`${label}: the page differs from a fresh page ${difference(got, want)}${c.errors.length ? `\nthe fresh page had the errors\n${c.errors.join('\n')}` : ''}`);
    assert.deepEqual(c.errors, [], `${label}: errors of a fresh page`);
  } finally {
    await c.close();
  }
}
