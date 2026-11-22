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

export function myers(a: ArrayLike<string>, b: ArrayLike<string>, max: number): Hunk[] | null {
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

function joined(a: ArrayLike<string>, b: ArrayLike<string>, hunks: Hunk[]): Hunk[] {
  const out: Hunk[] = [];
  for (const h of hunks) {
    const last = out[out.length - 1], k = last ? h.a0 - last.a1 : 0;
    const cut = h.b0 === h.b1, put = h.a0 === h.a1;
    let slides = k > 0 && (cut || put) && h.b0 - last.b1 === k && ((cut ? last.b0 === last.b1 : last.a0 === last.a1) || last.a1 - last.a0 + h.a1 - h.a0 === last.b1 - last.b0 + h.b1 - h.b0);
    for (let i = 1; slides && i <= k; i++) slides = cut ? a[h.a0 - i] === a[h.a1 - i] : b[h.b0 - i] === b[h.b1 - i];
    if (slides) out[out.length - 1] = { a0: last.a0, a1: h.a1 - k, b0: last.b0, b1: h.b1 - k };
    else out.push({ ...h });
  }
  return out;
}

const skeleton = (line: string) => line.replace(/<(\/?[\w-]+)[^<>]*>|[^<>]+/g, (_, t) => (t ? `<${t}>` : ''));

function split(a: string[], b: string[], pre: number, h: Hunk): Hunk[] {
  const n = h.a1 - h.a0, m = h.b1 - h.b0, u = a.slice(pre + h.a0, pre + h.a1), v = b.slice(pre + h.b0, pre + h.b1);
  const p = u.join(''), q = v.join(''), [x, y] = shared(p, q), mid = [p.slice(x, p.length - y), q.slice(x, q.length - y)];
  if (!n || !m || n + m > 64 || !mid[0] || !mid[1]) return [h];
  const cost: number[][] = [], way: number[][] = [];
  for (let i = n; i >= 0; i--) {
    [cost[i], way[i]] = [[], []];
    for (let j = m; j >= 0; j--) {
      const both = i < n && j < m, [c, e] = both ? shared(u[i], v[j]) : [0, 0];
      const apart = !both || /\0/.test(u[i] + v[j]) ? Infinity : skeleton(u[i]) !== skeleton(v[j]) ? 1 : -2 * (c + e);
      const all = i < n || j < m ? [both ? u[i].length + v[j].length + apart + cost[i + 1][j + 1] : Infinity, i < n ? u[i].length + cost[i + 1][j] : Infinity, j < m ? v[j].length + cost[i][j + 1] : Infinity] : [0];
      cost[i][j] = Math.min(...all);
      way[i][j] = all.indexOf(cost[i][j]);
    }
  }
  if (cost[0][0] === Infinity || (!mid.some((t) => /<[^<>]*>/.test(t)) && cost[0][0] > mid[0].length + mid[1].length)) return [h];
  const out: Hunk[] = [];
  for (let i = 0, j = 0; i < n || j < m; ) {
    const k = way[i][j], a0 = i, b0 = j;
    if (k === 0 && u[i++] !== v[j++]) out.push({ a0: h.a0 + a0, a1: h.a0 + i, b0: h.b0 + b0, b1: h.b0 + j });
    if (k === 0) continue;
    while ((i < n || j < m) && way[i][j] === k) k === 1 ? i++ : j++;
    if (!/<\/?[\w-]/.test(k === 1 ? u.slice(a0, i).join('') : v.slice(b0, j).join(''))) return [h];
    out.push({ a0: h.a0 + a0, a1: h.a0 + i, b0: h.b0 + b0, b1: h.b0 + j });
  }
  return out;
}

const SECTION = /^[ \t]*<\/?section[\s>]/m;

function slidesOf(lines: string[]): [number, number, string][] {
  const out: [number, number, string][] = [], open: number[] = [];
  lines.forEach((line, i) => {
    const t = line.trimStart();
    if (/^<section[\s>]/.test(t) && !t.includes('</section')) open.push(i);
    const from = t.startsWith('</section') ? open.pop() ?? -1 : -1;
    if (from >= 0) out.push([from, i + 1 - from, lines.slice(from, i + 1).join('')]);
  });
  return out;
}

function markMoved(a: string[], b: string[]): [string[], string[]] | null {
  type S = [number, number, string];
  const [inA, inB] = [a, b].map(slidesOf);
  const [countA, countB] = [inA, inB].map((l) => l.reduce((m, s) => m.set(s[2], (m.get(s[2]) ?? 0) + 1), new Map<string, number>()));
  const fromB = new Map(inB.map((s) => [s[2], s[0]]));
  const exact = inA.filter(([, , t]) => countA.get(t) === 1 && countB.get(t) === 1).map(([from, n, t]) => [from, fromB.get(t)!, n]);
  const covered = [a, b].map((l, k) => {
    const out = new Uint8Array(l.length);
    for (const p of exact) out.fill(1, p[k], p[k] + p[2]);
    return out;
  });
  const [restA, restB] = [inA, inB].map((l, k) => l.filter(([from]) => !covered[k][from]));
  type Shape = { lines: string[]; skeleton: string; words: Set<string>[]; worded: string[] };
  const shapes = new Map<S, Shape>();
  const shape = (s: S) => {
    let out = shapes.get(s);
    if (!out) {
      const lines = linesOf(s[2]).map((l) => l.trim());
      out = { lines, skeleton: lines.map(skeleton).join('\n'), words: lines.map((l) => new Set(wordsOf(l))), worded: lines.map((l, i) => `${i}\n${l}`).filter((_, i) => WORDED.test(lines[i])) };
      shapes.set(s, out);
    }
    return out;
  };
  const like = (s: S, t: S) => {
    const [u, v] = [shape(s), shape(t)];
    return u.skeleton === v.skeleton && u.lines.every((l, i) => l === v.lines[i] || wordsOf(l).some((w) => v.words[i].has(w))) && 2 * u.lines.filter((l, i) => l === v.lines[i] && WORDED.test(l)).length > u.worded.length;
  };
  const byLine = (l: S[]) => {
    const out = new Map<string, S[]>();
    for (const s of l) for (const key of shape(s).worded) out.set(key, [...(out.get(key) ?? []), s]);
    return out;
  };
  const [lineA, lineB] = [restA, restB].map(byLine);
  const near = (keys: string[], index: Map<string, S[]>) => [...new Set(keys.flatMap((key) => index.get(key) ?? []))];
  const fewest = (keys: string[], index: Map<string, S[]>) => keys.map((key) => [key, index.get(key)?.length ?? 0] as const).sort((x, y) => x[1] - y[1]).slice(0, Math.ceil(keys.length / 2)).map(([key]) => key);
  const loose = restA.flatMap((s) => {
    const t = near(fewest(shape(s).worded, lineB), lineB).filter((x) => like(s, x));
    return t.length === 1 && near(shape(t[0]).worded, lineA).filter((x) => like(x, t[0])).length === 1 ? [[s[0], t[0][0], s[1]]] : [];
  });
  let end = 0;
  const pairs = [...exact, ...loose].sort((p, q) => p[0] - q[0]).filter(([from, , n]) => from >= end && (end = from + n));
  const far = (p: number[]) => Math.abs(p[0] - p[1]), best = pairs.map((p) => p[2]), off = pairs.map(far), prev = pairs.map(() => -1);
  const over = (w: number, d: number, i: number) => w > best[i] || (w === best[i] && d < off[i]);
  pairs.forEach((p, i) => pairs.forEach((q, j) => {
    if (j < i && q[1] < p[1] && over(best[j] + p[2], off[j] + far(p), i)) [best[i], off[i], prev[i]] = [best[j] + p[2], off[j] + far(p), j];
  }));
  const kept = new Set<number>();
  for (let i = best.reduce((t, w, k) => (over(w, off[k], t) ? k : t), pairs.length ? 0 : -1); i >= 0; i = prev[i]) kept.add(i);
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
  const found = myers(x.slice(pre, x.length - suf), y.slice(pre, y.length - suf), MAX_LINES), marks = (h: Hunk) => [x.slice(pre + h.a0, pre + h.a1).join(''), y.slice(pre + h.b0, pre + h.b1).join('')];
  if (!found) return null;
  const hunks = joined(x.slice(pre, x.length - suf), y.slice(pre, y.length - suf), found).flatMap((h) => split(x, y, pre, h)).flatMap((h) => {
    const [u, v] = marks(h);
    return u && v && (!u.trim() || (moved && /\0/.test(u + v))) ? [{ ...h, b1: h.b0 }, { ...h, a0: h.a1 }] : [h];
  });
  const oa = offsets(a), ob = offsets(b);
  const out: Edit[] = [];
  for (const h of hunks) {
    let start = oa[pre + h.a0], end = oa[pre + h.a1];
    let text = theirs.slice(ob[pre + h.b0], ob[pre + h.b1]);
    const [p, s] = shared(base.slice(start, end), text);
    start += p;
    end -= s;
    text = text.slice(p, text.length - s);
    out.push({ start, end, text });
  }
  if (moved) {
    const m = movesIn(base, out, false).flatMap((v) => v.was);
    if (hunks.some((h, i) => !m.includes(out[i]) && /\0/.test(marks(h).join('')) && !/^(\0[ab])*$/.test(marks(h).join('')))) return changes(base, theirs, true) ?? out;
  }
  const back = new Map<string, number>();
  for (const e of out) for (const l of linesOf(e.text)) back.set(l.trim(), (back.get(l.trim()) ?? 0) + 1);
  const [removed, lines] = out.flatMap((e) => linesOf(base.slice(e.start, e.end))).reduce(([n, m], l) => {
    const k = back.get(l.trim()) ?? 0;
    back.set(l.trim(), k - 1);
    return k > 0 ? [n, m] : [n + l.length, m + 1];
  }, [0, 0]);
  return removed > base.length / 2 && 2 * lines > a.length && !moved ? null : parted(base, balancedIn(base, out));
}

function parted(base: string, list: Edit[]): Edit[] {
  const puts = list.filter((f) => f.start === f.end && f.text.endsWith('\n') && (base[f.start - 1] ?? '\n') === '\n').map((f) => linesOf(f.text).map((l) => l.trim()));
  return list.flatMap((e) => {
    if (e.text || (base[e.start - 1] ?? '\n') !== '\n' || base[e.end - 1] !== '\n') return [e];
    const lines = linesOf(base.slice(e.start, e.end)), flat = lines.map((l) => l.trim());
    for (const t of puts) {
      if (t.length > lines.length || !WORDED.test(t.join('\n'))) continue;
      const same = (k: number) => t.filter((l, i) => flat[(i + k) % flat.length] === l).length;
      const turned = t.length === lines.length ? flat.reduce((best, _, k) => (k > 0 && 2 * same(k) > t.length && same(k) > same(best) ? k : best), 0) : -1;
      const at = turned > 0 ? turned : t.length < lines.length ? flat.findIndex((_, i) => t.every((l, k) => flat[i + k] === l)) : -1;
      if (at < 0) continue;
      const cuts = (turned > 0 ? [0, at, lines.length] : [0, at, at + t.length, lines.length]).map((i) => e.start + lines.slice(0, i).join('').length);
      return cuts.slice(1).flatMap((c, i) => (c > cuts[i] ? [{ start: cuts[i], end: c, text: '' }] : []));
    }
    return [e];
  });
}

function balancedIn(base: string, list: Edit[]): Edit[] {
  const out: Edit[] = [];
  list.forEach((e, i) => {
    const t = turn(base, e), last = out[out.length - 1], next = list[i + 1];
    const fits = t === e || ((!last || last.end < t.start || (last.end === t.start && t.start < t.end)) && (!next || t.end < next.start || (t.end === next.start && next.start < next.end)));
    out.push(fits ? t : e);
  });
  return out;
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
  const [s, t] = shared(base, theirs);
  return [{ start: s, end: base.length - t, text: theirs.slice(s, theirs.length - t) }];
}

type Move = { cuts: Edit[]; put: Edit; was: Edit[] };

const WORDED = /(^|>)[^<]*[^\s<]/;
const flat = (s: string) => s.replace(/\s*\n\s*/g, '\n').trim();
const CJK = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}';
const WORD = new RegExp(`[${CJK}]|(?:(?![${CJK}])[\\p{L}\\p{N}])+`, 'gu');
const wordsOf = (s: string) => s.replace(/<[^<>]*>/g, ' ').match(WORD) ?? [];

export function balanced(s: string): boolean {
  const closed = new Set([...s.matchAll(/<\/([\w-]+)/g)].map((m) => m[1].toLowerCase())), open: string[] = [];
  for (const m of s.matchAll(/<(\/?)([\w-]+)(?:[^<>"']|"[^"]*"|'[^']*')*?(\/?)>/g)) {
    const name = m[2].toLowerCase();
    if (!closed.has(name) || m[3]) continue;
    if (!m[1]) open.push(name);
    else if (open.pop() !== name) return false;
  }
  return !open.length;
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

const found = new WeakMap<Edit[], Move[]>();

function movesIn(base: string, list: Edit[], fuzzy = true): Move[] {
  const known = found.get(list);
  if (known) return known;
  const cut = new Map<string, Edit | null>(), put = new Map(cut), was = new Map<Edit, Edit>();
  for (const x of list) {
    const e = turn(base, x);
    if (e !== x && list.some((f) => f !== x && (e.text ? clash(e, f) || (f.start === f.end && f.start === e.start) : overlaps(e, f)))) continue;
    was.set(e, x);
    const w = !e.text && e.end > e.start && (base[e.start - 1] ?? '\n') + base[e.end - 1] === '\n\n', by = w ? cut : put;
    const t = flat(w ? base.slice(e.start, e.end) : e.start === e.end ? e.text : '');
    if (WORDED.test(t) || (t.includes('\n') && balanced(t))) by.set(t, by.has(t) ? (by === put ? by.get(t)! : null) : e);
  }
  const of = (cuts: Edit[], put: Edit): Move => ({ cuts, put, was: [...cuts, put].map((e) => was.get(e)!) });
  const out: Move[] = [], used = new Set<Edit>();
  for (const [t, f] of put) {
    let r = t + '\n';
    const g: Edit[] = [];
    for (let more = true; more && r; ) {
      more = false;
      for (const [k, e] of cut) if (e && !used.has(e) && !g.includes(e) && r.startsWith(k + '\n')) [r, more] = [r.slice(g.push(e) && k.length + 1), true];
    }
    if (f && !r) {
      out.push(of(g, f));
      for (const e of [...g, f]) used.add(e);
    }
  }
  const cuts = [...cut.values()].filter((e): e is Edit => !!e && !used.has(e)).sort((a, b) => a.start - b.start);
  if (!fuzzy || cuts.length > 8) return out;
  for (const f of put.values()) {
    if (!f || used.has(f) || !cuts.length || !balanced(f.text)) continue;
    const words = wordsOf(f.text), theirs = linesOf(f.text).map((l) => [skeleton(l), new Set(wordsOf(l))] as const);
    let best: Edit[] = [], score = 0;
    const runs = cuts.flatMap((_, i) => cuts.slice(i).flatMap((__, k) => {
      const run = cuts.slice(i, i + k + 1);
      return k === 1 && run[0].end === run[1].start ? [run, [run[1], run[0]]] : [run];
    }));
    for (const run of runs) {
      if (run.some((e) => used.has(e))) continue;
      if (!balanced(run.map((e) => base.slice(e.start, e.end)).join(''))) continue;
      if (run.some((e) => {
        const mine = linesOf(base.slice(e.start, e.end)).filter((l) => WORDED.test(l));
        return 2 * mine.filter((l) => theirs.some(([k, w]) => k === skeleton(l) && wordsOf(l).some((x) => w.has(x)))).length < mine.length;
      })) continue;
      const mine = run.flatMap((e) => wordsOf(base.slice(e.start, e.end)));
      const hunks = myers(mine, words, MAX_LINES) ?? [];
      const gone = hunks.reduce((n, h) => n + h.a1 - h.a0, 0), added = ` ${hunks.flatMap((h) => words.slice(h.b0, h.b1)).join(' ')} `;
      let a = 0;
      if (run.some((e) => {
        const n = wordsOf(base.slice(e.start, e.end)).length, lost = hunks.reduce((g, h) => g + Math.max(0, Math.min(h.a1, a + n) - Math.max(h.a0, a)), 0);
        a += n;
        return n && 2 * lost >= n;
      })) continue;
      if (cuts.some((e) => !run.includes(e) && wordsOf(base.slice(e.start, e.end)).length && added.includes(` ${wordsOf(base.slice(e.start, e.end)).join(' ')} `))) continue;
      if (mine.length - 2 * gone > score) [best, score] = [run, mine.length - 2 * gone];
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
  const m = charEdits(a, b, 500), r = m && through(m, o, after), head = (t: string, i: number) => t.slice(t.lastIndexOf('\n', i - 1) + 1, i);
  if (m && (r === null || (!head(a, o) === !head(b, r) && head(a, o).trim() === head(b, r).trim()))) return r;
  const la = linesOf(a), lb = linesOf(b), oa = offsets(la), ob = offsets(lb);
  const hunks = myers(la.map((l) => l.trim()), lb.map((l) => l.trim()), MAX_LINES);
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

const equal = (a: Edit, b: Edit) => a.start === b.start && a.end === b.end && a.text === b.text;

export function carry(base: string, a: Edit[], b: Edit[]): [Edit[], Edit[]] {
  let rest = b;
  const now = new Map<Edit, Edit>(), kept: Move[] = [];
  for (const m of movesIn(base, a)) {
    const { cuts, put, was } = m;
    kept.push(m);
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
    const all = [...cuts, into.length ? { ...put, text: apply(put.text, into) } : put];
    all.forEach((e, i) => now.set(was[i], e));
    kept[kept.length - 1] = { cuts, put: all[all.length - 1], was: all };
  }
  const out = now.size ? a.map((e) => now.get(e) ?? e).sort((x, y) => x.start - y.start || x.end - y.end) : a;
  found.set(out, kept);
  const theirs = found.get(b);
  if (theirs && rest !== b) found.set(rest, theirs.filter((m) => m.was.every((e) => rest.includes(e))));
  return [out, rest];
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
      return (changes(old, now) ?? charEdits(old, now, 500) ?? [{ start: 0, end: old.length, text: now }]).map((e) => ({ start: c.start + e.start, end: c.start + e.end, text: e.text }));
    });
    was.forEach((e, i) => gone.set(e, i ? [] : kept));
  }
  return [list.flatMap((e) => gone.get(e) ?? [e]).sort((x, y) => x.start - y.start || x.end - y.end), gone.size > 0];
}

export function merge(base: string, ours: Edit[], theirs: string, prefer: 'ours' | 'theirs'): Merge | null {
  const all = changes(base, theirs);
  return all && mergeEdits(base, ours, all, prefer);
}

export function mergeEdits(base: string, ours: Edit[], all: Edit[], prefer: 'ours' | 'theirs'): Merge {
  const others = all.filter((h) => !ours.some((o) => equal(o, h)));
  const conflicts = ours.filter((o) => others.some((h) => overlaps(o, h)));
  const keptTheirs = prefer === 'theirs' ? others : others.filter((h) => !conflicts.some((o) => overlaps(o, h)));
  const keptOurs = prefer === 'ours' ? ours : ours.filter((o) => !conflicts.includes(o));
  return { text: apply(base, [...keptOurs, ...keptTheirs]), conflicts };
}

export function charEdits(a: string, b: string, max: number): Edit[] | null {
  const [head, tail] = shared(a, b);
  const x = a.slice(head, a.length - tail), y = b.slice(head, b.length - tail);
  if (!x || !y) return x === y ? [] : [{ start: head, end: a.length - tail, text: y }];
  const hunks = myers(x, y, max);
  return hunks && hunks.map((h) => ({ start: head + h.a0, end: head + h.a1, text: y.slice(h.b0, h.b1) }));
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
