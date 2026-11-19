import { widen } from '../session/patch.ts';

export type Edit = { start: number; end: number; text: string };
export type Merge = { text: string; conflicts: Edit[] };

const MAX_LINES = 2000;

const linesOf = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

function offsets(lines: string[]): number[] {
  const out = [0];
  for (const line of lines) out.push(out[out.length - 1] + line.length);
  return out;
}

type Hunk = { a0: number; a1: number; b0: number; b1: number };

const CHUNK = 2048;

export function shared(a: string, b: string): [number, number] {
  const n = Math.min(a.length, b.length);
  let s = 0;
  while (s + CHUNK <= n && a.slice(s, s + CHUNK) === b.slice(s, s + CHUNK)) s += CHUNK;
  while (s < n && a.charCodeAt(s) === b.charCodeAt(s)) s += 1;
  const most = n - s;
  let t = 0;
  while (t + CHUNK <= most && a.slice(a.length - t - CHUNK, a.length - t) === b.slice(b.length - t - CHUNK, b.length - t)) t += CHUNK;
  while (t < most && a.charCodeAt(a.length - 1 - t) === b.charCodeAt(b.length - 1 - t)) t += 1;
  return [s, t];
}

function diff(a: ArrayLike<string>, b: ArrayLike<string>, max: number): Hunk[] | null {
  const n = a.length, m = b.length;
  const limit = Math.min(n + m, max);
  const off = limit + 1;
  const v = new Int32Array(2 * limit + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= limit && found < 0; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  if (found < 0) return null;
  const steps: { x: number; y: number; del: boolean }[] = [];
  let x = n, y = m;
  for (let d = found; d > 0; d--) {
    const prev = trace[d];
    const k = x - y;
    const pk = k === -d || (k !== d && prev[off + k - 1] < prev[off + k + 1]) ? k + 1 : k - 1;
    const del = pk === k - 1;
    const px = prev[off + pk], py = px - pk;
    while (x > px + (del ? 1 : 0) && y > py + (del ? 0 : 1)) {
      x--;
      y--;
    }
    steps.push({ x: px, y: py, del });
    x = px;
    y = py;
  }
  steps.reverse();
  const hunks: Hunk[] = [];
  for (const s of steps) {
    const last = hunks[hunks.length - 1];
    const h = last && last.a1 === s.x && last.b1 === s.y ? last : { a0: s.x, a1: s.x, b0: s.y, b1: s.y };
    if (h !== last) hunks.push(h);
    if (s.del) h.a1 += 1;
    else h.b1 += 1;
  }
  return hunks;
}

const SECTION = /^[ \t]*<\/?section[\s>]/m;

function slidesOf(lines: string[]): Map<string, number[]> {
  const out = new Map<string, number[]>(), open: number[] = [];
  lines.forEach((line, i) => {
    const t = line.trimStart();
    if (/^<section[\s>]/.test(t) && !t.includes('</section')) open.push(i);
    const from = t.startsWith('</section') ? open.pop() ?? -1 : -1;
    if (from < 0) return;
    const text = lines.slice(from, i + 1).join('');
    out.set(text, [out.has(text) ? -1 : from, i + 1 - from]);
  });
  return out;
}

function markMoved(a: string[], b: string[]): [string[], string[]] | null {
  const inB = slidesOf(b);
  let end = 0;
  const pairs = [...slidesOf(a)].map(([t, [from, n]]) => [from, inB.get(t)?.[0] ?? -1, n]).filter((p) => p.every((v) => v >= 0)).sort((p, q) => p[0] - q[0]).filter(([from, , n]) => from >= end && (end = from + n));
  const best = pairs.map((p) => p[2]), prev = pairs.map(() => -1);
  pairs.forEach((p, i) => pairs.forEach((q, j) => {
    if (j < i && q[1] < p[1] && best[j] + p[2] > best[i]) [best[i], prev[i]] = [best[j] + p[2], j];
  }));
  const kept = new Set<number>();
  for (let i = best.indexOf(Math.max(...best)); i >= 0; i = prev[i]) kept.add(i);
  if (kept.size === pairs.length) return null;
  const x = [...a], y = [...b];
  pairs.forEach(([from, to, n], i) => {
    for (let k = 0; k < n && !kept.has(i); k++) [x[from + k], y[to + k]] = ['\0a', '\0b'];
  });
  return [x, y];
}

export function changes(base: string, theirs: string, plain?: boolean): Edit[] | null {
  if (base === theirs) return [];
  const [head, tail] = shared(base, theirs);
  const end = base.length - tail;
  const text = theirs.slice(head, theirs.length - tail);
  if (!base.slice(head, end).includes('\n') && !text.includes('\n')) return end - head > base.length / 2 ? null : [{ start: head, end, text }];
  const a = linesOf(base), b = linesOf(theirs);
  let x = a, y = b, pre = 0, suf = 0;
  const trim = () => {
    pre = suf = 0;
    while (pre < x.length && pre < y.length && x[pre] === y[pre]) pre++;
    while (suf < x.length - pre && suf < y.length - pre && x[x.length - 1 - suf] === y[y.length - 1 - suf]) suf++;
  };
  trim();
  const slides = (l: string[]) => l.slice(pre, l.length - suf).join('').split(SECTION).length;
  const moved = !plain && slides(a) > 1 && slides(a) === slides(b) && markMoved(a, b);
  if (moved) {
    [x, y] = moved;
    trim();
  }
  const hunks = diff(x.slice(pre, x.length - suf), y.slice(pre, y.length - suf), MAX_LINES);
  if (!hunks) return null;
  const oa = offsets(a), ob = offsets(b);
  const out: Edit[] = [];
  let removed = 0;
  for (const h of hunks) {
    let start = oa[pre + h.a0], end = oa[pre + h.a1];
    let text = theirs.slice(ob[pre + h.b0], ob[pre + h.b1]);
    const old = base.slice(start, end);
    let p = 0;
    while (p < old.length && p < text.length && old[p] === text[p]) p++;
    let s = 0;
    while (s < old.length - p && s < text.length - p && old[old.length - 1 - s] === text[text.length - 1 - s]) s++;
    start += p;
    end -= s;
    text = text.slice(p, text.length - s);
    removed += end - start;
    out.push({ start, end, text });
  }
  if (moved) {
    const m = movesIn(base, out, false).flatMap((v) => v.was);
    if (hunks.some((h, i) => !m.includes(out[i]) && /\0/.test(`${x.slice(pre + h.a0, pre + h.a1)}${y.slice(pre + h.b0, pre + h.b1)}`))) return changes(base, theirs, true) ?? out;
  }
  return removed > base.length / 2 && !moved ? null : out;
}

export function overlaps(a: Edit, b: Edit): boolean {
  if (a.start < b.end && b.start < a.end) return true;
  return (a.start === a.end || b.start === b.end) && a.start <= b.end && b.start <= a.end;
}

export function clash(a: Edit, b: Edit): boolean {
  if (a.start < b.end && b.start < a.end) return true;
  return (a.start === a.end && b.start < a.start && a.start < b.end) || (b.start === b.end && a.start < b.start && b.start < a.end);
}

export function apply(base: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let text = base;
  for (const e of sorted) text = text.slice(0, e.start) + e.text + text.slice(e.end);
  return text;
}

export function edits(base: string, theirs: string): Edit[] {
  const found = changes(base, theirs);
  if (found) return found;
  const n = Math.min(base.length, theirs.length);
  let s = 0;
  while (s < n && base[s] === theirs[s]) s++;
  let t = 0;
  while (t < n - s && base[base.length - 1 - t] === theirs[theirs.length - 1 - t]) t++;
  return [{ start: s, end: base.length - t, text: theirs.slice(s, theirs.length - t) }];
}

type Move = { cuts: Edit[]; put: Edit; was: Edit[] };

const WORDED = /(^|>)[^<]*[^\s<]/;
const flat = (s: string) => s.replace(/\s*\n\s*/g, '\n').trim();
const CJK = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}';
const WORD = new RegExp(`[${CJK}]|(?:(?![${CJK}])[\\p{L}\\p{N}])+`, 'gu');
const wordsOf = (s: string) => s.replace(/<[^<>]*>/g, ' ').match(WORD) ?? [];

function balanced(s: string): boolean {
  const closed = new Set([...s.matchAll(/<\/([\w-]+)/g)].map((m) => m[1].toLowerCase())), depth = new Map<string, number>();
  for (const m of s.matchAll(/<(\/?)([\w-]+)(?:[^<>"']|"[^"]*"|'[^']*')*?(\/?)>/g)) {
    const name = m[2].toLowerCase(), d = (depth.get(name) ?? 0) + (m[1] ? -1 : 1);
    if (!closed.has(name) || m[3]) continue;
    if (d < 0) return false;
    depth.set(name, d);
  }
  return [...depth.values()].every((d) => d === 0);
}

function turn(base: string, e: Edit): Edit {
  const cut = !e.text;
  const text = cut ? base.slice(e.start, e.end) : e.text;
  if ((base[e.start - 1] ?? '\n') !== '\n' || !text.endsWith('\n') || (cut && e.end === e.start) || (!cut && e.start !== e.end) || balanced(text)) return e;
  const lines = linesOf(text);
  for (const way of [-1, 1]) {
    let at = e.start, t = lines;
    for (let k = 0; k < lines.length; k++) {
      const end = cut ? at + t.join('').length : at;
      const line = way < 0 ? base.slice(base.lastIndexOf('\n', at - 2) + 1, at) : base.slice(end, base.indexOf('\n', end) + 1 || base.length);
      if (!line || line !== (way < 0 ? t[t.length - 1] : t[0])) break;
      t = way < 0 ? [line, ...t.slice(0, -1)] : [...t.slice(1), line];
      at += way * line.length;
      const out = cut ? { start: at, end: at + text.length, text: '' } : { start: at, end: at, text: t.join('') };
      if (balanced(t.join(''))) return out;
    }
  }
  return e;
}

function movesIn(base: string, list: Edit[], fuzzy = true): Move[] {
  const cut = new Map<string, Edit | null>(), put = new Map(cut), was = new Map<Edit, Edit>();
  for (const x of list) {
    const e = turn(base, x);
    if (e !== x && list.some((f) => f !== x && (e.text ? clash(e, f) || (f.start === f.end && f.start === e.start) : overlaps(e, f)))) continue;
    was.set(e, x);
    const w = !e.text && e.end > e.start && (base[e.start - 1] ?? '\n') + base[e.end - 1] === '\n\n', by = w ? cut : put;
    const t = flat(w ? base.slice(e.start, e.end) : e.start === e.end ? e.text : '');
    if (WORDED.test(t)) by.set(t, by.has(t) ? null : e);
  }
  const of = (cuts: Edit[], put: Edit): Move => ({ cuts, put, was: [...cuts, put].map((e) => was.get(e)!) });
  const out: Move[] = [], used = new Set<Edit>();
  for (const [t, f] of put) {
    let r = t + '\n';
    const g: Edit[] = [];
    for (const [k, e] of cut) if (e && r.startsWith(k + '\n')) r = r.slice(g.push(e) && k.length + 1);
    if (f && !r) {
      out.push(of(g, f));
      for (const e of [...g, f]) used.add(e);
    }
  }
  const cuts = [...cut.values()].filter((e): e is Edit => !!e && !used.has(e)).sort((a, b) => a.start - b.start);
  if (!fuzzy || cuts.length > 8) return out;
  for (const f of put.values()) {
    if (!f || used.has(f) || !cuts.length || !balanced(f.text)) continue;
    const words = wordsOf(f.text);
    let best: Edit[] = [], score = 0;
    for (let i = 0; i < cuts.length; i++) for (let j = i; j < cuts.length; j++) {
      if (cuts.slice(i, j + 1).some((e) => used.has(e))) break;
      if (!balanced(cuts.slice(i, j + 1).map((e) => base.slice(e.start, e.end)).join(''))) continue;
      const mine = cuts.slice(i, j + 1).flatMap((e) => wordsOf(base.slice(e.start, e.end)));
      const hunks = diff(mine, words, MAX_LINES) ?? [];
      const gone = hunks.reduce((n, h) => n + h.a1 - h.a0, 0), added = ` ${hunks.flatMap((h) => words.slice(h.b0, h.b1)).join(' ')} `;
      if (cuts.some((e, k) => (k < i || k > j) && wordsOf(base.slice(e.start, e.end)).length && added.includes(` ${wordsOf(base.slice(e.start, e.end)).join(' ')} `))) continue;
      if (mine.length - 2 * gone > score) [best, score] = [cuts.slice(i, j + 1), mine.length - 2 * gone];
    }
    if (!best.length) continue;
    out.push(of(best, f));
    best.forEach((e) => used.add(e));
  }
  return out;
}

export function moves(base: string, list: Edit[], others: Edit[], hit: (a: Edit, b: Edit) => boolean = () => true): Edit[] {
  return movesIn(base, list).flatMap(({ was }) => (others === list || was.some((x) => others.some((o) => hit(x, o))) ? was : []));
}

function through(m: Edit[], o: number, after: boolean): number | null {
  let d = 0;
  for (const e of m) {
    if (e.end < o || (e.end === o && (e.start < e.end || after))) d += e.text.length - (e.end - e.start);
    else if (e.start < o) return null;
  }
  return o + d;
}

function across(a: string, b: string, o: number, after: boolean): number | null {
  const m = charEdits(a, b, 500);
  if (m) return through(m, o, after);
  const la = linesOf(a), lb = linesOf(b), oa = offsets(la), ob = offsets(lb);
  const hunks = diff(la.map((l) => l.trim()), lb.map((l) => l.trim()), MAX_LINES);
  if (!hunks) return null;
  let i = 0;
  while (i < la.length - 1 && oa[i + 1] <= o) i++;
  let j = i;
  for (const h of hunks) {
    if (h.a1 <= i) j += h.b1 - h.b0 - (h.a1 - h.a0);
    else if (h.a0 <= i) {
      if (h.a1 - h.a0 !== h.b1 - h.b0) return null;
      j = h.b0 + i - h.a0;
      const col = through(charEdits(la[i], lb[j], 500) ?? [{ start: 0, end: la[i].length, text: lb[j] }], o - oa[i], after);
      return col === null ? null : ob[j] + col;
    }
  }
  if (j >= lb.length) return null;
  const col = o - oa[i], lead = la[i].length - la[i].trimStart().length, body = la[i].trim().length;
  const lead2 = lb[j].length - lb[j].trimStart().length;
  if (col === 0) return ob[j];
  if (col <= lead) return ob[j] + lead2;
  if (col >= lead + body) return ob[j + 1] - (la[i].length - col);
  return ob[j] + lead2 + col - lead;
}

export function carry(base: string, a: Edit[], b: Edit[]): [Edit[], Edit[]] {
  let rest = b;
  const now = new Map<Edit, Edit>();
  for (const { cuts, put, was } of movesIn(base, a)) {
    const src = cuts.map((c) => base.slice(c.start, c.end)).join('');
    const into: Edit[] = [], taken = new Set<Edit>();
    let at = 0;
    for (const c of cuts) {
      for (const x of rest) {
        if (x.start < c.start || x.end > c.end || !clash(x, c)) continue;
        const o = at + x.start - c.start, s = across(src, put.text, o, true), e = x.end > x.start ? across(src, put.text, o + x.end - x.start, false) : s;
        if (s === null || e === null || e < s || flat(put.text.slice(s, e)) !== flat(src.slice(o, o + x.end - x.start))) continue;
        into.push({ start: s, end: e, text: x.text });
        taken.add(x);
      }
      at += c.end - c.start;
    }
    const left = rest.filter((x) => !taken.has(x));
    if (left.some((x) => [...cuts, put].some((e) => clash(x, e) && !(e !== put && equal(x, e))))) continue;
    rest = left;
    [...cuts, into.length ? { ...put, text: apply(put.text, into) } : put].forEach((e, i) => now.set(was[i], e));
  }
  return [now.size ? a.map((e) => now.get(e) ?? e).sort((x, y) => x.start - y.start || x.end - y.end) : a, rest];
}

export function stay(base: string, list: Edit[], others: Edit[], hit: (a: Edit, b: Edit) => boolean = clash): [Edit[], boolean] {
  const gone = new Map<Edit, Edit[]>();
  for (const { cuts, put, was } of movesIn(base, list)) {
    if (!was.some((x) => others.some((o) => hit(x, o)))) continue;
    const src = cuts.map((c) => base.slice(c.start, c.end)).join('');
    let at = 0, from = 0;
    const kept = cuts.flatMap((c, i) => {
      at += c.end - c.start;
      const to = i === cuts.length - 1 ? put.text.length : Math.max(from, across(src, put.text, at, false) ?? across(src, put.text, at, true) ?? from);
      const old = base.slice(c.start, c.end), now = put.text.slice(from, to);
      from = to;
      return (charEdits(old, now, 500) ?? [{ start: 0, end: old.length, text: now }]).map((e) => ({ start: c.start + e.start, end: c.start + e.end, text: e.text }));
    });
    was.forEach((e, i) => gone.set(e, i ? [] : kept));
  }
  return [list.flatMap((e) => gone.get(e) ?? [e]).sort((x, y) => x.start - y.start || x.end - y.end), gone.size > 0];
}

const equal = (a: Edit, b: Edit) => a.start === b.start && a.end === b.end && a.text === b.text;

function tagged(s: string): [string, string, string] {
  const open = /^(?:<[A-Za-z](?:[^<>"']|"[^"]*"|'[^']*')*>)*/.exec(s)![0];
  const rest = s.slice(open.length);
  const close = /(?:<\/[^<>]+>)*$/.exec(rest)![0];
  return [open, rest.slice(0, rest.length - close.length), close];
}

type Form = { pre: string; open: string; inner: string; close: string; post: string; lo: number; hi: number };

function around(base: string, e: Edit): Form | null {
  const run = base.slice(e.start, e.end);
  const tags = e.text.includes('<');
  const pre = tags ? e.text.slice(0, e.text.indexOf('<')) : '';
  const post = tags ? e.text.slice(e.text.lastIndexOf('>') + 1) : '';
  const [open, inner, close] = tagged(e.text.slice(pre.length, e.text.length - post.length));
  const [was, old, shut] = tagged(run);
  if ((open === was && close === shut) || (inner !== old && (inner + old).includes('<'))) return null;
  return { pre, open, inner, close, post, lo: e.start + was.length, hi: e.end - shut.length };
}

function absorb(base: string, a: Edit[], b: Edit[], first: boolean): [Edit[], Edit[]] {
  let rest = b;
  const out = a.map((w) => {
    const f = around(base, w);
    const hits = f ? rest.filter((e) => clash(w, e)) : [];
    if (!f || !hits.length || !hits.every((e) => f.lo <= e.start && e.end <= f.hi && !(e.text + base.slice(e.start, e.end)).includes('<'))) return w;
    const old = base.slice(f.lo, f.hi);
    const own = fine(old, f.inner);
    const others = hits.map((e) => ({ start: e.start - f.lo, end: e.end - f.lo, text: e.text }));
    const run = first ? mergeEdits(old, others, own, 'ours', true) : mergeEdits(old, own, others, 'ours', true);
    if (!run.text || run.conflicts.length) return w;
    rest = rest.filter((e) => !hits.includes(e));
    return { start: w.start, end: w.end, text: f.pre + f.open + run.text + f.close + f.post };
  });
  return [out, rest];
}

export function nest(base: string, a: Edit[], b: Edit[], first = false): [Edit[], Edit[]] {
  const [x, y] = absorb(base, a, b, first);
  const [v, u] = absorb(base, y, x, !first);
  return [u, v];
}

export function merge(base: string, ours: Edit[], theirs: string, prefer: 'ours' | 'theirs'): Merge | null {
  const all = changes(base, theirs);
  return all && mergeEdits(base, ours, all, prefer);
}

function slid(base: string, d: Edit, own: Edit[], others: Edit[]): Edit {
  const at = d.text ? undefined : others.find((e) => e.start === e.end && d.start < e.start && e.start < d.end)?.start;
  if (at === undefined) return d;
  const fits = (m: Edit) => {
    const [w] = widen(base, [m]);
    return w.start === m.start && w.end === m.end && ![...own, ...others].some((o) => o !== d && clash(o, m));
  };
  let left = true, right = true;
  for (let i = 1; left && i <= d.end - at; i++) left = base[d.start - i] === base[d.end - i];
  const l = { start: d.start - (d.end - at), end: at, text: '' };
  if (left && fits(l)) return l;
  for (let i = 0; right && i < at - d.start; i++) right = base[d.start + i] === base[d.end + i];
  const r = { start: at, end: d.end + (at - d.start), text: '' };
  return right && fits(r) ? r : d;
}

export function mergeEdits(base: string, ours: Edit[], all: Edit[], prefer: 'ours' | 'theirs', apart = false, twice = false): Merge {
  if (apart) {
    [all, ours] = carry(base, all, ours);
    [ours, all] = carry(base, ours, all);
    [ours, all] = nest(base, ours, all);
    const others = all.filter((h) => !ours.some((o) => equal(o, h)));
    const [mine, a] = stay(base, ours, others), [theirs, b] = stay(base, others, ours);
    if (a || b) return mergeEdits(base, mine, [...theirs, ...all.filter((h) => !others.includes(h))].sort((x, y) => x.start - y.start || x.end - y.end), prefer, apart, twice);
    ours = ours.map((d) => slid(base, d, ours, all));
    all = all.map((d) => slid(base, d, all, ours));
  }
  const hit = apart ? clash : overlaps;
  const both = ours.filter((o) => all.some((h) => equal(o, h)));
  const keys = twice && both.length === 1 && both[0].start === both[0].end;
  const same = (a: Edit, b: Edit) => !keys && equal(a, b);
  const others = all.filter((h) => !ours.some((o) => same(o, h)));
  const conflicts = ours.filter((o) => others.some((h) => hit(o, h)));
  const keptTheirs = prefer === 'theirs' ? all : all.filter((h) => !conflicts.some((o) => hit(o, h)));
  const keptOurs = (prefer === 'ours' ? ours : ours.filter((o) => !conflicts.includes(o))).filter((o) => !keptTheirs.some((h) => same(o, h)));
  return { text: apply(base, [...keptOurs, ...keptTheirs]), conflicts };
}

export function charEdits(a: string, b: string, max: number): Edit[] | null {
  const [head, tail] = shared(a, b);
  const x = a.slice(head, a.length - tail), y = b.slice(head, b.length - tail);
  if (!x || !y) return x === y ? [] : [{ start: head, end: a.length - tail, text: y }];
  const hunks = diff(x, y, max);
  return hunks && hunks.map((h) => ({ start: head + h.a0, end: head + h.a1, text: y.slice(h.b0, h.b1) }));
}

const CELLS = 1 << 20;

function find(t: string, p: string): number {
  const back = new Int32Array(p.length + 1);
  back[0] = -1;
  for (let i = 0, k = -1; i < p.length; back[++i] = ++k) while (k >= 0 && p.charCodeAt(k) !== p.charCodeAt(i)) k = back[k];
  let i = 0;
  for (let k = 0; k < p.length; i++, k++) {
    if (i === t.length) return -1;
    while (k >= 0 && p.charCodeAt(k) !== t.charCodeAt(i)) k = back[k];
  }
  return i - p.length;
}

function anchored(a: string, b: string): Edit[] | null {
  const [head, tail] = shared(a, b);
  const whole: [number, string, string] = [head, a.slice(head, a.length - tail), b.slice(head, b.length - tail)];
  const parts = [whole], out: Edit[] = [];
  let cells = CELLS;
  for (let part = parts.pop(); part; part = parts.pop()) {
    const [at, x, y] = part;
    const tried = part !== whole && Math.abs(x.length - y.length) <= 500;
    const found = tried ? charEdits(x, y, 500) : null;
    if (found) {
      out.push(...found.map((e) => ({ start: e.start + at, end: e.end + at, text: e.text })));
      continue;
    }
    if (tried) cells -= 500 * (x.length + y.length);
    let best = 0, bx = 0, by = 0;
    const k = find(y, x), j = k < 0 ? find(x, y) : -1;
    if (k >= 0) [best, bx, by] = [x.length, 0, k];
    else if (j >= 0) [best, bx, by] = [y.length, j, 0];
    else if (x.length * y.length <= cells) {
      cells -= x.length * y.length;
      let prev = new Uint32Array(y.length + 1), row = new Uint32Array(y.length + 1);
      for (let i = 1; i <= x.length; i++) {
        for (let j = 1; j <= y.length; j++) {
          const v = x.charCodeAt(i - 1) === y.charCodeAt(j - 1) ? prev[j - 1] + 1 : 0;
          row[j] = v;
          if (v > best) [best, bx, by] = [v, i - v, j - v];
        }
        [prev, row] = [row, prev];
      }
    }
    if (best) parts.push([at + bx + best, x.slice(bx + best), y.slice(by + best)], [at, x.slice(0, bx), y.slice(0, by)]);
    else if (part === whole) return null;
    else out.push({ start: at, end: at + x.length, text: y });
  }
  return out;
}

const WORDS = /\w+|\s+|[^\w\s]+/g;

function wordEdits(a: string, b: string, max: number): Edit[] | null {
  const [head, tail] = shared(a, b);
  const x = a.slice(head, a.length - tail), y = b.slice(head, b.length - tail);
  const xs = x.match(WORDS) ?? [], ys = y.match(WORDS) ?? [];
  const hunks = diff(xs, ys, max);
  if (!hunks) return null;
  const ox = offsets(xs), oy = offsets(ys);
  return hunks.map((h) => {
    const old = x.slice(ox[h.a0], ox[h.a1]), text = y.slice(oy[h.b0], oy[h.b1]);
    const [p, s] = shared(old, text);
    return { start: head + ox[h.a0] + p, end: head + ox[h.a1] - s, text: text.slice(p, text.length - s) };
  });
}

export function fine(a: string, b: string): Edit[] {
  const chars = charEdits(a, b, 500);
  let found = chars ?? anchored(a, b) ?? wordEdits(a, b, 250) ?? edits(a, b);
  if (chars?.some((e) => e.end > e.start) && (chars[1] || /\n/.test(chars[0].text + a.slice(chars[0].start, chars[0].end)))) {
    const lines = changes(a, b) ?? [];
    const moved = moves(a, lines, lines);
    if (moved[0]) {
      const rest = charEdits(a, apply(a, lines.filter((e) => !moved.includes(e))), 500);
      const apart = rest?.every((x) => moved.every((e) => x.end < e.start || x.start > e.end));
      const out = apart ? [...moved, ...rest!].sort((x, y) => x.start - y.start || x.end - y.end) : lines.flatMap((e) => (moved.includes(e) ? [e] : charEdits(a.slice(e.start, e.end), e.text, 500)?.map((x) => ({ ...x, start: x.start + e.start, end: x.end + e.start })) ?? [e]));
      const read = moves(a, out, lines);
      if (moved.every((e) => read.includes(e))) found = out;
    }
  }
  if (!found.length) return found;
  let d = 0;
  const back = widen(b, found.map((e) => {
    const start = e.start + d;
    d += e.text.length - (e.end - e.start);
    return { start, end: start + e.text.length, text: a.slice(e.start, e.end) };
  }));
  d = 0;
  const out = widen(a, wraps(b, back.map((p) => {
    const start = p.start - d;
    d += p.end - p.start - p.text.length;
    return { start, end: start + p.text.length, text: b.slice(p.start, p.end) };
  })));
  return widen(a, out.map((e) => {
    const [s, t] = shared(a.slice(e.start, e.end), e.text);
    return { start: e.start + s, end: e.end - t, text: e.text.slice(s, e.text.length - t) };
  }));
}

function wraps(b: string, es: Edit[]): Edit[] {
  const at: number[] = [];
  let d = 0;
  for (const e of es) {
    at.push(e.start + d);
    d += e.text.length - (e.end - e.start);
  }
  const last = at[at.length - 1] + es[es.length - 1].text.length;
  const out: Edit[] = [];
  for (let i = 0; i < es.length; i++) {
    let k = i;
    for (const m of es[i].text.matchAll(/<([A-Za-z][\w:-]*)(?:\s[^<>]*)?>/g)) {
      const tag = new RegExp(`<(/?)${m[1]}(?=[\\s/>])[^<>]*>`, 'gi');
      tag.lastIndex = at[i] + m.index + m[0].length;
      let depth = 1, end: RegExpExecArray | null = null;
      for (let t = tag.exec(b); t && t.index < last; t = tag.exec(b)) if ((depth += t[1] ? -1 : 1) === 0) {
        end = t;
        break;
      }
      if (!end) continue;
      for (let j = i + 1; j < es.length; j++) if (at[j] <= end.index && end.index + end[0].length <= at[j] + es[j].text.length) k = Math.max(k, j);
    }
    out.push(k === i ? es[i] : { start: es[i].start, end: es[k].end, text: b.slice(at[i], at[k] + es[k].text.length) });
    i = k;
  }
  return out;
}

const OTHERS = 500;

const real = (text: string, at: number): number => {
  let i = 0;
  for (let c = 0; c < at; c++) i += text.startsWith('&nbsp;', i) ? 6 : 1;
  return i;
};

export function revert(base: string, target: string, now: string): string | null {
  if (now === base) return target;
  const b = base.replaceAll('&nbsp;', ' '), t = target.replaceAll('&nbsp;', ' '), n = now.replaceAll('&nbsp;', ' ');
  if (b === t) return now;
  const rev = (s: string) => s.split('').reverse().join('');
  const ahead = charEdits(b, n, OTHERS), back = charEdits(rev(b), rev(n), OTHERS);
  if (!ahead || !back) return null;
  const one = over(ahead, target, now, b, t, n);
  const two = one === null ? null : over(back.reverse().map((e) => ({ start: b.length - e.end, end: b.length - e.start, text: rev(e.text) })), target, now, b, t, n, false);
  return two !== null && one!.replaceAll('&nbsp;', ' ') === two.replaceAll('&nbsp;', ' ') ? one : null;
}

function over(others: Edit[], target: string, now: string, b: string, t: string, n: string, slid = true): string | null {
  const [head, tail] = shared(b, t);
  let all = tail;
  while (all < b.length && all < t.length && b[b.length - 1 - all] === t[t.length - 1 - all]) all++;
  if (slid && slides(others, b, head - Math.min(head, all - tail), b.length - tail)) return null;
  let got: string | null = null;
  for (let k = 0; k <= Math.min(head, all - tail); k++) {
    const s = head - k, e = b.length - tail - k;
    const p = place(others, b, n, s, e);
    if (p < 0) return null;
    const span = b.slice(s, e), rest = n.slice(0, p) + n.slice(p + span.length);
    for (const o of others) {
      if (o.start !== o.end || (o.start !== s && o.start !== e)) continue;
      for (let j = 1; j <= o.text.length; j++) {
        const q = o.start === s ? p - j : p + j;
        if (n.slice(q, q + span.length) === span && n.slice(0, q) + n.slice(q + span.length) !== rest) return null;
      }
    }
    const out = now.slice(0, real(now, p)) + target.slice(real(target, s), real(target, t.length - tail - k)) + now.slice(real(now, p + span.length));
    if (got === null) got = out;
    else if (out.replaceAll('&nbsp;', ' ') !== got.replaceAll('&nbsp;', ' ')) return null;
  }
  return got;
}

function slides(others: Edit[], b: string, lo: number, hi: number): boolean {
  return others.some((o) => {
    if (o.start !== hi && o.end !== lo) return false;
    let l = o.start, r = o.end;
    if (o.start === o.end) {
      for (let x = o.text; l > 0 && b[l - 1] === x.at(-1); l--) x = b[l - 1] + x.slice(0, -1);
      for (let x = o.text; r < b.length && b[r] === x[0]; r++) x = x.slice(1) + b[r];
    } else {
      while (l > 0 && b[l - 1] === b[o.end - 1 - (o.start - l)]) l--;
      while (r < b.length && b[r] === b[o.start + (r - o.end)]) r++;
    }
    return o.start === hi ? l < hi : r > lo;
  });
}

function place(others: Edit[], b: string, n: string, s: number, e: number): number {
  let d = 0;
  const inside: number[] = [];
  for (const o of others) {
    if (o.end <= s) d += o.text.length - (o.end - o.start);
    else if (o.start >= e) break;
    else if (o.start === o.end) inside.push(o.text.length);
    else return -1;
  }
  for (let m = inside.length; m >= 0; m--) {
    const p = s + d + inside.slice(0, m).reduce((x, y) => x + y, 0);
    if (n.slice(p, p + e - s) === b.slice(s, e)) return p;
  }
  return -1;
}
