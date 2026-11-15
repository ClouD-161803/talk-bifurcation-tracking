// the slides of a deck read from its text with the tokenizer, numbered as the status bar of the
// editor numbers them, and the slides that differ between two texts. a slide is a section without
// a section inside it. a slide at the top is numbered by its place in the show, where a hidden
// slide takes the place of the shown slide after it. a vertical slide of a stack is numbered as
// reveal.js counts it in the status bar, i.e. after every vertical slide and every slide at the top
// before it, leaving out the stacks themselves and the slides with data-visibility="uncounted",
// which the theme sets at run time on a title, section, or closing slide and on the appendix

import { classesOf, decodeAttr, tokenize, type Token } from '../editor/tokens.ts';

export type Slide = {
  // from the start of its start tag to the end of its end tag
  start: number;
  end: number;
  // the end of its start tag
  open: number;
  number: number;
};

// the slides of a version that differ from the version before. removed holds the numbers in the
// text of the version before of the slides that are gone, and the count of the elements that are
// gone from a slide that is still there, i.e. what a preview cannot outline
export type SlideChanges = { slides: number[]; removed?: { slides: number[]; elements: number } };

type Range = { start: number; end: number };

export const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

const visibility = (t: Token): string => {
  if (t.type !== 'start') return '';
  const a = t.attrs.find((x) => x.name === 'data-visibility');
  return a?.value ? decodeAttr(a.value) : '';
};

type Section = { start: number; open: number; end: number; vis: string; classes: string[]; inner: Section[] };

export function slidesOf(text: string, tokens: Token[] = tokenize(text)): Slide[] {
  const tops: Section[] = [];
  const stack: Section[] = [];
  for (const t of tokens) {
    if (t.type === 'start' && t.name === 'section') {
      const s: Section = { start: t.start, open: t.end, end: text.length, vis: visibility(t), classes: classesOf(t), inner: [] };
      if (stack.length) stack[0].inner.push(s);
      else tops.push(s);
      if (!t.selfClosing) stack.push(s);
    } else if (t.type === 'end' && t.name === 'section' && stack.length) {
      stack.pop()!.end = t.end;
    }
  }
  const out: Slide[] = [];
  // the place in the show of the last shown slide at the top, where a stack counts once
  let place = 0;
  // the slides before, as reveal.js counts them for a vertical slide
  let past = 0;
  let appendix = false;
  for (const top of tops) {
    if (top.vis !== 'hidden') place++;
    const shown = top.vis === 'hidden' ? place + 1 : place;
    const uncounted = top.vis === 'uncounted' || (!top.vis && (appendix || top.classes.some((c) => c === 'title' || c === 'section' || c === 'closing')));
    if (!appendix && top.classes.includes('closing')) appendix = true;
    if (top.inner.length === 0) {
      out.push({ start: top.start, end: top.end, open: top.open, number: shown });
      if (!uncounted) past++;
      continue;
    }
    for (let i = 0; i < top.inner.length; i++) {
      const s = top.inner[i];
      const leaf = !top.inner.some((o, j) => j > i && o.start < s.end);
      if (leaf) out.push({ start: s.start, end: s.end, open: s.open, number: past + 1 });
      if (s.vis !== 'uncounted') past++;
    }
  }
  return out;
}

// the direct children of an element, given as its text, as the ranges of their text
function childrenOf(html: string): Range[] {
  const out: Range[] = [];
  const stack: { name: string; start: number }[] = [];
  for (const t of tokenize(html)) {
    if (t.type === 'start') {
      if (stack.length === 1 && (VOID.has(t.name) || t.selfClosing)) out.push({ start: t.start, end: t.end });
      if (!VOID.has(t.name) && !t.selfClosing) stack.push({ name: t.name, start: t.start });
    } else if (t.type === 'end') {
      const at = stack.map((s) => s.name).lastIndexOf(t.name);
      if (at < 0) continue;
      if (at === 1) out.push({ start: stack[1].start, end: t.end });
      stack.length = at;
    }
  }
  return out;
}

// the pairs of an item of a and an item of b that are one item, matched first by equal text in
// order, and then, between two equal ones, by the most characters shared at the start and the end
export function pairs(a: string[], b: string[]): { i: number; j: number; same: boolean }[] {
  const out: { i: number; j: number; same: boolean }[] = [];
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) out.push({ i: pre, j: pre, same: true }), pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const n = a.length - pre - suf, m = b.length - pre - suf;
  // the longest common subsequence of the middle by equal text
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[pre + i] === b[pre + j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const anchors: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[pre + i] === b[pre + j]) anchors.push([i++, j++]);
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  anchors.push([n, m]);
  let i0 = 0, j0 = 0;
  for (const [ai, aj] of anchors) {
    for (const [x, y] of bestPairs(a.slice(pre + i0, pre + ai), b.slice(pre + j0, pre + aj))) out.push({ i: pre + i0 + x, j: pre + j0 + y, same: false });
    if (ai < n) out.push({ i: pre + ai, j: pre + aj, same: true });
    i0 = ai + 1;
    j0 = aj + 1;
  }
  for (let k = suf; k > 0; k--) out.push({ i: a.length - k, j: b.length - k, same: true });
  return out;
}

const shared = (x: string, y: string) => {
  let p = 0;
  while (p < x.length && p < y.length && x[p] === y[p]) p++;
  let s = 0;
  while (s < x.length - p && s < y.length - p && x[x.length - 1 - s] === y[y.length - 1 - s]) s++;
  return p + s;
};

// the pairs in order of an item of a and an item of b, as many as the shorter list holds, that
// share the most characters in all, found by placing the shorter list into the longer one
function bestPairs(a: string[], b: string[]): [number, number][] {
  const n = a.length, m = b.length;
  if (n === 0 || m === 0) return [];
  if (n === m) return a.map((_, i) => [i, i]);
  const k = Math.min(n, m);
  const [short, long, flip] = n < m ? [a, b, false] : [b, a, true];
  const score: number[][] = Array.from({ length: k + 1 }, () => new Array(long.length + 1).fill(-Infinity));
  for (let j = 0; j <= long.length; j++) score[0][j] = 0;
  for (let i = 1; i <= k; i++) for (let j = i; j <= long.length; j++) score[i][j] = Math.max(score[i][j - 1], score[i - 1][j - 1] + shared(short[i - 1], long[j - 1]));
  const out: [number, number][] = [];
  for (let i = k, j = long.length; i > 0; j--) {
    if (score[i][j] !== score[i][j - 1]) {
      out.push(flip ? [j - 1, i - 1] : [i - 1, j - 1]);
      i--;
    }
  }
  return out.reverse();
}

// the numbers of the slides of after that hold a mark, and what is gone from before. an empty
// mark, where text was removed, is on a slide when it falls strictly inside it
export function slideChanges(before: string, beforeSlides: Slide[], after: string, afterSlides: Slide[], marks: Range[]): SlideChanges {
  const a = beforeSlides.map((s) => before.slice(s.start, s.end));
  const b = afterSlides.map((s) => after.slice(s.start, s.end));
  const matched = pairs(a, b);
  // a slide that reads as before is not changed, although a line diff may have marked its start tag
  const same = new Set(matched.filter((p) => p.same).map((p) => p.j));
  const slides = new Set<number>();
  afterSlides.forEach((s, j) => {
    if (!same.has(j) && marks.some((m) => (m.start < m.end ? m.start < s.end && s.start < m.end : s.start < m.start && m.start < s.end))) slides.add(s.number);
  });
  const kept = new Set(matched.map((p) => p.i));
  // a slide moved past others is left out of the pairs in order, and kept by its equal text
  const paired = new Set(matched.map((p) => p.j));
  const free = new Map<string, number>();
  b.forEach((t, j) => {
    if (!paired.has(j)) free.set(t, (free.get(t) ?? 0) + 1);
  });
  a.forEach((t, i) => {
    const n = free.get(t);
    if (kept.has(i) || !n) return;
    free.set(t, n - 1);
    kept.add(i);
  });
  const gone = beforeSlides.filter((_, i) => !kept.has(i)).map((s) => s.number);
  let elements = 0;
  for (const p of matched) {
    if (p.same) continue;
    const x = childrenOf(a[p.i]).map((r) => a[p.i].slice(r.start, r.end));
    const y = childrenOf(b[p.j]).map((r) => b[p.j].slice(r.start, r.end));
    elements += x.length - pairs(x, y).length;
  }
  const out: SlideChanges = { slides: [...slides].sort((x, y) => x - y) };
  if (gone.length || elements) out.removed = { slides: [...new Set(gone)].sort((x, y) => x - y), elements };
  return out;
}
