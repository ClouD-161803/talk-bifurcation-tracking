import { classesOf, decodeAttr, tokenize, type Token } from '../editor/tokens.ts';

export type Slide = {
  start: number;
  end: number;
  open: number;
  number: number;
};

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
  let place = 0;
  let past = 0;
  let appendix = false;
  for (const top of tops) {
    if (top.vis !== 'hidden') place++;
    const shown = top.vis === 'hidden' ? place + 1 : place;
    const uncounted = top.vis === 'uncounted' || (!top.vis && (appendix || top.classes.some((c) => c === 'title' || c === 'section' || c === 'closing')));
    if (!appendix && top.classes.includes('closing')) appendix = true;
    if (top.inner.length === 0) {
      out.push({ start: top.start, end: top.end, open: top.open, number: shown });
      if (!uncounted && top.vis !== 'hidden') past++;
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

export function pairs(a: string[], b: string[], half = false, mid = false): { i: number; j: number; same: boolean }[] {
  const out: { i: number; j: number; same: boolean }[] = [];
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) out.push({ i: pre, j: pre, same: true }), pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const n = a.length - pre - suf, m = b.length - pre - suf;
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
    for (const [x, y] of bestPairs(a.slice(pre + i0, pre + ai), b.slice(pre + j0, pre + aj), half, mid)) out.push({ i: pre + i0 + x, j: pre + j0 + y, same: false });
    if (ai < n) out.push({ i: pre + ai, j: pre + aj, same: true });
    i0 = ai + 1;
    j0 = aj + 1;
  }
  for (let k = suf; k > 0; k--) out.push({ i: a.length - k, j: b.length - k, same: true });
  return out;
}

export const shared = (x: string, y: string) => {
  let p = 0;
  while (p < x.length && p < y.length && x[p] === y[p]) p++;
  let s = 0;
  while (s < x.length - p && s < y.length - p && x[x.length - 1 - s] === y[y.length - 1 - s]) s++;
  return p + s;
};

function bestPairs(a: string[], b: string[], half: boolean, mid: boolean): [number, number][] {
  const n = a.length, m = b.length;
  if (n === 0 || m === 0) return [];
  if (half) return closePairs(a, b, mid);
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

const inner = (x: string) => x.slice(x.indexOf('>') + 1, x.lastIndexOf('<')).replace(/\s+/g, ' ').trim();
const words = (x: string) => x.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

function core(x: string, y: string) {
  if (x.length > y.length) [x, y] = [y, x];
  x = ` ${x} `;
  const h = x.length >> 1, hoistedMiddle = x[h];
  let k = y.length, b = 0, p = -1;
  while (k > 0 && ~(p = y.indexOf(hoistedMiddle, ++p))) {
    let l = h, r = h;
    while (x[--l] === y[l + p - h]);
    while (x[++r] === y[r + p - h]);
    k -= r - l;
    while (++l < r && x[l] !== ' ');
    while (--r > l && x[r] !== ' ');
    let s = r, w = 2;
    while (w && --s > l) if (x[s] === ' ') w--;
    if (!w) b = Math.max(b, r - l + 1);
  }
  return b;
}

function closePairs(a: string[], b: string[], mid: boolean): [number, number][] {
  const n = a.length, m = b.length;
  const wa = a.map(words), wb = b.map(words);
  const ia = a.map(inner), ib = b.map(inner);
  const gain = (i: number, j: number) => {
    const [x, y] = wa[i] || wb[j] ? [wa[i], wb[j]] : [ia[i], ib[j]];
    const s = Math.max(shared(x, y), mid && (i === j || n - i === m - j) ? core(x, y) : 0);
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

type Key = { bare: boolean; name: string; first: string; tag: string };
function keyOf(x: string): Key {
  const c = childrenOf(x)[0];
  const first = c ? words(x.slice(c.start, c.end)) : '';
  return { bare: !words(x), name: c?.name ?? '', first, tag: c && !first ? x.slice(c.start, c.open) : '' };
}

const sameSlide = (x: Key, y: Key) => (x.bare || y.bare ? x.name === y.name : x.first ? x.first === y.first : !y.first && x.tag !== '' && x.tag === y.tag);

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

export function slideChanges(before: string, beforeSlides: Slide[], after: string, afterSlides: Slide[], marks: Range[]): SlideChanges {
  const a = beforeSlides.map((s) => before.slice(s.start, s.end));
  const b = afterSlides.map((s) => after.slice(s.start, s.end));
  const matched = pairs(a, b, true, true);
  const to = new Int32Array(a.length).fill(-1);
  for (const p of matched) to[p.i] = p.j;
  const free = new Map<string, number[]>();
  const paired = new Set(matched.map((p) => p.j));
  b.forEach((t, j) => {
    if (paired.has(j)) return;
    const list = free.get(t);
    if (list) list.push(j);
    else free.set(t, [j]);
  });
  const past = new Set<number>();
  a.forEach((t, i) => {
    const list = to[i] < 0 ? free.get(t) : undefined;
    if (!list?.length) return;
    let k = 0;
    for (let x = 1; x < list.length; x++) if (Math.abs(list[x] - i) < Math.abs(list[k] - i)) k = x;
    past.add((to[i] = list.splice(k, 1)[0]));
  });
  const moved = Int32Array.from(to);
  pairInPlace(to, b.length, (i) => a[i], (j) => b[j]);
  to.forEach((j, i) => {
    if (j >= 0 && moved[i] < 0) matched.push({ i, j, same: false });
  });
  const same = new Set(matched.filter((p) => p.same).map((p) => p.j));
  const slides = new Set<number>();
  afterSlides.forEach((s, j) => {
    if (past.has(j)) slides.add(s.number);
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
