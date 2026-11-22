import { TAU, clamp, smooth, type Extent, type Frame, type Kind } from './dotkind.ts';
import type { ColormapName } from './trajectories.ts';
import { systemOf } from './systems.ts';

export { SYSTEMS, systemOf } from './systems.ts';

export type PoincareData = {
  unit: number;
  energies: number[];
  born: number;
  boundary: number;
  central: number;
  counts: number[];
  rotation: number[][];
  range: [number, number];
  colormap?: ColormapName;
  saddle?: boolean;
  center: number[][];
  halos: number[][];
  points: string;
};

type State = {
  data: PoincareData;
  colormap: ColormapName;
  points: Int16Array;
  perEnergy: number;
  offsets: number[];
  lengths: number[];
  turned: number[];
  extent: Extent;
  now: Float32Array;
  halvesFor: string;
  halves: number[];
};


const RISE = 13;
const FADE = 0.7;
const DOT_SPACING = 7;
const FASTEST_DOT = 330;
const DOT = 1.4;
const FIXED_POINT = 5.5;
const FEWEST_HALF = 4;
const SLOWEST_TURN = 0.004;
const CROSS = 5;
const TRIMS: Partial<Record<ColormapName, { light: [number, number]; dark: [number, number] }>> = { Blues_r: { light: [0, 0.5], dark: [0, 0.9] } };

function decode(text: string): Int16Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function prepare(data: PoincareData): State {
  const points = decode(data.points);
  const energies = data.energies.length;
  const perEnergy = points.length / energies;
  const offsets: number[] = [];
  let at = 2 * data.boundary;
  for (const n of data.counts) {
    offsets.push(at);
    at += 2 * n;
  }
  const last = (energies - 1) * perEnergy;
  let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
  for (let i = 0; i < data.boundary; i++) {
    x0 = Math.min(x0, points[last + 2 * i]);
    x1 = Math.max(x1, points[last + 2 * i]);
    y0 = Math.min(y0, points[last + 2 * i + 1]);
    y1 = Math.max(y1, points[last + 2 * i + 1]);
  }
  const lengths = data.counts.map((n, c) => {
    const o = last + offsets[c];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      sum += Math.hypot(points[o + 2 * k] - points[o + 2 * i], points[o + 2 * k + 1] - points[o + 2 * i + 1]);
    }
    return sum;
  });
  const turned = data.counts.map((_, c) => {
    const first = c < data.central ? 0 : Math.max(0, data.born - 1);
    let sum = 0;
    for (let f = first; f < energies - 1; f++) sum += Math.abs(data.rotation[f + 1][c] - data.rotation[f][c]);
    return sum / ((energies - 1 - first) / (energies - 1));
  });
  const u = data.unit;
  return { data, colormap: data.colormap ?? 'plasma', points, perEnergy, offsets, lengths, turned, extent: { x0: x0 * u, x1: x1 * u, y0: y0 * u, y1: y1 * u }, now: new Float32Array(perEnergy), halvesFor: '', halves: [] };
}

function draw(frame: Frame<State>, seconds: number, duration: number): void {
  const { g, state, colors } = frame;
  const { data } = state;
  const e = data.energies;
  const rise = duration || RISE;
  const complete = !Number.isFinite(seconds);
  const h = e[0] + (e[e.length - 1] - e[0]) * (complete ? 1 : clamp(seconds / rise));
  let f = 0;
  while (f < e.length - 2 && e[f + 1] <= h) f++;
  const w = clamp((h - e[f]) / (e[f + 1] - e[f]));
  const a = state.points.subarray(f * state.perEnergy, (f + 1) * state.perEnergy);
  const b = state.points.subarray((f + 1) * state.perEnergy, (f + 2) * state.perEnergy);
  const p = state.now;
  for (let i = 0; i < p.length; i++) p[i] = a[i] + (b[i] - a[i]) * w;
  const between = (rows: number[][]) => rows[f].map((value, i) => value + (rows[f + 1][i] - value) * w);
  const born = f + 1 < data.born ? 0 : f + 1 === data.born ? w : 1;
  const shown = complete ? 1 : smooth(seconds / FADE);
  const s = frame.scale * data.unit;
  const X = (x: number) => frame.x0 + s * x;
  const Y = (y: number) => frame.y0 - s * y;

  const key = `${s} ${rise}`;
  if (state.halvesFor !== key) {
    state.halvesFor = key;
    state.halves = state.lengths.map((length, c) => {
      const px = length * s;
      return Math.max(FEWEST_HALF, Math.round(Math.min(px / DOT_SPACING, (2 * FASTEST_DOT * rise) / (state.turned[c] * px)) / 2));
    });
  }

  const [lo, hi] = data.range;
  const trim = TRIMS[state.colormap]?.[colors.light ? 'light' : 'dark'];
  const rotation = between(data.rotation).map((turn) => Math.max(SLOWEST_TURN, turn));
  data.counts.forEach((n, c) => {
    const aboutHalo = c >= data.central;
    if (aboutHalo && !born) return;
    const o = state.offsets[c];
    g.globalAlpha = shown * (aboutHalo ? born : 1);
    g.fillStyle = colors.map(state.colormap, (rotation[c] - lo) / (hi - lo), trim);
    g.beginPath();
    const half = Math.max(state.halves[c], Math.ceil(0.5 / rotation[c]) + 1);
    for (let j = -half; j < half; j++) {
      const turn = j * rotation[c];
      const along = (turn - Math.floor(turn)) * n;
      const i = Math.floor(along) % n;
      const k = (i + 1) % n;
      const part = along - Math.floor(along);
      const x = X(p[o + 2 * i] + (p[o + 2 * k] - p[o + 2 * i]) * part);
      const y = Y(p[o + 2 * i + 1] + (p[o + 2 * k + 1] - p[o + 2 * i + 1]) * part);
      g.moveTo(x + DOT, y);
      g.arc(x, y, DOT, 0, TAU);
    }
    g.fill();
  });

  const fixedPoint = (x: number, y: number, diamond: boolean) => {
    const cx = X(x), cy = Y(y), r = FIXED_POINT;
    g.beginPath();
    if (diamond) {
      g.moveTo(cx, cy - r * 1.25);
      g.lineTo(cx + r * 1.25, cy);
      g.lineTo(cx, cy + r * 1.25);
      g.lineTo(cx - r * 1.25, cy);
      g.closePath();
    } else g.arc(cx, cy, r, 0, TAU);
    g.fillStyle = colors.mark;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = colors.ground;
    g.stroke();
  };
  g.globalAlpha = shown * born;
  const halos = between(data.halos);
  if (born) for (const i of [0, 2]) fixedPoint(halos[i], halos[i + 1], true);
  const center = between(data.center);
  const saddle = data.saddle ? born : 0;
  g.globalAlpha = shown * (1 - saddle);
  if (saddle < 1) fixedPoint(center[0], center[1], false);
  if (saddle) {
    const cx = X(center[0]), cy = Y(center[1]);
    g.globalAlpha = shown * saddle;
    g.lineCap = 'round';
    for (const [width, color] of [[5.5, colors.ground], [2.5, colors.mark]] as const) {
      g.beginPath();
      for (const s of [1, -1]) {
        g.moveTo(cx - CROSS, cy - CROSS * s);
        g.lineTo(cx + CROSS, cy + CROSS * s);
      }
      g.lineWidth = width;
      g.strokeStyle = color;
      g.stroke();
    }
  }
  g.globalAlpha = 1;
}

export const poincare: Kind<PoincareData, State> = {
  margin: 14,
  endless: false,
  file: (el) => `poincare-${systemOf(el.dataset.system)}`,
  prepare,
  extent: (state) => state.extent,
  span: (_state, duration) => duration || RISE,
  draw,
};
