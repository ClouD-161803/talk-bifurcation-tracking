// a `.surface` with data-bundle: a periodic orbit and strips along it, read from the inline JSON
// block named by data-bundle, e.g. the one written by data/lyapunov/eigendirections.py. a strip is
// the surface swept by a segment through each point of the orbit along a unit direction given there,
// e.g. an eigendirection of the monodromy matrix. the bundle is drawn with three.js on the renderer of surface.ts,
// under a camera that turns slowly and is turned by a drag. the strips shown at a step are named,
// separated by spaces, in data-surface-stage of a fragment of the slide. a strip that is added is
// grown out of the orbit, first as segments at its ribs, one after another along the orbit, and then
// as a sheet between them. a strip that is removed is shrunk back in the reverse order

import type * as Three from 'three';
import { LINE_FRAGMENT, LINE_VERTEX, clamp, dragToTurn, ease, lerp, mix3, num, renderer, rgb } from './surface.ts';
import type { RGB, Turntable } from './surface.ts';

type Vec = [number, number, number];

/**
 * The JSON block of a bundle, in the units of the drawing. The orbit is closed from its last point to
 * its first. A strip has a unit direction at every point of the orbit, a half width, and the indices
 * of the points at which a segment is drawn. Its tone is the name of a custom property of the theme
 * without its dashes, e.g. accent or violet.
 */
export type BundleData = {
  orbit: Vec[];
  libration_point?: Vec;
  strips: { id: string; tone: string; half_width: number; ribs: number[]; directions: Vec[] }[];
};

// milliseconds in which a strip is grown in full, and shrunk in full
const GROW = 3600;
const SHRINK = 1400;
// the part of the growth in which the segments are grown, the delay of the last segment after the
// first, and the part in which the sheet is grown after them
const RIBS_END = 0.42;
const RIB_DELAY = 0.2;
const SHEET_START = 0.42;
// the default seconds per turn of the camera
const TURN = 90;
// widths in slide pixels: the orbit, the segments, and the dot of the libration point
const ORBIT_WIDTH = 4;
const RIB_WIDTH = 2;
const DOT_SIZE = 18;
// the opacity of a sheet, which shows only its nearest side
const SHEET_ALPHA = 0.86;
// the corners of the six vertices of a segment in LINE_VERTEX
const QUAD = [0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1];

// the color of a sheet, from its tone along the orbit to uEdge at its two edges, under a Lambert
// shade of a fixed light seen from either side
const SHEET_VERTEX = /* glsl */ `
attribute vec3 aNormal;
attribute float aAcross;
varying vec3 vNormal;
varying float vAcross;
void main() {
  vNormal = aNormal;
  vAcross = aAcross;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SHEET_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uEdge;
uniform vec3 uLight;
uniform float uAlpha;
varying vec3 vNormal;
varying float vAcross;
void main() {
  vec3 c = mix(uColor, uEdge, vAcross);
  c *= 0.62 + 0.38 * abs(dot(normalize(vNormal), uLight));
  gl_FragColor = vec4(c, uAlpha);
}`;

const DOT_VERTEX = /* glsl */ `
uniform float uSize;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize;
}`;

// a disc in uColor, outlined in uRing
const DOT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uRing;
uniform float uSize;
void main() {
  float r = length(gl_PointCoord * 2.0 - 1.0);
  float aa = 2.0 / uSize;
  float outer = 1.0 - smoothstep(1.0 - aa, 1.0, r);
  if (outer <= 0.0) discard;
  float fill = 1.0 - smoothstep(0.62 - aa, 0.62, r);
  gl_FragColor = vec4(mix(uRing, uColor, fill), outer);
}`;

const add = (a: Vec, b: Vec, s: number): Vec => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]];

// the progress of the segment at the rib k of count, and of the sheet, at the growth g of a strip
const ribGrowth = (g: number, k: number, count: number): number => {
  const start = count > 1 ? (RIB_DELAY * k) / (count - 1) : 0;
  return ease(clamp((g - start) / (RIBS_END - RIB_DELAY), 0, 1));
};
const sheetGrowth = (g: number): number => ease(clamp((g - SHEET_START) / (1 - SHEET_START), 0, 1));

/** The data of the block text, or the reason it cannot be drawn. */
export function parseBundle(text: string): BundleData | string {
  let data: BundleData;
  try { data = JSON.parse(text); } catch (error) { return `its JSON is malformed, ${String(error)}`; }
  const n = data?.orbit?.length ?? 0;
  if (n < 3) return 'its orbit has fewer than three points';
  for (const r of data.strips ?? []) {
    if (r.directions?.length !== n) return `the strip ${r.id} has ${r.directions?.length ?? 0} directions for ${n} points of the orbit`;
    if (!(r.half_width > 0)) return `the strip ${r.id} does not have a positive half_width`;
    if (r.ribs.some((i) => !(i >= 0 && i < n))) return `a rib of the strip ${r.id} is not a point of the orbit`;
  }
  return data;
}

// one strip as drawn: its sheet, drawn after a depth mesh of the same triangles, so that only its
// nearest side is shown, and its segments. grow is moved from from to to in a change
type Strip = {
  id: string;
  tone: string;
  half: number;
  ribs: number[];
  directions: Vec[];
  sheet: Three.Mesh<Three.BufferGeometry, Three.ShaderMaterial>;
  depth: Three.Mesh<Three.BufferGeometry, Three.ShaderMaterial>;
  segments: Three.Mesh<Three.BufferGeometry, Three.ShaderMaterial>;
  grow: number;
  from: number;
  to: number;
  drawn: string;
};

const CACHE = new WeakMap<HTMLElement, Bundle>();

/** One drawing per `.surface` element with data-bundle, made with mount(). */
export class Bundle implements Turntable {
  readonly el: HTMLElement;
  private THREE: typeof Three;
  private orbit: Vec[];
  private point: Vec | null;
  private strips: Strip[];
  private canvas: HTMLCanvasElement;
  private labels: HTMLElement[];
  private scene: Three.Scene;
  private camera: Three.PerspectiveCamera;
  private line: Three.Mesh<Three.BufferGeometry, Three.ShaderMaterial>;
  private dot: Three.Points<Three.BufferGeometry, Three.ShaderMaterial>;
  private center: Vec;
  private radius: number;
  private rate: number;
  private azimuth: number;
  private elevation: number;
  private zoom: number;
  private stageName: string | null = null;
  private t0 = 0;
  private duration = GROW;
  private moving = false;
  private active = false;
  private raf = 0;
  private last = 0;
  private resume = 0;
  private dragging: () => boolean;
  private W = 0;
  private H = 0;
  private w = 0;
  private h = 0;

  constructor(el: HTMLElement, data: BundleData, THREE: typeof Three) {
    this.el = el;
    this.THREE = THREE;
    this.orbit = data.orbit;
    this.point = data.libration_point ?? null;
    const turn = num(el.dataset.turn, TURN);
    this.rate = turn > 0 ? (2 * Math.PI) / turn : 0;
    this.azimuth = (num(el.dataset.azimuth, -60) * Math.PI) / 180;
    this.elevation = (num(el.dataset.elevation, 32) * Math.PI) / 180;
    this.zoom = num(el.dataset.zoom, 1);
    for (const old of el.querySelectorAll(':scope > canvas.surface-image')) old.remove();
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'surface-image';
    this.canvas.setAttribute('aria-hidden', 'true');
    el.prepend(this.canvas);
    el.setAttribute('data-prevent-swipe', '');
    this.labels = [...el.querySelectorAll<HTMLElement>('.lab')];

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    this.camera.up.set(0, 0, 1);
    this.line = this.makeLine(this.orbit.length, ORBIT_WIDTH, 2);
    this.orbit.forEach((p, i) => this.setSegment(this.line.geometry, i, p, this.orbit[(i + 1) % this.orbit.length]));
    this.dot = this.makeDot();
    this.scene.add(this.line, this.dot);
    this.strips = data.strips.map((r, i) => this.makeStrip(r, i));
    // the camera is aimed at the box of the orbit and of every strip in full, at every stage
    const lo: Vec = [Infinity, Infinity, Infinity], hi: Vec = [-Infinity, -Infinity, -Infinity];
    const grow = (p: Vec) => { for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } };
    this.orbit.forEach(grow);
    for (const r of this.strips) this.orbit.forEach((p, i) => { grow(add(p, r.directions[i], r.half)); grow(add(p, r.directions[i], -r.half)); });
    this.center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    this.radius = 0.5 * Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);

    this.dragging = dragToTurn(el, (dx, dy) => {
      this.azimuth -= dx * 0.005;
      this.elevation = clamp(this.elevation + dy * 0.004, -1.45, 1.45);
      if (!this.raf) this.draw();
    }, () => { this.resume = performance.now() + 1500; });
    this.recolor();
    CACHE.set(el, this);
    this.sync(false);
    this.fit();
  }

  // the segments of a line as quads of width pixels, for count segments set with setSegment()
  private makeLine(count: number, width: number, order: number): Three.Mesh<Three.BufferGeometry, Three.ShaderMaterial> {
    const THREE = this.THREE, geometry = new THREE.BufferGeometry();
    const corner = new Float32Array(12 * count);
    for (let i = 0; i < count; i++) corner.set(QUAD, 12 * i);
    geometry.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
    geometry.setAttribute('start', new THREE.BufferAttribute(new Float32Array(18 * count), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('end', new THREE.BufferAttribute(new Float32Array(18 * count), 3).setUsage(THREE.DynamicDrawUsage));
    // three.js draws nothing without a position attribute unless the range is given
    geometry.setDrawRange(0, 6 * count);
    const material = new THREE.ShaderMaterial({
      vertexShader: LINE_VERTEX,
      fragmentShader: LINE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Vector3() },
        uAlpha: { value: 1 },
        uWidth: { value: width },
        uSoft: { value: 0 },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uBias: { value: 0.003 },
      },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.userData.width = width;
    return mesh;
  }

  private setSegment(geometry: Three.BufferGeometry, k: number, a: Vec, b: Vec): void {
    const start = geometry.getAttribute('start') as Three.BufferAttribute, end = geometry.getAttribute('end') as Three.BufferAttribute;
    for (let v = 0; v < 6; v++) {
      start.setXYZ(6 * k + v, a[0], a[1], a[2]);
      end.setXYZ(6 * k + v, b[0], b[1], b[2]);
    }
    start.needsUpdate = end.needsUpdate = true;
  }

  private makeDot(): Three.Points<Three.BufferGeometry, Three.ShaderMaterial> {
    const THREE = this.THREE, geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.point ?? [0, 0, 0]), 3));
    const material = new THREE.ShaderMaterial({
      vertexShader: DOT_VERTEX,
      fragmentShader: DOT_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Vector3() }, uRing: { value: new THREE.Vector3() }, uSize: { value: DOT_SIZE } },
    });
    const dot = new THREE.Points(geometry, material);
    dot.frustumCulled = false;
    dot.renderOrder = 4;
    dot.visible = this.point !== null;
    return dot;
  }

  // the sheet of a strip as a mesh of three rows of points across it, at its two edges and on the
  // orbit, whose positions are set by grow in place()
  private makeStrip(r: BundleData['strips'][number], i: number): Strip {
    const THREE = this.THREE, n = this.orbit.length, geometry = new THREE.BufferGeometry();
    const normal = new Float32Array(9 * n), across = new Float32Array(3 * n);
    for (let k = 0; k < n; k++) {
      const a = this.orbit[(k + n - 1) % n], b = this.orbit[(k + 1) % n], d = r.directions[k];
      const t: Vec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const c: Vec = [t[1] * d[2] - t[2] * d[1], t[2] * d[0] - t[0] * d[2], t[0] * d[1] - t[1] * d[0]];
      const l = Math.hypot(...c) || 1;
      for (let j = 0; j < 3; j++) {
        normal.set([c[0] / l, c[1] / l, c[2] / l], 3 * (3 * k + j));
        across[3 * k + j] = j === 1 ? 0 : 1;
      }
    }
    const index: number[] = [];
    for (let k = 0; k < n; k++) {
      const m = (k + 1) % n;
      for (let j = 0; j < 2; j++) {
        const a = 3 * k + j, b = 3 * m + j;
        index.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * n), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aNormal', new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute('aAcross', new THREE.BufferAttribute(across, 1));
    geometry.setIndex(index);
    const uniforms = {
      uColor: { value: new THREE.Vector3() },
      uEdge: { value: new THREE.Vector3() },
      uLight: { value: new THREE.Vector3(-0.45, -0.35, 0.82).normalize() },
      uAlpha: { value: SHEET_ALPHA },
    };
    // the two materials share their uniforms, and the depth mesh of every strip is drawn before
    // the sheet of any, thus where two sheets cross only the nearest is shown
    const material = (colorWrite: boolean) => new THREE.ShaderMaterial({
      vertexShader: SHEET_VERTEX,
      fragmentShader: SHEET_FRAGMENT,
      side: THREE.DoubleSide,
      transparent: true,
      colorWrite,
      uniforms,
    });
    const sheet = new THREE.Mesh(geometry, material(true)), depth = new THREE.Mesh(geometry, material(false));
    depth.renderOrder = 0.1 * i;
    sheet.renderOrder = 1 + 0.1 * i;
    const segments = this.makeLine(r.ribs.length, RIB_WIDTH, 3 + 0.1 * i);
    for (const o of [sheet, depth, segments]) { o.frustumCulled = false; this.scene.add(o); }
    return { id: r.id, tone: r.tone, half: r.half_width, ribs: r.ribs, directions: r.directions, sheet, depth, segments, grow: 0, from: 0, to: 0, drawn: '' };
  }

  /** Reads the colors of the theme from the custom properties of the element, e.g. after a flip of the mode. */
  recolor(): void {
    const cs = getComputedStyle(this.el), css = (name: string, fallback: RGB) => rgb(cs.getPropertyValue(name), fallback);
    const bg = css('--bg', [0.02, 0.02, 0.02]), text = css('--text', [0.95, 0.95, 0.94]);
    const set = (target: Three.Vector3, c: RGB) => target.set(c[0], c[1], c[2]);
    set(this.line.material.uniforms.uColor.value, text);
    set(this.dot.material.uniforms.uColor.value, text);
    set(this.dot.material.uniforms.uRing.value, bg);
    for (const r of this.strips) {
      const tone = css(`--${r.tone}`, [0.94, 0.5, 0.31]);
      set(r.sheet.material.uniforms.uColor.value, tone);
      set(r.sheet.material.uniforms.uEdge.value, mix3(tone, bg, 0.35));
      set(r.segments.material.uniforms.uColor.value, mix3(tone, text, 0.4));
    }
  }

  // the strips named by the visible fragment of the slide with data-surface-stage and the highest
  // fragment index, or by the data-stage of the element, or none. an unknown name is reported
  private target(): string[] {
    let best: HTMLElement | null = null, index = -Infinity;
    for (const f of this.el.closest('section')?.querySelectorAll<HTMLElement>('.fragment.visible[data-surface-stage]') ?? []) {
      const i = num(f.dataset.fragmentIndex, 0);
      if (i >= index) { best = f; index = i; }
    }
    const names = (best?.dataset.surfaceStage ?? this.el.dataset.stage ?? '').split(/\s+/).filter(Boolean);
    const unknown = names.filter((name) => !this.strips.some((r) => r.id === name));
    if (unknown.length) console.error(`beeson: unknown strip "${unknown.join(' ')}" of the bundle ${this.el.dataset.bundle}, known: ${this.strips.map((r) => r.id).join(', ')}`);
    return names;
  }

  /** Sets the strips shown from the fragments of the slide, grown or shrunk, or at once. */
  sync(animate: boolean): void {
    const names = this.target(), name = names.join(' ');
    if (name === this.stageName) return;
    const jump = !animate || this.stageName === null;
    this.stageName = name;
    this.el.dataset.shown = name;
    let longest = 0;
    for (const r of this.strips) {
      r.from = r.grow;
      r.to = names.includes(r.id) ? 1 : 0;
      longest = Math.max(longest, Math.abs(r.to - r.from) * (r.to > r.from ? GROW : SHRINK));
    }
    if (jump || longest === 0) {
      this.settle();
      this.draw();
      return;
    }
    this.duration = longest;
    this.t0 = performance.now();
    this.moving = true;
    this.kick();
  }

  // the end of a change, at once
  private settle(): void {
    this.moving = false;
    for (const r of this.strips) r.grow = r.from = r.to;
  }

  /**
   * The strips as drawn now, read by the tests: for each, its growth from 0 to 1, the growth of its
   * sheet, and that of each of its segments. With settled, the change of stage has ended.
   */
  probe(): { stage: string; settled: boolean; strips: { id: string; grow: number; sheet: number; ribs: number[] }[] } {
    return {
      stage: this.stageName ?? '',
      settled: !this.moving,
      strips: this.strips.map((r) => ({ id: r.id, grow: r.grow, sheet: sheetGrowth(r.grow), ribs: r.ribs.map((_, k) => ribGrowth(r.grow, k, r.ribs.length)) })),
    };
  }

  /** Sizes the canvas from the box of the element on the screen, and draws. */
  fit(): void {
    const r = this.el.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    if (!r.width || !r.height || !w || !h) return;
    this.W = Math.max(1, Math.round(r.width * dpr));
    this.H = Math.max(1, Math.round(r.height * dpr));
    this.w = w;
    this.h = h;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    const px = (dpr * r.height) / h;
    for (const mesh of [this.line, ...this.strips.map((rb) => rb.segments)]) {
      mesh.material.uniforms.uViewport.value.set(this.W, this.H);
      mesh.material.uniforms.uWidth.value = mesh.userData.width * px;
    }
    this.dot.material.uniforms.uSize.value = DOT_SIZE * px;
    this.camera.aspect = this.W / this.H;
    this.draw();
  }

  // the camera on a sphere about the middle of the box of the drawing, at the distance at which the
  // sphere around the box fills the narrower field of view, divided by data-zoom
  private aim(): void {
    const [cx, cy, cz] = this.center, R = this.radius;
    const v = (this.camera.fov * Math.PI) / 360, half = Math.min(v, Math.atan(Math.tan(v) * this.camera.aspect));
    const d = R / Math.sin(half) / this.zoom, c = Math.cos(this.elevation);
    this.camera.position.set(cx + d * c * Math.cos(this.azimuth), cy + d * c * Math.sin(this.azimuth), cz + d * Math.sin(this.elevation));
    this.camera.near = Math.max(0.01, d - 2 * R);
    this.camera.far = d + 2 * R;
    this.camera.lookAt(cx, cy, cz);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  // the points of the sheets and the segments at the growth of each strip, set only when it has
  // changed since the last frame
  private place(): void {
    const n = this.orbit.length;
    for (const r of this.strips) {
      const key = String(r.grow);
      if (key === r.drawn) continue;
      r.drawn = key;
      const s = sheetGrowth(r.grow) * r.half;
      const position = r.sheet.geometry.getAttribute('position') as Three.BufferAttribute;
      for (let k = 0; k < n; k++) {
        const p = this.orbit[k], d = r.directions[k];
        position.setXYZ(3 * k, ...add(p, d, -s));
        position.setXYZ(3 * k + 1, ...p);
        position.setXYZ(3 * k + 2, ...add(p, d, s));
      }
      position.needsUpdate = true;
      r.sheet.visible = r.depth.visible = s > 0;
      r.ribs.forEach((i, k) => {
        const g = ribGrowth(r.grow, k, r.ribs.length) * r.half, p = this.orbit[i], d = r.directions[i];
        this.setSegment(r.segments.geometry, k, add(p, d, -g), add(p, d, g));
      });
      r.segments.visible = r.grow > 0;
    }
  }

  // the labels at their anchors in the pixels of the slide. data-at is L1, for the libration point,
  // or the id of a strip. the label of a strip is at the outer end of the segment of its rib data-rib,
  // from 0, on the side data-side, 1 or -1, and it is faded in with its sheet
  private label(): void {
    const p = new this.THREE.Vector3();
    for (const lab of this.labels) {
      const at = lab.dataset.at ?? '';
      let anchor: Vec | null = null, alpha = 1;
      const r = this.strips.find((rb) => rb.id === at);
      if (r) {
        const k = clamp(Math.round(num(lab.dataset.rib, 0)), 0, r.ribs.length - 1), i = r.ribs[k];
        anchor = add(this.orbit[i], r.directions[i], r.half * (num(lab.dataset.side, 1) < 0 ? -1 : 1));
        alpha = sheetGrowth(r.grow);
      } else if (this.point && /^L\d$/.test(at)) anchor = this.point;
      if (!anchor) continue;
      p.set(...anchor).project(this.camera);
      lab.style.left = `${((p.x + 1) / 2) * this.w + num(lab.dataset.dx, 0)}px`;
      lab.style.top = `${((1 - p.y) / 2) * this.h + num(lab.dataset.dy, -30)}px`;
      lab.style.opacity = String(alpha);
    }
  }

  /** Draws the orbit and the strips at their growth and the camera of now, and places the labels. */
  draw(): void {
    if (!this.W) return;
    const r = renderer();
    if (!r) return;
    this.place();
    this.aim();
    this.label();
    if (r.domElement.width !== this.W || r.domElement.height !== this.H) r.setSize(this.W, this.H, false);
    r.render(this.scene, this.camera);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    // in the same task as the render, since the drawing buffer of WebGL is cleared after a frame
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.drawImage(r.domElement, 0, 0);
  }

  private kick(): void {
    if (this.active && !this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    this.raf = 0;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.moving) {
      const k = Math.min(1, (now - this.t0) / this.duration);
      for (const rb of this.strips) {
        // each strip is moved at the pace of a full growth or shrinking, and the longest is ended at k = 1
        const span = Math.abs(rb.to - rb.from) * (rb.to > rb.from ? GROW : SHRINK);
        rb.grow = span > 0 ? lerp(rb.from, rb.to, Math.min(1, (k * this.duration) / span)) : rb.to;
      }
      if (k >= 1) this.settle();
    }
    if (this.rate && !this.dragging() && now > this.resume) this.azimuth += dt * this.rate;
    this.draw();
    if (this.moving || this.rate) this.kick();
  };

  /** Takes the azimuth, the elevation, and the pause after a drag of the camera of other. */
  follow(other: Turntable): void {
    if (!(other instanceof Bundle)) return;
    this.azimuth = other.azimuth;
    this.elevation = other.elevation;
    this.resume = other.resume;
  }

  /** Starts the turning of the camera and the growth of the strips, while the slide is shown. */
  start(): void {
    this.active = true;
    this.last = 0;
    if (this.moving || this.rate) this.kick();
    else this.draw();
  }

  /** Stops the animation, and ends a change at once. */
  stop(): void {
    this.active = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.moving) this.settle();
  }
}

/** One Bundle per `.surface` with data-bundle under root, reused when an element was mounted before. An element whose block is missing or malformed, or a page without three.js or WebGL, is reported and left blank. */
export function mount(root: ParentNode): Bundle[] {
  const out: Bundle[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('.surface[data-bundle]')) {
    const known = CACHE.get(el);
    if (known) { out.push(known); continue; }
    const id = el.dataset.bundle ?? '';
    const block = document.getElementById(id);
    const data = block ? parseBundle(block.textContent ?? '') : `the block id="${id}" is missing`;
    if (typeof data === 'string') {
      console.error(`beeson: the bundle ${id} is not drawn, since ${data}`);
      continue;
    }
    if (!renderer() || !window.THREE) continue;
    out.push(new Bundle(el, data, window.THREE));
  }
  return out;
}
