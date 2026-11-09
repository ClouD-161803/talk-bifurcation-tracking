// the animated diagram of the circular restricted three-body problem (CR3BP) and its rotating
// frame, drawn as inline SVG in a div.cr3bp-frame, with its labels as span.lab[data-lab] typeset by
// MathJax. load this file after theme/beeson.js. the stage of the diagram is set by the shown
// fragment of its slide with data-cr3bp-stage and the highest index, i.e. inertial without such a
// fragment, then units, rotating, body, and mark, at which the third body turns violet. from units
// on, the rotating axes x and y are drawn and turn with the two masses, and they come to rest with
// them as the view turns into the rotating frame. the diagram is animated within a stage and
// between stages while its slide is shown. it is drawn still in the print view, under ?still, and under
// reduced motion, with the primary and the secondary at 30 degrees from the X axis.
//
// the primary and the secondary turn about the barycenter at the angle phi, which equals t in the
// units of the slide. the view is turned by the angle psi, hence the masses and the rotating axes
// are drawn at phi - psi and the inertial axes at -psi. psi is 0 in the inertial stages and phi minus a whole number of
// turns in the rotating stages. between the two, psi follows a cubic Hermite curve, which keeps the
// rate of turn of the view continuous.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const TAU = 2 * Math.PI;
  const STAGES = { units: 1, rotating: 2, body: 3, mark: 4 };
  // the shortest duration of the turn of the view into the rotating frame and back, in s, and the
  // largest mean rate of the turn, in rad/s, beyond which the turn is lengthened
  const TURN = 1.5;
  const TURN_RATE = 1.5;
  // the time constant of a fade, in s, so that a fade settles in about 400 ms, as a fragment does
  const FADE = 0.13;
  const STILL_ANGLE = Math.PI / 6;
  // the scale, in px per unit of length, and the barycenter as a fraction of the size of the zone
  const SCALE = 250;
  const CENTER = [0.5, 0.52];
  // the half length of an axis, and the radii of the primary, the secondary, and the third body,
  // nondimensional
  const AXIS = 1.05;
  const R1 = 0.054, R2 = 0.03, RB = 0.026;
  // the height of the dimension line of the unit length above the line of the two masses
  const DIM = 0.14;
  // the rest point of the third body in the rotating frame, the half widths of its loop, and the
  // period of the loop in s
  const BODY = { x: 0.38, y: 0.6, ax: 0.05, ay: 0.035, period: 12 };
  // the opacity of each group of the drawing at each of the five stages
  const OPACITY = {
    inertial: [1, 1, 0.3, 0.3, 0.3],
    paths: [1, 1, 0.5, 0.5, 0.5],
    rotating: [0, 1, 1, 1, 1],
    unit: [0, 1, 0, 0, 0],
    coords: [0, 0, 1, 1, 1],
    body: [0, 0, 0, 1, 1],
  };

  // the colors are the custom properties of theme/beeson.css, hence the drawing follows a flip of the
  // mode without a redraw. the primary is blue as the Earth, the secondary grey as the Moon, and the
  // third body is violet from the stage mark on
  const CSS = `
.reveal .cr3bp-frame { pointer-events: none; }
.reveal .slides section .zone.cr3bp-frame > svg { overflow: visible; }
.reveal .cr3bp-frame .lab { position: absolute; left: 0; top: 0; white-space: nowrap; line-height: 1; font-size: 36px; color: var(--text); opacity: 0; filter: drop-shadow(0 0 3px var(--bg)) drop-shadow(0 0 1px var(--bg)); }
.reveal .cr3bp-frame .lab[data-lab="X"], .reveal .cr3bp-frame .lab[data-lab="Y"] { color: var(--subtle); }
.reveal .cr3bp-frame .lab[data-lab="one"] { color: var(--violet); }
.cr3bp-frame svg .axis-i { stroke: var(--subtle); fill: var(--subtle); }
.cr3bp-frame svg .axis-r { stroke: var(--text); fill: var(--text); }
.cr3bp-frame svg .path { stroke: var(--stroke); fill: none; }
.cr3bp-frame svg .m1 { fill: var(--data-2); }
.cr3bp-frame svg .m2 { fill: var(--subtle); }
.cr3bp-frame svg .unit { stroke: var(--violet); fill: var(--violet); }
.cr3bp-frame svg .leader { stroke: var(--subtle); }
.cr3bp-frame svg .seg { stroke: var(--text); }
.cr3bp-frame svg .body { fill: var(--text); transition: fill 400ms ease-out; }
.cr3bp-frame.marked svg .body { fill: var(--violet); }
.cr3bp-frame svg line, .cr3bp-frame svg circle.path { stroke-width: 1.5px; vector-effect: non-scaling-stroke; }
.cr3bp-frame svg polygon { stroke: none; }
`;

  const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
  const deg = (a) => (a * 180) / Math.PI;
  const rot = (a, x, y) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  // the same test as Orbits.reduced in src/orbits.ts, with the print view of reveal.js added
  const still = () => {
    const q = location.search;
    return matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-still')
      || /[?&]still\b/.test(q) || /print-pdf/.test(q) || !!window.Reveal?.isPrintView?.();
  };

  function addStyle() {
    if (document.getElementById('cr3bp-frame-style')) return;
    const style = document.createElement('style');
    style.id = 'cr3bp-frame-style';
    style.textContent = CSS;
    document.head.append(style);
  }

  function node(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    parent?.append(e);
    return e;
  }

  // an arrowhead with its tip at (x, y), pointing at the angle a, nondimensional
  function head(parent, x, y, a, len = 0.045, half = 0.018) {
    const [bx, by] = [x - len * Math.cos(a), y - len * Math.sin(a)];
    const [nx, ny] = [-Math.sin(a) * half, Math.cos(a) * half];
    return node('polygon', { points: `${x},${y} ${bx + nx},${by + ny} ${bx - nx},${by - ny}` }, parent);
  }

  // a pair of axes through the origin, each with an arrowhead at its positive end
  function axes(parent, cls) {
    const g = node('g', { class: cls }, parent);
    node('line', { x1: -AXIS, y1: 0, x2: AXIS - 0.03, y2: 0 }, g);
    node('line', { x1: 0, y1: -AXIS, x2: 0, y2: AXIS - 0.03 }, g);
    head(g, AXIS, 0, 0);
    head(g, 0, AXIS, Math.PI / 2);
    return g;
  }

  class Diagram {
    constructor(el) {
      this.el = el;
      this.mu = num(el.dataset.mu, 0.2);
      // data-turn is the period of the two masses on the slide, in s
      this.omega = TAU / num(el.dataset.turn, 10);
      // a diagram cloned with its slide, as in the print view, carries the drawing of its original
      for (const old of el.querySelectorAll(':scope > svg.cr3bp-svg')) old.remove();
      this.labels = {};
      for (const l of el.querySelectorAll('.lab[data-lab]')) this.labels[l.dataset.lab] = l;
      this.build();
      this.clock = 0;
      this.phi = STILL_ANGLE;
      this.bodyTime = 0;
      this.view = { kind: 'inertial', psi: 0 };
      this.stage = -1;
      this.op = Object.fromEntries(Object.keys(OPACITY).map((k) => [k, 0]));
      this.raf = 0;
    }

    build() {
      const W = this.el.offsetWidth || 600, H = this.el.offsetHeight || 800;
      this.cx = W * CENTER[0];
      this.cy = H * CENTER[1];
      const mu = this.mu;
      const svg = node('svg', { class: 'cr3bp-svg', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
      this.el.prepend(svg);
      // the drawing is made in nondimensional units, with y up
      const root = node('g', { transform: `translate(${this.cx} ${this.cy}) scale(${SCALE} ${-SCALE})` }, svg);
      const group = () => node('g', {}, root);
      this.g = { paths: group(), inertial: group(), rotating: group(), coords: group(), body: group(), masses: group() };
      node('circle', { class: 'path', cx: 0, cy: 0, r: mu }, this.g.paths);
      node('circle', { class: 'path', cx: 0, cy: 0, r: 1 - mu }, this.g.paths);
      this.inertialAxes = axes(this.g.inertial, 'axis-i');
      this.rotatingAxes = axes(this.g.rotating, 'axis-r');
      this.leader = node('line', { class: 'leader' }, this.g.coords);
      this.seg1 = node('line', { class: 'seg' }, this.g.body);
      this.seg2 = node('line', { class: 'seg' }, this.g.body);
      this.body = node('circle', { class: 'body', r: RB }, this.g.body);
      // the two masses and the dimension line between them are turned together in this.line
      this.line = node('g', {}, this.g.masses);
      this.g.unit = node('g', { class: 'unit' }, this.line);
      const [a, b] = [-mu, 1 - mu];
      node('line', { x1: a, y1: R1 + 0.03, x2: a, y2: DIM + 0.04 }, this.g.unit);
      node('line', { x1: b, y1: R1 + 0.03, x2: b, y2: DIM + 0.04 }, this.g.unit);
      node('line', { x1: a + 0.04, y1: DIM, x2: b - 0.04, y2: DIM }, this.g.unit);
      head(this.g.unit, a, DIM, Math.PI);
      head(this.g.unit, b, DIM, 0);
      node('circle', { class: 'm1', cx: a, cy: 0, r: R1 }, this.line);
      node('circle', { class: 'm2', cx: b, cy: 0, r: R2 }, this.line);
    }

    // the stage set by the shown fragments of the slide, from 0 to 4
    target() {
      let best = null;
      for (const f of this.el.closest('section')?.querySelectorAll('.fragment.visible[data-cr3bp-stage]') ?? []) {
        if (!best || num(f.dataset.fragmentIndex, 0) >= num(best.dataset.fragmentIndex, 0)) best = f;
      }
      return best ? (STAGES[best.dataset.cr3bpStage] ?? 0) : 0;
    }

    // the angle psi of the view and its rate at this.clock. at the end of a turn of the view,
    // this.view is set to the state that follows the turn
    psi() {
      const v = this.view;
      if (v.kind === 'inertial') return [v.psi, 0];
      if (v.kind === 'rotating') return [this.phi - v.target, this.omega];
      const s = Math.min(1, (this.clock - v.t0) / v.T);
      if (s >= 1) {
        this.view = v.then;
        return this.psi();
      }
      const s2 = s * s, s3 = s2 * s;
      const p = (2 * s3 - 3 * s2 + 1) * v.p0 + (s3 - 2 * s2 + s) * v.T * v.m0 + (-2 * s3 + 3 * s2) * v.p1 + (s3 - s2) * v.T * v.m1;
      const dp = ((6 * s2 - 6 * s) * v.p0 + (3 * s2 - 4 * s + 1) * v.T * v.m0 + (-6 * s2 + 6 * s) * v.p1 + (3 * s2 - 2 * s) * v.T * v.m1) / v.T;
      return [p, dp];
    }

    rotating() {
      return this.view.kind === 'rotating' || (this.view.kind === 'turn' && this.view.then.kind === 'rotating');
    }

    // starts a turn of the view from its angle and rate now. into the rotating frame, the two masses
    // are brought to rest on the horizontal axis at the whole turn nearest to where they would coast
    // in TURN. back to the inertial frame, the view is brought to rest at its nearest whole turn. the
    // end is chosen for a turn of TURN, and the turn is then lengthened to keep its mean rate under
    // TURN_RATE, with the same end
    turn(toRotating) {
      const [p0, m0] = this.psi();
      const end = toRotating
        ? TAU * Math.round((this.phi - p0 + ((this.omega - m0) * TURN) / 2) / TAU)
        : TAU * Math.round((p0 + (m0 * TURN) / 2) / TAU);
      const at = (T) => (toRotating ? this.phi + this.omega * T - end : end);
      const T = Math.max(TURN, Math.abs(at(TURN) - p0) / TURN_RATE);
      const then = toRotating ? { kind: 'rotating', target: end } : { kind: 'inertial', psi: end };
      this.view = { kind: 'turn', t0: this.clock, T, p0, m0, p1: at(T), m1: toRotating ? this.omega : 0, then };
    }

    opacityTarget(name) {
      // the coordinates under the two masses are shown once the masses are at rest
      if (name === 'coords' && this.view.kind === 'turn') return 0;
      return OPACITY[name][Math.max(0, this.stage)];
    }

    /** Sets the stage from the fragments of the slide, animated or at once. */
    sync(animate) {
      const stage = this.target();
      if (stage === this.stage) return;
      const first = this.stage < 0;
      this.stage = stage;
      this.el.classList.toggle('marked', stage >= STAGES.mark);
      const want = stage >= STAGES.rotating;
      if (!animate || first) {
        this.view = want ? { kind: 'rotating', target: TAU * Math.round(this.phi / TAU) } : { kind: 'inertial', psi: 0 };
        for (const k of Object.keys(this.op)) this.op[k] = this.opacityTarget(k);
      } else if (want !== this.rotating()) this.turn(want);
      this.render();
    }

    /** Draws the diagram still at its stage, with the two masses at the angle of a still. */
    still() {
      this.stop();
      this.phi = STILL_ANGLE;
      this.bodyTime = 0;
      this.stage = -1;
      this.sync(false);
    }

    /** Advances the clock by dt, in s, and draws. */
    tick(dt) {
      this.clock += dt;
      this.phi += this.omega * dt;
      this.bodyTime += dt;
      this.psi();
      const k = 1 - Math.exp(-dt / FADE);
      for (const name of Object.keys(this.op)) this.op[name] += (this.opacityTarget(name) - this.op[name]) * k;
      this.render();
    }

    /** Starts the animation, while the slide is shown. */
    start() {
      if (this.raf) return;
      let last = null;
      const frame = (now) => {
        const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000);
        last = now;
        this.tick(dt);
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    }

    /** Stops the animation, and ends a turn of the view and the fades at once. */
    stop() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (this.view.kind === 'turn') this.view = this.view.then;
      if (this.view.kind === 'inertial') this.view.psi = 0;
      for (const k of Object.keys(this.op)) this.op[k] = this.opacityTarget(k);
      this.render();
    }

    // places the label name at (x, y), nondimensional, centered on the point or, with anchor right,
    // with its right edge on it
    place(name, x, y, opacity, anchor = 'center') {
      const l = this.labels[name];
      if (!l) return;
      const shift = anchor === 'right' ? '-100%, -50%' : '-50%, -50%';
      l.style.transform = `translate(${(this.cx + SCALE * x).toFixed(1)}px, ${(this.cy - SCALE * y).toFixed(1)}px) translate(${shift})`;
      l.style.opacity = opacity.toFixed(3);
    }

    render() {
      const mu = this.mu, op = this.op;
      const [psi] = this.psi();
      const alpha = this.phi - psi;
      for (const name of ['paths', 'inertial', 'rotating', 'coords', 'body']) this.g[name].setAttribute('opacity', op[name].toFixed(3));
      this.g.unit.setAttribute('opacity', op.unit.toFixed(3));
      this.inertialAxes.setAttribute('transform', `rotate(${deg(-psi).toFixed(3)})`);
      this.line.setAttribute('transform', `rotate(${deg(alpha).toFixed(3)})`);
      this.rotatingAxes.setAttribute('transform', `rotate(${deg(alpha).toFixed(3)})`);

      // the labels of the two masses turn with them, beyond the ends of the dimension line
      const m1 = rot(alpha, -mu, 0), m2 = rot(alpha, 1 - mu, 0);
      this.place('m1', ...rot(alpha, -mu - 0.15, 0.1), 1);
      this.place('m2', ...rot(alpha, 1 - mu + 0.12, 0.11), 1);
      const [ix, iy] = rot(-psi, AXIS + 0.1, 0), [jx, jy] = rot(-psi, 0, AXIS + 0.1);
      this.place('X', ix, iy, op.inertial);
      this.place('Y', jx, jy, op.inertial);
      this.place('x', ...rot(alpha, AXIS + 0.09, 0), op.rotating);
      this.place('y', ...rot(alpha, 0, AXIS + 0.09), op.rotating);
      const [ux, uy] = rot(alpha, 0.5 - mu, DIM + 0.1);
      this.place('one', ux, uy, op.unit);

      // the coordinates of the two masses below them. the label of the primary is set at the lower
      // left, clear of the y axis, with a leader line to the primary
      const c1 = [m1[0] - 0.13, m1[1] - 0.17];
      this.place('c1', c1[0], c1[1], op.coords, 'right');
      this.leader.setAttribute('x1', m1[0] - R1 * 0.75);
      this.leader.setAttribute('y1', m1[1] - R1 * 0.75);
      this.leader.setAttribute('x2', c1[0] + 0.005);
      this.leader.setAttribute('y2', c1[1] + 0.03);
      this.place('c2', m2[0], m2[1] - 0.17, op.coords);

      // the third body on its loop, and the segments rho_1 and rho_2 from the two masses to it
      const w = (TAU * this.bodyTime) / BODY.period;
      const b = [BODY.x + BODY.ax * Math.sin(w), BODY.y + (BODY.ay * Math.sin(2 * w)) / 2 + (BODY.ay * (1 - Math.cos(w))) / 2];
      this.body.setAttribute('cx', b[0]);
      this.body.setAttribute('cy', b[1]);
      const centroid = [(m1[0] + m2[0] + b[0]) / 3, (m1[1] + m2[1] + b[1]) / 3];
      for (const [seg, m, r, name] of [[this.seg1, m1, R1, 'rho1'], [this.seg2, m2, R2, 'rho2']]) {
        const len = Math.hypot(b[0] - m[0], b[1] - m[1]);
        const [ex2, ey2] = [(b[0] - m[0]) / len, (b[1] - m[1]) / len];
        seg.setAttribute('x1', m[0] + ex2 * (r + 0.012));
        seg.setAttribute('y1', m[1] + ey2 * (r + 0.012));
        seg.setAttribute('x2', b[0] - ex2 * (RB + 0.012));
        seg.setAttribute('y2', b[1] - ey2 * (RB + 0.012));
        // the label is set inside the triangle of the three bodies, off the middle of its segment,
        // since outside it the label of rho_1 would sit on the y axis
        const mid = [(m[0] + b[0]) / 2, (m[1] + b[1]) / 2];
        let [nx, ny] = [-ey2, ex2];
        if (nx * (centroid[0] - mid[0]) + ny * (centroid[1] - mid[1]) < 0) [nx, ny] = [-nx, -ny];
        this.place(name, mid[0] + 0.08 * nx, mid[1] + 0.08 * ny, op.body);
      }
      this.place('m', b[0], b[1] + 0.1, op.body);
    }
  }

  const made = new WeakMap();
  const diagram = (el) => {
    let d = made.get(el);
    if (!d) made.set(el, (d = new Diagram(el)));
    return d;
  };
  const within = (slide) => (slide ? [...slide.querySelectorAll('.cr3bp-frame')].map(diagram) : []);

  function show(slide) {
    for (const d of within(slide)) {
      if (still()) d.still();
      else {
        d.sync(false);
        d.start();
      }
    }
  }

  function ready(slide) {
    if (window.Reveal.isPrintView?.()) return;
    addStyle();
    // every diagram is drawn at its stage, so that a slide is not empty in the overview of reveal.js
    for (const el of document.querySelectorAll('.cr3bp-frame')) diagram(el).still();
    show(slide);
  }

  const deck = window.Reveal;
  deck.on('ready', (ev) => ready(ev.currentSlide));
  deck.on('slidechanged', (ev) => {
    for (const d of within(ev.previousSlide)) d.stop();
    show(ev.currentSlide);
  });
  const step = () => {
    for (const d of within(deck.getCurrentSlide())) d.sync(!still());
  };
  deck.on('fragmentshown', step);
  deck.on('fragmenthidden', step);
  // in the print view, reveal.js clones a slide for each of its steps, and each clone is drawn still
  // at the stage of its own fragments
  deck.on('pdf-ready', () => {
    addStyle();
    for (const el of document.querySelectorAll('.cr3bp-frame')) {
      const d = new Diagram(el);
      made.set(el, d);
      d.still();
    }
  });
  if (deck.isReady()) ready(deck.getCurrentSlide());

  // read in demos/cr3bp-frame/shots.mjs, which steps a diagram frame by frame
  window.Cr3bpFrame = { diagram };
})();
