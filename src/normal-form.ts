import { TAU, clamp, smooth, type Colors, type Frame, type Kind } from './dotkind.ts';
import { mix } from './trajectories.ts';

export const STATES = ['none', 'field', 'stable', 'unstable', 'directions', 'flow', 'linear', 'resonant'];
const [, FIELD, STABLE, UNSTABLE, DIRECTIONS, FLOW, LINEAR, RESONANT] = STATES.map((_, n) => n);

const C = 1.5;
const REACH = 1.55;
const SIDE = 1.6;
const LONGEST = 0.172;
const Q_HEAD = 0.05;
const Q_HALF = 0.019;
const E_HEAD = 0.1;
const E_HALF = 0.042;
const E_GAP = 0.068;
const E_INNER = 0.56;
const RIPPLE = 1.05;
const SHAFT_WIPE = 0.25;
const LINE_WIPE = 0.8;
const MORPH = 1.25;
const TURN = 0.85;
const FADE = 0.14;
const PASS = 6;
const HOLD = 1.4;
const LOOP_FADE = 0.4;
const STILL_AT = 0.86;
const POINTS = 80;
const WIDTH = 3;
const DOT = 6;
const ORIGIN = 11;
const FAINT = 0.22;
const REFERENCE = 0.42;

type Point = [number, number];
type Ramped = { at: number; pts: Point[] };
type Tone = 'violet' | 'accent' | number;
type Morph = { from: number; to: number; t: number; span: number } | null;

export type State = {
  stage: number;
  age: number;
  stable: number;
  unstable: number;
  heads: number;
  traces: number;
  linear: number;
  resonant: number;
  toLinear: Morph;
  toResonant: Morph;
  saddleClock: number;
  resonantClock: number;
  last: number | null;
};

const easeInOut = (t: number): number => {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

const along = (n: number, at: (u: number) => Point): Point[] => Array.from({ length: n + 1 }, (_, i) => at(i / n));

const GRID = (() => {
  const coords = [-1.35, -1.05, -0.75, -0.45, -0.15, 0.15, 0.45, 0.75, 1.05, 1.35];
  const pts = coords.flatMap((x) => coords.map((y) => ({ x, y, r: Math.hypot(x, y) }))).sort((a, b) => a.r - b.r);
  const far = pts[pts.length - 1].r;
  return pts.map((p) => ({ ...p, delay: (RIPPLE * p.r) / far }));
})();

const LEVELS = [0.1, 0.35, 0.7];
const SADDLE: { tone: Tone; base: Point[] }[] = [
  ...[1, -1].map((s) => ({ tone: 'violet' as Tone, base: along(POINTS, (u): Point => [0, s * 1.48 * Math.exp(-2.65 * u)]) })),
  ...[1, -1].map((s) => ({ tone: 'accent' as Tone, base: along(POINTS, (u): Point => [s * 0.1 * Math.exp(2.7 * u), 0]) })),
  ...LEVELS.flatMap((x0, n) => [1, -1].flatMap((sx) => [1, -1].map((sy) => {
    const T = Math.log(1.6 / x0);
    return { tone: n / (LEVELS.length - 1) as Tone, base: along(POINTS, (u): Point => [sx * x0 * Math.exp(T * u), sy * 1.6 * Math.exp(-T * u)]) };
  }))),
];

const FAMILIES = [{ c0: 2.4, reach: 0.88 }, { c0: 0.75, reach: 1.24 }, { c0: -0.05, reach: 1.55 }, { c0: -1.4, reach: 1.36 }];
const RESONANT_TRACES: { tone: Tone; pts: Point[] }[] = [
  ...[1, -1].map((s) => ({ tone: 'accent' as Tone, pts: along(POINTS, (u): Point => [0, s * 0.1 * Math.exp(2.74 * u)]) })),
  ...FAMILIES.flatMap(({ c0, reach }, n) => [1, -1].map((sx) => {
    const x0 = 0.12, T = Math.log(reach / x0);
    return {
      tone: n / (FAMILIES.length - 1) as Tone,
      pts: along(POINTS, (u): Point => {
        const x = x0 * Math.exp(T * u);
        return [sx * x, x * x * (c0 + C * Math.log(x))];
      }),
    };
  })),
];

const REFERENCES = [-1, 0, 1].map((k) => along(POINTS, (u): Point => {
  const x = -REACH + 2 * REACH * u;
  return [x, k * x * x];
}));

function initial(): State {
  return {
    stage: FLOW, age: 0, stable: 0, unstable: 0, heads: 0, traces: 0, linear: 0, resonant: 0,
    toLinear: null, toResonant: null, saddleClock: 0, resonantClock: 0, last: null,
  };
}

function settle(st: State): void {
  const n = st.stage;
  st.age = n >= FIELD ? Infinity : 0;
  st.stable = n >= STABLE ? 1 : 0;
  st.unstable = n >= UNSTABLE ? 1 : 0;
  st.heads = n >= DIRECTIONS ? 1 : 0;
  st.traces = n >= FLOW ? 1 : 0;
  st.linear = n === LINEAR ? 1 : 0;
  st.resonant = n >= RESONANT ? 1 : 0;
  st.toLinear = st.toResonant = null;
  st.saddleClock = st.resonantClock = 0;
  st.last = null;
}

function sync(st: State, name: string, animate: boolean): void {
  const before = st.stage;
  st.stage = Math.max(0, STATES.indexOf(name));
  if (!animate) {
    settle(st);
    return;
  }
  const n = st.stage;
  if (n < FIELD) st.age = 0;
  else if (before < FIELD) st.age = 0;
  if (n < STABLE) st.stable = 0;
  if (n < UNSTABLE) st.unstable = 0;
  if (n >= FLOW && before < FLOW) st.saddleClock = 0;
  const linear = n === LINEAR ? 1 : 0;
  if (Math.abs(linear - st.linear) > 1e-4 && st.toLinear?.to !== linear) st.toLinear = { from: st.linear, to: linear, t: 0, span: MORPH };
  const resonant = n >= RESONANT ? 1 : 0;
  if (Math.abs(resonant - st.resonant) > 1e-4 && st.toResonant?.to !== resonant) {
    st.toResonant = { from: st.resonant, to: resonant, t: 0, span: TURN };
    if (resonant) st.resonantClock = 0;
  }
}

function toward(value: number, target: number, dt: number): number {
  const next = value + (target - value) * (1 - Math.exp(-dt / FADE));
  return Math.abs(target - next) < 0.004 ? target : next;
}

function advance(morph: Morph, dt: number): [number, Morph] {
  if (!morph) return [NaN, null];
  morph.t += dt;
  const u = clamp(morph.t / morph.span);
  return u >= 1 ? [morph.to, null] : [morph.from + (morph.to - morph.from) * easeInOut(u), morph];
}

function tick(st: State, dt: number): void {
  const n = st.stage;
  if (n >= FIELD && st.age < RIPPLE + SHAFT_WIPE + 0.1) st.age += dt;
  if (n >= STABLE) st.stable = Math.min(1, st.stable + dt / LINE_WIPE);
  if (n >= UNSTABLE) st.unstable = Math.min(1, st.unstable + dt / LINE_WIPE);
  st.heads = toward(st.heads, n >= DIRECTIONS ? 1 : 0, dt);
  st.traces = toward(st.traces, n >= FLOW ? 1 : 0, dt);
  if (st.toLinear) [st.linear, st.toLinear] = advance(st.toLinear, dt);
  if (st.toResonant) [st.resonant, st.toResonant] = advance(st.toResonant, dt);
  if (n >= FLOW && st.resonant < 0.99) st.saddleClock += dt;
  if (n >= RESONANT || st.resonant > 0.01) st.resonantClock += dt;
}

function loop(clock: number): { at: number; fade: number } {
  const period = PASS + HOLD, tau = clock % period;
  return { at: clamp(tau / PASS), fade: clock >= period && tau < LOOP_FADE ? smooth(tau / LOOP_FADE) : 1 };
}

function draw(frame: Frame<State>, seconds: number): void {
  const { g, state: st, colors, scale } = frame;
  const still = !Number.isFinite(seconds);
  if (still) settle(st);
  else {
    const dt = st.last === null || seconds < st.last ? 0 : Math.min(0.1, seconds - st.last);
    st.last = seconds;
    tick(st, dt);
  }
  const saddle = still ? { at: STILL_AT, fade: 1 } : loop(st.saddleClock);
  const resonant = still ? { at: STILL_AT, fade: 1 } : loop(st.resonantClock);
  const X = (x: number) => frame.x0 + scale * x;
  const Y = (y: number) => frame.y0 - scale * y;
  const tone = (t: Tone): string => (t === 'violet' ? colors.tone('--violet') : t === 'accent' ? colors.tone('--accent') : ramp(colors, t));
  const path = (pts: Point[], upTo = pts.length) => {
    g.beginPath();
    for (let i = 0; i < upTo; i++) (i ? g.lineTo : g.moveTo).call(g, X(pts[i][0]), Y(pts[i][1]));
  };
  const head = (x: number, y: number, dx: number, dy: number, length: number, half: number) => {
    const bx = x - length * dx, by = y - length * dy;
    g.moveTo(X(x), Y(y));
    g.lineTo(X(bx - dy * half), Y(by + dx * half));
    g.lineTo(X(bx + dy * half), Y(by - dx * half));
    g.closePath();
  };
  const wiped = (pts: Point[], w: number) => {
    const lengths = [0];
    for (let i = 1; i < pts.length; i++) lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const end = easeInOut(w) * lengths[lengths.length - 1];
    let k = 1;
    while (k < pts.length && lengths[k] <= end) k++;
    path(pts, k);
    if (k < pts.length) {
      const f = (end - lengths[k - 1]) / (lengths[k] - lengths[k - 1] || 1);
      g.lineTo(X(pts[k - 1][0] + f * (pts[k][0] - pts[k - 1][0])), Y(pts[k - 1][1] + f * (pts[k][1] - pts[k - 1][1])));
    }
    g.stroke();
  };
  const traced = (pts: Point[], color: string, { at, fade }: { at: number; fade: number }) => {
    g.strokeStyle = g.fillStyle = color;
    const alpha = g.globalAlpha;
    g.globalAlpha = alpha * FAINT;
    path(pts);
    g.stroke();
    const u = at * (pts.length - 1), k = Math.floor(u), f = u - k;
    let [hx, hy] = pts[k];
    if (f > 0 && k < pts.length - 1) {
      hx += f * (pts[k + 1][0] - pts[k][0]);
      hy += f * (pts[k + 1][1] - pts[k][1]);
    }
    g.globalAlpha = alpha * fade;
    path(pts, k + 1);
    g.lineTo(X(hx), Y(hy));
    g.stroke();
    g.beginPath();
    g.arc(X(hx), Y(hy), DOT, 0, TAU);
    g.fill();
    g.globalAlpha = alpha;
  };

  const alpha = (1 - st.linear) * (C / 3);
  const lambda = -1 + 3 * st.resonant;
  const c = (1 - st.resonant) * (1 - st.linear) * C + st.resonant * C;
  g.lineCap = g.lineJoin = 'round';
  g.save();
  g.beginPath();
  g.rect(X(-SIDE) - DOT, Y(SIDE) - DOT, 2 * SIDE * scale + 2 * DOT, 2 * SIDE * scale + 2 * DOT);
  g.clip();

  if (st.stage >= FIELD) {
    const flows = GRID.map(({ x, y }) => {
      const vx = x, vy = lambda * y + c * x * x;
      return [vx, vy, Math.hypot(vx, vy)];
    });
    const fastest = Math.max(...flows.map((v) => v[2]));
    g.strokeStyle = g.fillStyle = colors.tone('--muted');
    g.lineWidth = 1.5;
    const heads: [number, number, number, number][] = [];
    g.beginPath();
    GRID.forEach((p, i) => {
      const [vx, vy, speed] = flows[i];
      const w = smooth((st.age - p.delay) / SHAFT_WIPE);
      if (w <= 0 || speed < 1e-9) return;
      const dx = vx / speed, dy = vy / speed;
      const length = LONGEST * Math.max(0.45, Math.sqrt(speed / fastest));
      const tx = p.x - 0.5 * length * dx, ty = p.y - 0.5 * length * dy;
      const ex = p.x + 0.5 * length * dx - 0.5 * Q_HEAD * dx, ey = p.y + 0.5 * length * dy - 0.5 * Q_HEAD * dy;
      g.moveTo(X(tx), Y(ty));
      g.lineTo(X(tx + w * (ex - tx)), Y(ty + w * (ey - ty)));
      if (st.age >= p.delay + 0.8 * SHAFT_WIPE) heads.push([p.x + 0.5 * length * dx, p.y + 0.5 * length * dy, dx, dy]);
    });
    g.stroke();
    g.beginPath();
    for (const [x, y, dx, dy] of heads) head(x, y, dx, dy, Q_HEAD, Q_HALF);
    g.fill();
  }

  const shown = 1 - st.resonant;
  g.lineWidth = WIDTH;
  if (shown > 0.002) {
    g.globalAlpha = shown;
    if (st.stable > 0) {
      g.strokeStyle = colors.tone('--violet');
      wiped([[0, -REACH], [0, REACH]], st.stable);
    }
    if (st.unstable > 0) {
      g.strokeStyle = colors.tone('--accent');
      wiped(along(POINTS, (u): Point => {
        const x = -REACH + 2 * REACH * u;
        return [x, alpha * x * x];
      }), st.unstable);
    }
    if (st.heads > 0.002) {
      g.globalAlpha = shown * st.heads;
      g.fillStyle = colors.tone('--violet');
      g.beginPath();
      for (const side of [1, -1]) for (const k of [0, 1]) head(0, side * (E_INNER + k * E_GAP), 0, -side, E_HEAD, E_HALF);
      g.fill();
      g.fillStyle = colors.tone('--accent');
      g.beginPath();
      for (const side of [1, -1]) {
        for (const target of [E_INNER + E_HEAD, E_INNER + E_HEAD + E_GAP]) {
          const x = atLength(alpha, target), slope = 2 * alpha * x, norm = Math.hypot(1, slope);
          head(side * x, alpha * x * x, side / norm, slope / norm, E_HEAD, E_HALF);
        }
      }
      g.fill();
    }
  }

  if (st.resonant > 0.002) {
    g.globalAlpha = st.resonant * REFERENCE;
    g.strokeStyle = colors.tone('--muted');
    g.lineWidth = 1.8;
    g.setLineDash([8, 8]);
    for (const pts of REFERENCES) {
      path(pts);
      g.stroke();
    }
    g.setLineDash([]);
    g.globalAlpha = st.resonant;
    g.lineWidth = WIDTH;
    g.strokeStyle = g.fillStyle = colors.tone('--accent');
    path([[0, -REACH], [0, REACH]]);
    g.stroke();
    g.beginPath();
    for (const side of [1, -1]) for (const k of [0, 1]) head(0, side * (E_INNER + E_HEAD + k * E_GAP), 0, side, E_HEAD, E_HALF);
    g.fill();
  }

  if (shown * st.traces > 0.002) {
    g.globalAlpha = shown * st.traces;
    for (const t of SADDLE) traced(t.base.map(([x, y]): Point => [x, y + alpha * x * x]), tone(t.tone), saddle);
  }
  if (st.resonant > 0.002) {
    g.globalAlpha = st.resonant;
    for (const t of RESONANT_TRACES) traced(t.pts, tone(t.tone), resonant);
  }

  g.restore();
  g.globalAlpha = 1;
  g.lineWidth = WIDTH;
  g.fillStyle = colors.ground;
  g.strokeStyle = colors.text;
  g.beginPath();
  g.arc(X(0), Y(0), ORIGIN, 0, TAU);
  g.fill();
  g.stroke();
}

function atLength(alpha: number, target: number): number {
  const n = 60;
  let length = 0;
  for (let i = 1; i <= n; i++) {
    const a = (1.3 * (i - 1)) / n, b = (1.3 * i) / n;
    const step = Math.hypot(b - a, alpha * (b * b - a * a));
    if (length + step >= target) return a + ((target - length) / (step || 1)) * (b - a);
    length += step;
  }
  return 1.3;
}

const ramps = new WeakMap<Colors, Map<number, string>>();
function ramp(colors: Colors, at: number): string {
  let known = ramps.get(colors);
  if (!known) ramps.set(colors, (known = new Map()));
  let out = known.get(at);
  if (out === undefined) known.set(at, (out = mix(colors.tone('--trajectory-4'), colors.tone('--trajectory-6'), at) ?? colors.tone('--trajectory-6')));
  return out;
}

export const normalForm: Kind<null, State> = {
  margin: 16,
  endless: true,
  file: () => null,
  prepare: () => initial(),
  extent: () => ({ x0: -SIDE, x1: SIDE, y0: -SIDE, y1: SIDE }),
  span: () => PASS + HOLD,
  draw,
  states: STATES,
  initial: 'flow',
  sync,
};
