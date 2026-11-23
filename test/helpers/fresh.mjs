import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { editorPage } from './editor.mjs';
import { front } from './apply.mjs';

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

function difference(got, want) {
  let i = 0;
  while (i < got.length && i < want.length && got[i] === want[i]) i++;
  let j = 0;
  while (j < got.length - i && j < want.length - i && got[got.length - 1 - j] === want[want.length - 1 - j]) j++;
  return `after\n${got.slice(Math.max(0, i - 3), i).join('\n')}\nthe page has\n${got.slice(i, got.length - j).slice(0, 12).join('\n')}\nwhere a fresh page has\n${want.slice(i, want.length - j).slice(0, 12).join('\n')}`;
}

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
