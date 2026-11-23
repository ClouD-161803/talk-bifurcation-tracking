import { isolines } from './contour.ts';
import { lagrange } from './orbits.ts';

export type Height = (x: number, y: number) => number;

export type Point = { name: string; x: number; y: number; kind: 'saddle' | 'maximum' | 'minimum' };

export type Graph = { height: Height; tone: Tone; lift: number };

export type State = { graphs: Graph[]; points: boolean; level: number | null };

export type Tone = { ramp: string; range?: [number, number] };

export const RAMPS: Record<string, string[]> = {
  blues: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
  reds: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#a50f15', '#67000d'],
  magma_r: ['#fcfdbf', '#fdda9c', '#feb67c', '#fc9065', '#f56b5c', '#e24d66', '#c43c75', '#a3307e', '#832681', '#641a80'],
};

export type Attributes = Record<string, string | undefined>;

export type SurfaceFunction = {
  x: [number, number];
  y: [number, number];
  floor: number;
  zscale: number;
  points: Point[];
  states: Record<string, (attributes: Attributes) => State>;
  initial: string;
};

const num = (value: string | undefined, fallback: number): number =>
  value !== undefined && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback;

export function effectivePotential(mu: number): { wells: Height; bowl: Height; sum: Height } {
  const wells: Height = (x, y) => -(1 - mu) / Math.hypot(x + mu, y) - mu / Math.hypot(x - 1 + mu, y);
  const bowl: Height = (x, y) => -(x * x + y * y) / 2;
  return { wells, bowl, sum: (x, y) => wells(x, y) + bowl(x, y) };
}

export function librationPoints(mu: number): Point[] {
  const h = Math.sqrt(3) / 2;
  return [
    { name: 'L1', x: lagrange(1, mu), y: 0, kind: 'saddle' },
    { name: 'L2', x: lagrange(2, mu), y: 0, kind: 'saddle' },
    { name: 'L3', x: lagrange(3, mu), y: 0, kind: 'saddle' },
    { name: 'L4', x: 0.5 - mu, y: h, kind: 'maximum' },
    { name: 'L5', x: 0.5 - mu, y: -h, kind: 'maximum' },
  ];
}

export function clamped(f: Height, floor: number): Height {
  const w = 0.06;
  return (x, y) => {
    const s = (f(x, y) - floor) / w;
    return floor + w * (s > 0 ? s + Math.log1p(Math.exp(-s)) : Math.log1p(Math.exp(s)));
  };
}

export function sample(f: Height, x: [number, number], y: [number, number], nx: number, ny: number, floor: number): Float64Array {
  const g = new Float64Array((nx + 1) * (ny + 1)), c = clamped(f, floor);
  const dx = (x[1] - x[0]) / nx, dy = (y[1] - y[0]) / ny;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) g[j * (nx + 1) + i] = c(x[0] + i * dx, y[0] + j * dy);
  return g;
}

export function levelCurves(g: Float64Array, x: [number, number], y: [number, number], nx: number, ny: number, level: number): number[][] {
  const d = g.map((z) => z - level);
  return isolines(d, nx, ny, x[0], y[0], (x[1] - x[0]) / nx, (y[1] - y[0]) / ny, true);
}

const GRAVITATIONAL: Tone = { ramp: 'blues', range: [-3, -1.5] };
const CENTRIFUGAL: Tone = { ramp: 'reds', range: [-3, -1.5] };
const EFFECTIVE: Tone = { ramp: 'magma_r', range: [-3, -1.5] };
const BOWL_LIFT = 4;

const FUNCTIONS = {
  'effective-potential': (attributes: Attributes): SurfaceFunction => {
    const mu = num(attributes.mu, 0.05);
    const { wells, bowl, sum } = effectivePotential(mu);
    const points = librationPoints(mu);
    const C1 = -2 * sum(points[0].x, 0);
    const zero: Height = () => 0;
    const one = (height: Height, tone: Tone): Graph[] => [{ height, tone, lift: 0 }];
    return {
      x: [-1.5, 1.5],
      y: [-1.5, 1.5],
      floor: -3.2,
      zscale: 1,
      points,
      initial: 'zero',
      states: {
        zero: () => ({ graphs: one(zero, GRAVITATIONAL), points: false, level: null }),
        gravitational: () => ({ graphs: one(wells, GRAVITATIONAL), points: false, level: null }),
        centrifugal: () => ({ graphs: [...one(wells, GRAVITATIONAL), { height: bowl, tone: CENTRIFUGAL, lift: BOWL_LIFT }], points: false, level: null }),
        effective: () => ({ graphs: one(sum, EFFECTIVE), points: false, level: null }),
        extrema: () => ({ graphs: one(sum, EFFECTIVE), points: true, level: null }),
        cut: (a) => ({ graphs: one(sum, EFFECTIVE), points: true, level: -num(a.c, C1) / 2 }),
      },
    };
  },
} satisfies Record<string, (attributes: Attributes) => SurfaceFunction>;

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

export function surfaceFunction(name: string, attributes: Attributes): SurfaceFunction | null {
  return name in FUNCTIONS ? FUNCTIONS[name as keyof typeof FUNCTIONS](attributes) : null;
}
