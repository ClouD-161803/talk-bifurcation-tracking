import { TAU, smooth, type Extent, type Frame, type Kind } from './dotkind.ts';

export type ToriData = {
  unit: number;
  tori: { alpha: number; rotation: number; modes: number[][] }[];
  orbit: [number, number][];
};

type Torus = { alpha: number; rotation: number; sums: Float64Array };
type State = {
  tori: Torus[];
  shown: number[];
  verticalTurn: number;
  orbit: [number, number][];
  extent: Extent;
  at: Float64Array;
};

export const ALPHAS = Array.from({ length: 10 }, (_, n) => ((n + 1) / 50).toFixed(2));
export const NONE = 'none';
export const PLANES = ['xy', 'xz'];
export const planeOf = (value: string | null | undefined): string => (value === 'xz' ? 'xz' : 'xy');

export function shownTori(spec: string | null | undefined, alphas: number[]): number[] {
  if (spec === null || spec === undefined || !spec.trim()) return alphas.map((_, n) => n);
  const asked = spec.trim().split(/\s+/).map(Number);
  return alphas.flatMap((alpha, n) => (asked.some((a) => Math.abs(a - alpha) < 1e-6) ? [n] : []));
}

export function toriSpec(shown: boolean[]): string | null {
  if (shown.every(Boolean)) return null;
  return ALPHAS.filter((_, n) => shown[n]).join(' ') || NONE;
}

const ORBIT_TRACE = 1.2;
const BETWEEN_STARTS = 1.1;
const RUN = 12;
const ORBITS = 12;
const ORBITS_PER_TORUS = 1;
const TRAIN = 0.44;
const DOT_SPACING = 5;
const PERIODS_PER_SECOND = 0.27;
const DOT = 1.6;
const HEAD = 1.25;
const TAIL = 0.3;
const FAINT = 0.5;
const ALONE = 2;
const WIDE_X = 5.5;
const MAGMA: [number, number] = [0.18, 0.88];
const STEPS = 96;
const HARMONICS = 5;
const CROSS = 4;

function spot(state: State, torus: Torus, n: number, turn: number): Float64Array {
  const J = HARMONICS, M = STEPS;
  const m = n % M;
  const phase = state.verticalTurn * turn + ((TAU + torus.rotation) * n) / M;
  const s = torus.sums;
  let x = s[m * 4], y = s[m * 4 + 2];
  for (let k = 1; k <= J; k++) {
    const o = (k * M + m) * 4;
    const cos = Math.cos(k * phase), sin = Math.sin(k * phase);
    x += 2 * (s[o] * cos - s[o + 1] * sin);
    y += 2 * (s[o + 2] * cos - s[o + 3] * sin);
  }
  state.at[0] = x;
  state.at[1] = y;
  return state.at;
}

function prepare(data: ToriData, el: HTMLElement): State {
  const J = HARMONICS, M = STEPS;
  const up = planeOf(el.dataset.plane) === 'xz' ? 2 : 1;
  const wide = up === 2 ? WIDE_X : 1;
  const tori = data.tori.map((torus) => {
    const c = new Float64Array((J + 1) * (2 * J + 1) * 4);
    for (const [j, k, ...values] of torus.modes) c.set([wide * values[0], wide * values[1], values[2 * up], values[2 * up + 1]], (k * (2 * J + 1) + j + J) * 4);
    const sums = new Float64Array((J + 1) * M * 4);
    for (let k = 0; k <= J; k++) {
      for (let m = 0; m < M; m++) {
        let xr = 0, xi = 0, yr = 0, yi = 0;
        for (let j = -J; j <= J; j++) {
          const o = (k * (2 * J + 1) + j + J) * 4;
          const angle = (TAU * j * m) / M;
          const cos = Math.cos(angle), sin = Math.sin(angle);
          xr += c[o] * cos - c[o + 1] * sin;
          xi += c[o] * sin + c[o + 1] * cos;
          yr += c[o + 2] * cos - c[o + 3] * sin;
          yi += c[o + 2] * sin + c[o + 3] * cos;
        }
        sums.set([xr, xi, yr, yi], (k * M + m) * 4);
      }
    }
    return { alpha: torus.alpha, rotation: torus.rotation, sums };
  });
  const spec = el.dataset.tori;
  const shown = shownTori(spec, data.tori.map((torus) => torus.alpha));
  const asked = spec?.trim() && spec.trim() !== NONE ? spec.trim().split(/\s+/).length : shown.length;
  if (asked !== shown.length) console.warn(`beeson: data-tori="${spec}" is not ${NONE} or a list of ${ALPHAS[0]} to ${ALPHAS[ALPHAS.length - 1]} in steps of ${ALPHAS[0]}`);
  const orbit = data.orbit.map(([x, y]): [number, number] => [wide * x, up === 1 ? y : 0]);
  const state: State = { tori, shown, verticalTurn: up === 1 ? Math.PI : TAU, orbit, extent: { x0: 0, x1: 0, y0: 0, y1: 0 }, at: new Float64Array(2) };
  const e = state.extent;
  const hold = (x: number, y: number) => {
    e.x0 = Math.min(e.x0, x);
    e.x1 = Math.max(e.x1, x);
    e.y0 = Math.min(e.y0, y);
    e.y1 = Math.max(e.y1, y);
  };
  for (const [x, y] of orbit) hold(x, y);
  const largest = tori[shown[shown.length - 1]];
  if (largest) {
    for (let r = 0; r < M; r++) {
      for (let n = 0; n < M; n++) {
        const at = spot(state, largest, n, r / M);
        hold(at[0], at[1]);
      }
    }
  }
  return state;
}

const paceOf = (duration: number): number => (duration ? duration / (ORBIT_TRACE + (ALPHAS.length - 1) * BETWEEN_STARTS) : 1);
const span = (state: State, duration: number): number => paceOf(duration) * (ORBIT_TRACE + Math.max(0, state.shown.length - 1) * BETWEEN_STARTS) + RUN;

function draw(frame: Frame<State>, seconds: number, duration: number): void {
  const { g, state, colors } = frame;
  const { tori, shown } = state;
  const pace = paceOf(duration);
  const t = Number.isFinite(seconds) ? seconds : span(state, duration);
  const X = (x: number) => frame.x0 + frame.scale * x;
  const Y = (y: number) => frame.y0 - frame.scale * y;
  const lo = tori[0].alpha, hi = tori[tori.length - 1].alpha;
  const alone = shown.length === 1;
  const length = TRAIN * STEPS * (alone ? ALONE : 1);
  const point = (torus: Torus, at: number, turn: number): [number, number] => {
    const from = Math.floor(at);
    const a = spot(state, torus, from, turn);
    const ax = a[0], ay = a[1];
    const b = spot(state, torus, from + 1, turn);
    return [X(ax + (b[0] - ax) * (at - from)), Y(ay + (b[1] - ay) * (at - from))];
  };
  const dot = (x: number, y: number, size: number) => {
    g.moveTo(x + DOT * size, y);
    g.arc(x, y, DOT * size, 0, TAU);
  };
  g.globalAlpha = 0.95;
  for (let i = shown.length - 1; i >= 0; i--) {
    const n = shown[i];
    const head = (t - pace * (ORBIT_TRACE + i * BETWEEN_STARTS)) * PERIODS_PER_SECOND * STEPS;
    if (head <= 0) continue;
    const first = Math.max(0, head - length);
    const orbits = Math.round((ORBITS + ORBITS_PER_TORUS * n) * (alone ? ALONE : 1));
    const value = (tori[n].alpha - lo) / (hi - lo);
    g.fillStyle = colors.map('magma', colors.light || alone ? value : 1 - value, MAGMA);
    g.beginPath();
    for (let r = 0; r < orbits; r++) {
      let a = head;
      let [px, py] = point(tori[n], a, r / orbits);
      dot(px, py, HEAD);
      let carry = DOT_SPACING;
      while (a > first) {
        const b = Math.max(first, Math.ceil(a) - 1);
        const [qx, qy] = point(tori[n], b, r / orbits);
        const segment = Math.hypot(qx - px, qy - py);
        while (carry <= segment) {
          const f = carry / segment;
          dot(px + (qx - px) * f, py + (qy - py) * f, 1 - ((1 - TAIL) * (head - (a + (b - a) * f))) / length);
          carry += DOT_SPACING;
        }
        carry -= segment;
        a = b;
        px = qx;
        py = qy;
      }
    }
    g.fill();
  }
  const orbit = state.orbit;
  const traced = smooth(t / (pace * ORBIT_TRACE));
  g.strokeStyle = colors.text;
  g.lineWidth = 1.2;
  g.lineJoin = 'round';
  g.globalAlpha = FAINT;
  g.beginPath();
  const points = Math.round(traced * orbit.length);
  for (let n = 0; n <= points; n++) {
    const [x, y] = orbit[n % orbit.length];
    if (n) g.lineTo(X(x), Y(y));
    else g.moveTo(X(x), Y(y));
  }
  g.stroke();
  g.globalAlpha = FAINT * traced;
  g.beginPath();
  for (const s of [1, -1]) {
    g.moveTo(X(0) - CROSS, Y(0) - CROSS * s);
    g.lineTo(X(0) + CROSS, Y(0) + CROSS * s);
  }
  g.stroke();
  g.globalAlpha = 1;
}

export const tori: Kind<ToriData, State> = {
  margin: 16,
  endless: true,
  file: () => 'tori',
  prepare,
  extent: (state) => state.extent,
  span,
  draw,
};
