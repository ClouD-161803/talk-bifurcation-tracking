export type Point = { x: number; y: number };
export type Ends = { x1: number; y1: number; x2: number; y2: number };
export type Kind = 'straight' | 'curve' | 'elbow';
export type Stroke = Ends & { kind: Kind; c?: Point; h?: boolean; m?: number };
export type Box = { left: number; top: number; width: number; height: number };
type Child = { localName: string; getAttribute(name: string): string | null };

const NUM = '(-?\\d+(?:\\.\\d+)?)';
const S = '[\\s,]*';
const CURVE = new RegExp(`^M${S}${NUM}${S}${NUM}${S}Q${S}${NUM}${S}${NUM}${S}${NUM}${S}${NUM}$`);
const ELBOW = new RegExp(`^M${S}${NUM}${S}${NUM}${S}([HV])${S}${NUM}${S}([HV])${S}${NUM}(?:${S}([HV])${S}${NUM})?$`);
const SAMPLES = 24;

export function parseStroke(child: Child | null, at: Point = { x: 0, y: 0 }): Stroke | null {
  if (!child) return null;
  if (child.localName === 'line') {
    const a = (k: string) => parseFloat(child.getAttribute(k) ?? '') || 0;
    return { kind: 'straight', x1: at.x + a('x1'), y1: at.y + a('y1'), x2: at.x + a('x2'), y2: at.y + a('y2') };
  }
  if (child.localName !== 'path') return null;
  const d = (child.getAttribute('d') ?? '').trim();
  const q = CURVE.exec(d);
  if (q) {
    const [x1, y1, cx, cy, x2, y2] = q.slice(1).map(parseFloat);
    return { kind: 'curve', x1: at.x + x1, y1: at.y + y1, x2: at.x + x2, y2: at.y + y2, c: { x: at.x + cx, y: at.y + cy } };
  }
  const e = ELBOW.exec(d);
  if (!e || e[3] === e[5] || (e[7] && e[7] !== e[3])) return null;
  const h = e[3] === 'H';
  const [x1, y1, v1, v2] = [e[1], e[2], e[4], e[6]].map(parseFloat);
  const [x2, y2] = e[7] ? (h ? [parseFloat(e[8]), v2] : [v2, parseFloat(e[8])]) : h ? [v1, v2] : [v2, v1];
  return { kind: 'elbow', h, m: (h ? at.x : at.y) + v1, x1: at.x + x1, y1: at.y + y1, x2: at.x + x2, y2: at.y + y2 };
}

const rounded = (s: Stroke): Stroke => ({
  ...s,
  x1: Math.round(s.x1), y1: Math.round(s.y1), x2: Math.round(s.x2), y2: Math.round(s.y2),
  ...(s.c ? { c: { x: Math.round(s.c.x), y: Math.round(s.c.y) } } : {}),
  ...(s.m !== undefined ? { m: Math.round(s.m) } : {}),
});

function corners(s: Stroke): Point[] {
  const m = s.m ?? 0;
  const pts = s.h
    ? [{ x: s.x1, y: s.y1 }, { x: m, y: s.y1 }, { x: m, y: s.y2 }, { x: s.x2, y: s.y2 }]
    : [{ x: s.x1, y: s.y1 }, { x: s.x1, y: m }, { x: s.x2, y: m }, { x: s.x2, y: s.y2 }];
  return pts.filter((p, i) => !i || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
}

function curveAt(s: Stroke, t: number): Point {
  const c = s.c ?? { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
  const u = 1 - t;
  return { x: u * u * s.x1 + 2 * u * t * c.x + t * t * s.x2, y: u * u * s.y1 + 2 * u * t * c.y + t * t * s.y2 };
}

export function pointsOf(s: Stroke): Point[] {
  if (s.kind === 'elbow') return corners(s);
  if (s.kind === 'curve') return Array.from({ length: SAMPLES + 1 }, (_, i) => curveAt(s, i / SAMPLES));
  return [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }];
}

export function bboxOf(stroke: Stroke): Box {
  const s = rounded(stroke);
  const pts = s.kind === 'curve' ? [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }] : pointsOf(s);
  if (s.kind === 'curve' && s.c) {
    for (const k of ['x', 'y'] as const) {
      const [p1, c, p2] = [k === 'x' ? s.x1 : s.y1, s.c[k], k === 'x' ? s.x2 : s.y2];
      const t = (p1 - c) / (p1 - 2 * c + p2);
      if (t > 0 && t < 1) pts.push(curveAt(s, t));
    }
  }
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const left = Math.floor(Math.min(...xs)), top = Math.floor(Math.min(...ys));
  return { left, top, width: Math.max(1, Math.ceil(Math.max(...xs)) - left), height: Math.max(1, Math.ceil(Math.max(...ys)) - top) };
}

export function strokeText(stroke: Stroke): { box: Box; tag: 'line' | 'path'; attrs: Record<string, string> } {
  const s = rounded(stroke);
  const box = bboxOf(s);
  const x = (v: number) => v - box.left, y = (v: number) => v - box.top;
  if (s.kind === 'straight') return { box, tag: 'line', attrs: { x1: String(x(s.x1)), y1: String(y(s.y1)), x2: String(x(s.x2)), y2: String(y(s.y2)) } };
  const start = `M${x(s.x1)} ${y(s.y1)}`;
  if (s.kind === 'curve') {
    const c = s.c ?? { x: s.x1, y: s.y1 };
    return { box, tag: 'path', attrs: { d: `${start} Q${x(c.x)} ${y(c.y)} ${x(s.x2)} ${y(s.y2)}` } };
  }
  const m = s.m ?? 0;
  const hv = `${start} H${x(s.x2)} V${y(s.y2)}`, vh = `${start} V${y(s.y2)} H${x(s.x2)}`;
  const d = s.h
    ? (m === s.x2 ? hv : m === s.x1 ? vh : `${start} H${x(m)} V${y(s.y2)} H${x(s.x2)}`)
    : (m === s.y2 ? vh : m === s.y1 ? hv : `${start} V${y(m)} H${x(s.x2)} V${y(s.y2)}`);
  return { box, tag: 'path', attrs: { d } };
}

export function withKind(s: Ends, kind: Kind): Stroke {
  const e = { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
  const dx = e.x2 - e.x1, dy = e.y2 - e.y1;
  if (kind === 'curve') return { ...e, kind, c: { x: (e.x1 + e.x2) / 2 + dy / 4, y: (e.y1 + e.y2) / 2 - dx / 4 } };
  if (kind === 'elbow') {
    const h = Math.abs(dx) >= Math.abs(dy);
    return { ...e, kind, h, m: h ? (e.x1 + e.x2) / 2 : (e.y1 + e.y2) / 2 };
  }
  return { ...e, kind };
}

export function gripOf(s: Stroke): Point | null {
  if (s.kind === 'curve') return curveAt(s, 0.5);
  if (s.kind !== 'elbow') return null;
  const m = s.m ?? 0;
  return s.h ? { x: m, y: (s.y1 + s.y2) / 2 } : { x: (s.x1 + s.x2) / 2, y: m };
}

export function bendTo(s: Stroke, p: Point, tol = 0): Stroke {
  if (s.kind === 'curve') {
    const c = { x: 2 * p.x - (s.x1 + s.x2) / 2, y: 2 * p.y - (s.y1 + s.y2) / 2 };
    for (const e of [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]) if (Math.hypot(c.x - e.x, c.y - e.y) < 1) c.y = e.y + (c.y < e.y ? -1 : 1);
    return { ...s, c };
  }
  if (s.kind !== 'elbow') return s;
  let m = s.h ? p.x : p.y;
  for (const e of s.h ? [s.x1, s.x2] : [s.y1, s.y2]) if (Math.abs(m - e) <= tol) m = e;
  return { ...s, m };
}

export function rebend(s: Stroke, e: Ends): Stroke {
  const out: Stroke = { ...s, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 };
  if (s.kind === 'curve' && s.c) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l2 = dx * dx + dy * dy || 1;
    const u = ((s.c.x - s.x1) * dx + (s.c.y - s.y1) * dy) / l2, v = ((s.c.y - s.y1) * dx - (s.c.x - s.x1) * dy) / l2;
    const ex = e.x2 - e.x1, ey = e.y2 - e.y1;
    out.c = { x: e.x1 + u * ex - v * ey, y: e.y1 + u * ey + v * ex };
  } else if (s.kind === 'elbow' && s.m !== undefined) {
    const [a, b, a2, b2] = s.h ? [s.x1, s.x2, e.x1, e.x2] : [s.y1, s.y2, e.y1, e.y2];
    const f = b === a ? 0.5 : (s.m - a) / (b - a);
    out.m = a2 + f * (b2 - a2);
  }
  return out;
}

export function distance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export const reach = (p: Point, pts: Point[]): number => (pts.length < 2 ? Infinity : Math.min(...pts.slice(1).map((b, i) => distance(p, pts[i], b))));
