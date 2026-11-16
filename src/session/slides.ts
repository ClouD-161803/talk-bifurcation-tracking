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

// the direct children of an element, given as its text, as the ranges of their text, with their
// names and the ends of their start tags
function childrenOf(html: string): (Range & { name: string; open: number })[] {
  const out: (Range & { name: string; open: number })[] = [];
  const stack: { name: string; start: number; open: number }[] = [];
  for (const t of tokenize(html)) {
    if (t.type === 'start') {
      if (stack.length === 1 && (VOID.has(t.name) || t.selfClosing)) out.push({ start: t.start, end: t.end, name: t.name, open: t.end });
      if (!VOID.has(t.name) && !t.selfClosing) stack.push({ name: t.name, start: t.start, open: t.end });
    } else if (t.type === 'end') {
      const at = stack.map((s) => s.name).lastIndexOf(t.name);
      if (at < 0) continue;
      if (at === 1) out.push({ start: stack[1].start, end: t.end, name: t.name, open: stack[1].open });
      stack.length = at;
    }
  }
  return out;
}

// the pairs of an item of a and an item of b that are one item, matched first by equal text in
// order, and then, between two equal ones, by the most characters shared at the start and the end.
// with half, the items are slides, paired only when they share at least half of the shorter text,
// at the start and the end or, at the same place between two equal ones, through the middle
export function pairs(a: string[], b: string[], half = false): { i: number; j: number; same: boolean }[] {
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
    for (const [x, y] of bestPairs(a.slice(pre + i0, pre + ai), b.slice(pre + j0, pre + aj), half)) out.push({ i: pre + i0 + x, j: pre + j0 + y, same: false });
    if (ai < n) out.push({ i: pre + ai, j: pre + aj, same: true });
    i0 = ai + 1;
    j0 = aj + 1;
  }
  for (let k = suf; k > 0; k--) out.push({ i: a.length - k, j: b.length - k, same: true });
  return out;
}

// the characters that x and y share at the start and the end
export const shared = (x: string, y: string) => {
  let p = 0;
  while (p < x.length && p < y.length && x[p] === y[p]) p++;
  let s = 0;
  while (s < x.length - p && s < y.length - p && x[x.length - 1 - s] === y[y.length - 1 - s]) s++;
  return p + s;
};

// the pairs in order of an item of a and an item of b, as many as the shorter list holds, that
// share the most characters in all, found by placing the shorter list into the longer one
function bestPairs(a: string[], b: string[], half: boolean): [number, number][] {
  const n = a.length, m = b.length;
  if (n === 0 || m === 0) return [];
  if (half) return closePairs(a, b);
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

// the markup inside the section of a slide, and its text without tags, with spaces collapsed
const inner = (x: string) => x.slice(x.indexOf('>') + 1, x.lastIndexOf('<')).replace(/\s+/g, ' ').trim();
const words = (x: string) => x.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

// the characters of the longest stretch of three or more whole words through the middle of the
// shorter of x and y that the other holds as well, with the spaces around it, where the shorter is
// read with a space at each end. the middle of the shorter is read, since it is kept more often,
// e.g. when a long paragraph is added. the stretches are read for about as many characters as the
// longer has
function core(x: string, y: string) {
  if (x.length > y.length) [x, y] = [y, x];
  x = ` ${x} `;
  // h is the middle of x, c its character, k the characters left to read, and b the longest
  // stretch. c is read once, since V8 reads x[h] slowly inside the loop once x is long
  const h = x.length >> 1, c = x[h];
  let k = y.length, b = 0, p = -1;
  while (k > 0 && ~(p = y.indexOf(c, ++p))) {
    // y is trimmed, hence a space at an end of x is not read with an end of y, and both are never
    // read past at once
    let l = h, r = h;
    while (x[--l] === y[l + p - h]);
    while (x[++r] === y[r + p - h]);
    // the reads are counted, and l and r become the spaces around the whole words read, found
    // inside the stretch read, since a search to the next space is not counted and is long in a
    // run without spaces, e.g. the data of a plot. one word, or two short ones such as "of the",
    // are often shared by chance by two short slides at one place, hence w, the spaces still to
    // find between l and r, starts at two
    k -= r - l;
    while (++l < r && x[l] !== ' ');
    while (--r > l && x[r] !== ' ');
    let s = r, w = 2;
    while (w && --s > l) if (x[s] === ' ') w--;
    if (!w) b = Math.max(b, r - l + 1);
  }
  return b;
}

// the pairs in order of a slide of a and a slide of b that share the most characters in all, where
// a slide is left out rather than paired with one that shares less than half of the shorter text.
// two slides share the characters at their start and end, or, at the same place counted from the
// start or the end of a and b, those of the stretch that core finds, e.g. a slide whose heading
// and notes changed. the texts are read without tags, since short slides share most of their
// markup, and the markup inside their sections is read when neither slide has text, e.g. two
// slides of one picture each
function closePairs(a: string[], b: string[]): [number, number][] {
  const n = a.length, m = b.length;
  const wa = a.map(words), wb = b.map(words);
  const ia = a.map(inner), ib = b.map(inner);
  const gain = (i: number, j: number) => {
    const [x, y] = wa[i] || wb[j] ? [wa[i], wb[j]] : [ia[i], ib[j]];
    // the middle is read only at the same place, which keeps the reads linear in the slides
    const s = Math.max(shared(x, y), i === j || n - i === m - j ? core(x, y) : 0);
    return s > 0 && 2 * s >= Math.min(x.length, y.length) ? s : -1;
  };
  const score = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const g = gain(i, j);
      score[i][j] = Math.max(score[i + 1][j], score[i][j + 1], g < 0 ? -1 : g + score[i + 1][j + 1]);
    }
  }
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    const g = gain(i, j);
    if (g >= 0 && score[i][j] === g + score[i + 1][j + 1]) out.push([i++, j++]);
    else if (score[i][j] === score[i + 1][j]) i++;
    else j++;
  }
  return out;
}

// what sameSlide reads of a slide, given as its text
type Key = { bare: boolean; name: string; first: string; tag: string };
function keyOf(x: string): Key {
  const c = childrenOf(x)[0];
  const first = c ? words(x.slice(c.start, c.end)) : '';
  return { bare: !words(x), name: c?.name ?? '', first, tag: c && !first ? x.slice(c.start, c.open) : '' };
}

// true when two slides, given by their keys, are one slide edited in place. when one is without
// words, their first children have the same name, e.g. a picture that gains a caption or an empty
// heading that is filled. otherwise the words of their first children are equal and not empty, or
// both first children are without words and have equal start tags, e.g. the same backdrop
const sameSlide = (x: Key, y: Key) => (x.bare || y.bare ? x.name === y.name : x.first ? x.first === y.first : !y.first && x.tag !== '' && x.tag === y.tag);

// pairs in to, where to[i] is the slide of b paired with slide i of a or -1, the slides left out on
// both sides that are one slide edited in place. a slide of a left out is paired with the first
// slide of b left out after the partner of the nearest paired slide before it, and before the
// partner of the nearest paired slide after it whose partner comes later, or the end of b, for which
// sameSlide holds. slides are read only around the slides left out
export function pairInPlace(to: Int32Array, m: number, textA: (i: number) => string, textB: (j: number) => string): void {
  const n = to.length;
  const used = new Uint8Array(m);
  let free = 0;
  for (let i = 0; i < n; i++) {
    if (to[i] >= 0) used[to[i]] = 1;
    else free++;
  }
  if (!free || n - free === m) return;
  const keysB = new Map<number, Key>();
  const keyB = (j: number) => keysB.get(j) ?? keysB.set(j, keyOf(textB(j))).get(j)!;
  let prev = -1;
  let after = -1;
  for (let i = 0; i < n; i++) {
    if (to[i] >= 0) {
      prev = to[i];
      after = -1;
      continue;
    }
    if (after <= i) for (after = i + 1; after < n && !(to[after] > prev); ) after++;
    const end = after < n ? to[after] : m;
    let key: Key | null = null;
    for (let j = prev + 1; j < end; j++) {
      if (used[j]) continue;
      key ??= keyOf(textA(i));
      if (!sameSlide(key, keyB(j))) continue;
      to[i] = j;
      used[j] = 1;
      prev = j;
      break;
    }
  }
}

// the numbers of the slides of after that hold a mark, and what is gone from before. an empty
// mark, where text was removed, is on a slide when it falls strictly inside it. slides are paired as
// matchSlides of anchor.ts pairs them: in order by equal or half-shared text, then a moved slide by
// its equal text, then by pairInPlace. a slide of before left unpaired is gone
export function slideChanges(before: string, beforeSlides: Slide[], after: string, afterSlides: Slide[], marks: Range[]): SlideChanges {
  const a = beforeSlides.map((s) => before.slice(s.start, s.end));
  const b = afterSlides.map((s) => after.slice(s.start, s.end));
  const matched = pairs(a, b, true);
  const to = new Int32Array(a.length).fill(-1);
  for (const p of matched) to[p.i] = p.j;
  // a slide moved past others is left out of the pairs in order, and paired by its equal text, the
  // nearest between several, as matchSlides of anchor.ts pairs it
  const free = new Map<string, number[]>();
  const paired = new Set(matched.map((p) => p.j));
  b.forEach((t, j) => {
    if (paired.has(j)) return;
    const list = free.get(t);
    if (list) list.push(j);
    else free.set(t, [j]);
  });
  a.forEach((t, i) => {
    const list = to[i] < 0 ? free.get(t) : undefined;
    if (!list?.length) return;
    let k = 0;
    for (let x = 1; x < list.length; x++) if (Math.abs(list[x] - i) < Math.abs(list[k] - i)) k = x;
    to[i] = list.splice(k, 1)[0];
  });
  const moved = Int32Array.from(to);
  pairInPlace(to, b.length, (i) => a[i], (j) => b[j]);
  to.forEach((j, i) => {
    if (j >= 0 && moved[i] < 0) matched.push({ i, j, same: false });
  });
  // a slide that reads as before is not changed, although a line diff may have marked its start tag
  const same = new Set(matched.filter((p) => p.same).map((p) => p.j));
  const slides = new Set<number>();
  afterSlides.forEach((s, j) => {
    if (!same.has(j) && marks.some((m) => (m.start < m.end ? m.start < s.end && s.start < m.end : s.start < m.start && m.start < s.end))) slides.add(s.number);
  });
  const gone = beforeSlides.filter((_, i) => to[i] < 0).map((s) => s.number);
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
