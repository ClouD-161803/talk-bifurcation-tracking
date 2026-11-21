import type { App } from '../app.ts';
import type { Command } from '../commands.ts';
import { BOXED, CONTAINER, LINE, RESIZABLE, STRETCHED, aspectOf, captionEls, captionsOf, pictureReach, constrained, cssWidth, frameOf, frameRect, isTextSized, kindOf, movableOf, objectsOf, orientedBox, pictureOf, pictureSize, sizedOf, snapBoxOf, toSlide, unturnedRect } from '../canvas/hit.ts';
import type { Box } from '../canvas/snap.ts';
import { angleOf, locked, placeOf, record, withCorners, writePlace, type Change, type Place } from '../canvas/drag.ts';
import { groupFrame, groupReach, turned } from '../canvas/frames.ts';
import { groupAngle, groupOf } from './order.ts';
import { declarationProblem } from '../model/scope.ts';
import { store } from '../ui/dom.ts';

export type Side = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export const SIDES: Side[] = ['left', 'center', 'right', 'top', 'middle', 'bottom'];
const SIDE_LABELS: Record<Side, string> = { left: 'Left', center: 'Center', right: 'Right', top: 'Top', middle: 'Middle', bottom: 'Bottom' };

let reference: 'slide' | 'selection' = 'slide';

let lastSize: { axis: 'w' | 'h'; objects: Element[]; shown: number[]; changes: Change[]; fitted: Element[] } | null = null;

function simplest(lo: number, hi: number): number {
  let [a, b, c, d] = [0, 1, 1, 0];
  for (let i = 0; i < 100; i++) {
    const p = a + c, q = b + d;
    if (p / q < lo) [a, b] = [p, q];
    else if (p / q > hi) [c, d] = [p, q];
    else return p / q;
  }
  return (lo + hi) / 2;
}

export function selectedTargets(app: App): Element[] {
  if (app.selection.kind === 'text') {
    const host = app.selection.items[0];
    const el = host ? (movableOf(app, host) ?? host) : null;
    return el && app.pairing?.elements.get(el)?.open ? [el] : [];
  }
  return app.selection.elements().filter((el) => app.pairing?.elements.get(el)?.open && !el.matches('.backdrop'));
}

export function targetsOf(app: App, arg?: unknown): Element[] {
  const given = (arg as { els?: Element[] } | undefined)?.els;
  if (given) return given.filter((el) => el.isConnected && !el.matches('.backdrop'));
  return objectsOf(app, selectedTargets(app));
}

export const sizedTarget = (el: Element): Element => (el.matches(CONTAINER) ? pictureOf(el) : el);

export const boxOf = (app: App, el: Element): Box => toSlide(frameOf(app), frameRect(el));

export function groupBoxOf(app: App, els: Element[]): Box | null {
  const id = els.length > 1 ? groupOf(els[0]) : null;
  if (!id || !els.every((el) => groupOf(el) === id)) return null;
  return toSlide(frameOf(app), groupReach(els));
}

export function groupFrameOf(app: App, els: Element[]): { box: Box; deg: number } | null {
  if (!groupBoxOf(app, els)) return null;
  const deg = groupAngle(app, els) ?? 0;
  return { box: toSlide(frameOf(app), groupFrame(els, deg)), deg };
}

function scaleGroup(app: App, els: Element[], frame: { box: Box; deg: number }, kx: number, ky: number): Change[] {
  const f = frameOf(app);
  const corner = turned(frame.box, frame.deg, frame.box.left, frame.box.top);
  const a = (frame.deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const changes: Change[] = [];
  for (const el of els.filter((el) => !locked(el) && !els.some((o) => o !== el && o.contains(el)))) {
    const s = sizedTarget(el), pic = pictureOf(el), deg = angleOf(el);
    const point = () => {
      const b = toSlide(f, orientedBox(pic, f.scale, deg)), up = isTextSized(pic) ? b.height / 2 : 0, r = (deg * Math.PI) / 180;
      return { b, x: b.left + b.width / 2 + up * Math.sin(r), y: b.top + b.height / 2 - up * Math.cos(r) };
    };
    const was = point(), place = placeOf(el), size = placeOf(s);
    if (s.matches(RESIZABLE) || isTextSized(s)) {
      const stretch = s.matches(STRETCHED) && (kx !== ky || (size.height ?? null) !== null || s.matches(BOXED));
      writePlace(app, s, { ...size, width: Math.max(1, cssWidth(s, was.b.width * kx)), height: stretch ? Math.max(1, was.b.height * ky) : size.height });
    }
    const vx = was.x - corner.x, vy = was.y - corner.y;
    const lx = (vx * cos + vy * sin) * kx, ly = (vy * cos - vx * sin) * ky;
    const now = point(), at = placeOf(el);
    writePlace(app, el, { ...at, translate: { x: (at.translate?.x ?? 0) + corner.x + lx * cos - ly * sin - now.x, y: (at.translate?.y ?? 0) + corner.y + lx * sin + ly * cos - now.y } });
    changes.push({ el, from: place, to: placeOf(el) });
    if (s !== el) changes.push({ el: s, from: size, to: placeOf(s) });
  }
  return changes;
}

function slideBox(app: App): Box {
  const slides = app.slides() as HTMLElement;
  return { left: 0, top: 0, width: slides.offsetWidth || 1920, height: slides.offsetHeight || 1080 };
}

const union = (boxes: Box[]): Box => {
  const left = Math.min(...boxes.map((b) => b.left)), top = Math.min(...boxes.map((b) => b.top));
  return { left, top, width: Math.max(...boxes.map((b) => b.left + b.width)) - left, height: Math.max(...boxes.map((b) => b.top + b.height)) - top };
};

function objects(app: App): { els: Element[]; b: Box }[] {
  const byGroup = new Map<string | Element, Element[]>();
  for (const el of targetsOf(app)) {
    const key = groupOf(el) ?? el;
    byGroup.set(key, [...(byGroup.get(key) ?? []), el]);
  }
  return [...byGroup.values()].map((els) => ({ els, b: groupBoxOf(app, els) ?? boxOf(app, els[0]) }));
}

function shift(app: App, label: string, moves: { el: Element; dx: number; dy: number }[]): void {
  const changes = moves.map(({ el, dx, dy }) => {
    const from = placeOf(el);
    const to: Place = { ...from, translate: { x: (from.translate?.x ?? 0) + dx, y: (from.translate?.y ?? 0) + dy } };
    writePlace(app, el, to);
    return { el, from, to: placeOf(el) };
  });
  record(app, label, changes);
  app.invalidate('content');
}

function align(app: App, side: Side): void {
  const items = objects(app);
  if (!items.length) return;
  const toEach = reference === 'selection' && items.length > 1;
  const ref = toEach ? union(items.map((i) => i.b)) : slideBox(app);
  const whole = union(items.map((i) => i.b));
  const at = (b: Box) => {
    switch (side) {
      case 'left': return { dx: ref.left - b.left, dy: 0 };
      case 'center': return { dx: ref.left + ref.width / 2 - (b.left + b.width / 2), dy: 0 };
      case 'right': return { dx: ref.left + ref.width - (b.left + b.width), dy: 0 };
      case 'top': return { dx: 0, dy: ref.top - b.top };
      case 'middle': return { dx: 0, dy: ref.top + ref.height / 2 - (b.top + b.height / 2) };
      case 'bottom': return { dx: 0, dy: ref.top + ref.height - (b.top + b.height) };
    }
  };
  shift(app, `align ${side}`, items.flatMap((i) => i.els.map((el) => ({ el, ...at(toEach ? i.b : whole) }))));
}

function distribute(app: App, axis: 'x' | 'y'): void {
  const items = objects(app);
  if (!items.length) return;
  const start = (b: Box) => (axis === 'x' ? b.left : b.top);
  const size = (b: Box) => (axis === 'x' ? b.width : b.height);
  items.sort((a, b) => start(a.b) - start(b.b) || size(a.b) - size(b.b));
  const n = items.length;
  const ref = n === 1 ? slideBox(app) : union(items.map((i) => i.b));
  const lo = start(ref), hi = lo + size(ref);
  const first = items[0].b, last = items[n - 1].b;
  const f = start(first), z = start(last);
  const to = new Map<Box, number>(n === 1 ? [[first, lo + (size(ref) - size(first)) / 2]] : [[first, f], [last, z]]);
  const inner = items.slice(1, -1).map((i) => i.b);
  const gap = n === 1 ? 0 : (z - f - size(first) - inner.reduce((s, b) => s + size(b), 0)) / (n - 1);
  let at = f + size(first) + gap;
  inner.forEach((b) => {
    to.set(b, Math.min(Math.max(at, lo), Math.max(lo, hi - size(b))));
    at += size(b) + gap;
  });
  const moves = items.flatMap((i) => {
    const d = to.get(i.b)! - start(i.b);
    return i.els.map((el) => ({ el, dx: axis === 'x' ? d : 0, dy: axis === 'y' ? d : 0 }));
  });
  shift(app, `distribute ${axis === 'x' ? 'horizontally' : 'vertically'}`, moves);
}

const canDistribute = (app: App) => {
  const n = objects(app).length;
  return n === 1 || n >= 3;
};

export const resizable = (els: Element[]) => els.length > 0 && els.map(sizedTarget).every((el) => el.matches(RESIZABLE) || isTextSized(el));
export const heightSet = (els: Element[]) => els.length > 0 && els.map(sizedTarget).every((el) => el.matches(RESIZABLE));

export function offsetOf(el: Element): { x: number; y: number } {
  const t = placeOf(el).translate;
  return { x: t?.x ?? 0, y: t?.y ?? 0 };
}

export function unturnedBoxOf(app: App, el: Element): Box {
  const deg = el.matches(LINE) ? 0 : angleOf(el);
  if (!deg) return snapBoxOf(app, el);
  const f = frameOf(app);
  return toSlide(f, captionsOf(el).length ? unturnedRect(el).box : orientedBox(pictureOf(el), f.scale, deg));
}

export const cornerBoxOf = (app: App, els: Element[], lead: Element): Box => groupFrameOf(app, els)?.box ?? unturnedBoxOf(app, lead);

export function positionOf(app: App, el: Element): { x: number; y: number } {
  const b = unturnedBoxOf(app, el);
  return { x: Math.round(b.left), y: Math.round(b.top) };
}

export const sizeOf = (el: Element): { w: number; h: number } => pictureSize(sizedTarget(el));

export function captionHeight(app: App, el: Element): number {
  if (!el.matches(CONTAINER) || !captionsOf(el).length) return 0;
  const { box, picture } = unturnedRect(el);
  return Math.max(0, box.height - picture.height) / frameOf(app).scale;
}

export function commands(): Command[] {
  const list: Command[] = [];
  for (const [i, side] of SIDES.entries()) {
    list.push({
      id: `arrange.align.${side}`,
      label: `Align ${SIDE_LABELS[side]}`,
      menu: { bar: 'Arrange', group: i < 3 ? 'x' : 'y', order: 20 + i, submenu: 'Align' },
      context: ['element'],
      undoable: true,
      enabled: (app) => targetsOf(app).length > 0,
      run: (app) => align(app, side),
    });
  }
  for (const [i, ref] of (['slide', 'selection'] as const).entries()) {
    list.push({
      id: `arrange.alignTo.${ref}`,
      label: ref === 'slide' ? 'Align to Slide' : 'Align to Selection',
      menu: { bar: 'Arrange', group: 'reference', order: 30 + i, submenu: 'Align' },
      context: ['element'],
      enabled: (app) => ref === 'slide' || objects(app).length !== 1,
      checked: (app) => (objects(app).length === 1 ? ref === 'slide' : reference === ref),
      run: (app) => {
        reference = ref;
        app.invalidate('selection');
      },
    });
  }
  for (const [i, axis] of (['x', 'y'] as const).entries()) {
    list.push({
      id: `arrange.distribute.${axis === 'x' ? 'horizontal' : 'vertical'}`,
      label: axis === 'x' ? 'Distribute Horizontally' : 'Distribute Vertically',
      menu: { bar: 'Arrange', group: 'distribute', order: 40 + i, submenu: 'Distribute' },
      context: ['element'],
      undoable: true,
      enabled: canDistribute,
      run: (app) => distribute(app, axis),
    });
  }
  list.push({
    id: 'arrange.distribute.evenly',
    label: 'Distribute Evenly',
    menu: { bar: 'Arrange', group: 'distribute', order: 42, submenu: 'Distribute' },
    context: ['element'],
    undoable: true,
    enabled: canDistribute,
    run: (app) => {
      distribute(app, 'x');
      distribute(app, 'y');
    },
  });
  list.push({
    id: 'arrange.setPosition',
    label: 'Position',
    undoable: true,
    enabled: (app) => targetsOf(app).length > 0,
    run: (app, arg) => {
      const a = (arg ?? {}) as { x?: number; y?: number };
      const els = targetsOf(app, arg);
      const group = groupFrameOf(app, els)?.box;
      const changes = els.map((el) => {
        const from = placeOf(el);
        const now = offsetOf(el);
        const at = group ?? unturnedBoxOf(app, el);
        const to = (v: number | undefined, off: number, edge: number) => (v === undefined ? off : Math.round(off + v - edge));
        writePlace(app, el, { ...from, translate: { x: to(a.x, now.x, at.left), y: to(a.y, now.y, at.top) } });
        return { el, from, to: placeOf(el) };
      });
      record(app, 'position', changes);
      app.invalidate('content');
    },
  });
  list.push({
    id: 'arrange.setSize',
    label: 'Size',
    undoable: true,
    enabled: (app) => resizable(targetsOf(app)) || !!groupBoxOf(app, targetsOf(app)),
    run: (app, arg) => {
      const typed = (arg ?? {}) as { w?: number; h?: number };
      const a = typed;
      let frame = groupFrameOf(app, targetsOf(app, arg));
      if (frame) {
        const all = targetsOf(app, arg);
        const keep = all.flatMap(sizedOf).filter((m) => m.matches(STRETCHED) && m.getClientRects().length).every(constrained);
        const changes = new Map<Element, Change>();
        const start = frame.deg ? frame.box : null;
        for (let pass = 0; frame && pass < 4; pass++) {
          const off = (v: number | undefined, now: number) => v !== undefined && Math.round(now) !== Math.round(v);
          if (!off(a.w, frame.box.width) && !off(a.h, frame.box.height)) break;
          const kw = a.w !== undefined ? a.w / frame.box.width : null, kh = a.h !== undefined ? a.h / frame.box.height : null;
          const kx = kw ?? (keep && kh ? kh : 1), ky = kh ?? (keep && kw ? kw : 1);
          for (const c of scaleGroup(app, all, frame, kx, ky)) changes.set(c.el, { ...c, from: changes.get(c.el)?.from ?? c.from });
          frame = groupFrameOf(app, all);
        }
        if (frame && start) {
          const dx = start.left - frame.box.left, dy = start.top - frame.box.top;
          for (const el of all.filter((el) => !locked(el) && !all.some((o) => o !== el && o.contains(el)))) {
            const at = placeOf(el);
            writePlace(app, el, { ...at, translate: { x: (at.translate?.x ?? 0) + dx, y: (at.translate?.y ?? 0) + dy } });
            changes.set(el, { el, from: changes.get(el)?.from ?? at, to: placeOf(el) });
          }
        }
        record(app, 'resize', [...changes.values()]);
        app.invalidate('content');
        return;
      }
      const objects = targetsOf(app, arg);
      const els = objects.map(sizedTarget);
      if (!resizable(els)) return;
      const caps = objects.map((o) => captionHeight(app, o));
      const axis = typed.w !== undefined ? 'w' : 'h';
      const value = typed[axis];
      const back = lastSize;
      lastSize = null;
      const same = (a: Place, b: Place) => JSON.stringify(a) === JSON.stringify(b);
      if (back && value !== undefined && back.axis === axis && back.objects.length === objects.length && back.objects.every((o, i) => o === objects[i]) && back.shown.every((v) => Math.abs(v - value) < 0.5) && back.changes.every((c) => same(placeOf(c.el), c.to))) {
        for (const c of [...back.changes].reverse()) writePlace(app, c.el, c.from);
        record(app, 'resize', back.changes.map((c) => ({ el: c.el, from: c.to, to: c.from })));
        for (const el of back.fitted) app.doc.setTag(el, { style: { 'object-fit': null } }, 'resize');
        app.invalidate('content');
        return;
      }
      const shown = objects.map((o, i) => (axis === 'w' ? sizeOf(o).w : sizeOf(o).h + caps[i]));
      const fitted: Element[] = [];
      const corners = objects.map((o) => ({ o, box: unturnedBoxOf(app, o), from: placeOf(o) }));
      const kept = new Set<number>();
      const changes = withCorners(app, els, () => els.map((el, i) => {
        const from = placeOf(el);
        const now = sizeOf(el);
        const cs = getComputedStyle(el);
        const edge = (side: string) => (parseFloat(cs.getPropertyValue(`padding-${side}`)) || 0) + (parseFloat(cs.getPropertyValue(`border-${side}-width`)) || 0);
        const pad = { w: edge('left') + edge('right'), h: edge('top') + edge('bottom') };
        const box = { w: (el as HTMLElement).offsetWidth - pad.w, h: (el as HTMLElement).offsetHeight - pad.h };
        const boxed = el.matches(STRETCHED) && constrained(el) && cs.objectFit === 'contain' && (box.w - now.w > 0.5 || box.h - now.h > 0.5);
        const ratio = boxed ? simplest((box.h - 0.5) / box.w, (box.h + 0.5) / box.w) : 0;
        if (boxed) kept.add(i);
        if (boxed && !(el as HTMLElement).style.objectFit) {
          app.doc.setTag(el, { style: { 'object-fit': 'contain' } }, 'resize');
          fitted.push(el);
        }
        const put = (a: { w?: number; h?: number }) => {
          if (isTextSized(el)) {
            if (a.w !== undefined) writePlace(app, el, { ...from, width: Math.max(1, cssWidth(el, a.w)) });
          } else if (boxed) {
            const k = a.w !== undefined ? a.w / now.w : a.h !== undefined ? a.h / now.h : 1;
            const w = Math.max(1, Math.round(box.w * k + pad.w));
            writePlace(app, el, { ...from, width: w, height: Math.max(1, (w - pad.w) * ratio + pad.h) });
          } else if (el.matches(STRETCHED)) {
            const keep = constrained(el);
            const aspect = now.w / Math.max(1, now.h);
            let w = now.w, h = now.h;
            if (a.w !== undefined) [w, h] = [a.w, keep ? a.w / aspect : now.h];
            else if (a.h !== undefined) [w, h] = [keep ? a.h * aspect : now.w, a.h];
            const stretch = !keep || (from.height ?? null) !== null || el.matches(BOXED);
            writePlace(app, el, { ...from, width: Math.max(1, w), height: stretch ? Math.max(1, h) : null });
          } else {
            const aspect = aspectOf(el) ?? now.w / Math.max(1, now.h);
            const w = a.w ?? (a.h !== undefined ? a.h * aspect : now.w);
            writePlace(app, el, { ...from, width: Math.max(1, w) });
          }
        };
        const h = typed.h;
        const left = (cap: number) => (h !== undefined && h - cap >= 1 ? { ...typed, h: h - cap } : typed);
        put(left(caps[i]));
        for (let pass = 0, cap = caps[i]; h !== undefined && cap && h - cap >= 1 && pass < 4; pass++) {
          const now = captionHeight(app, objects[i]);
          if (Math.abs(now - cap) < 0.5) break;
          put(left((cap = now)));
        }
        const to = placeOf(el);
        if (h !== undefined && to.width != null && (boxed || (to.height ?? null) === null) && !isTextSized(el)) {
          const read = () => sizeOf(el).h + captionHeight(app, objects[i]);
          const wide = (d: number) => Math.max(1, to.width! + d);
          const sized = (w: number | null): Place => ({ ...to, width: w, ...(boxed && { height: w === null ? null : Math.max(1, (w - pad.w) * ratio + pad.h) }) });
          const gap = () => (boxed ? ((el as HTMLElement).offsetHeight - pad.h - sizeOf(el).h) / 2 : 0);
          const best = [0, -1, 1].map((d) => {
            writePlace(app, el, sized(wide(d)));
            return { d, off: Math.abs(read() - h) };
          }).reduce((a, b) => (b.off + 0.01 < a.off ? b : a));
          writePlace(app, el, sized(wide(best.d)));
          if (caps[i]) {
            writePlace(app, el, sized(null));
            if (Math.round(read()) !== Math.round(h)) writePlace(app, el, sized(wide(best.d)));
          }
          if (caps[i] && Math.round(read()) !== Math.round(h)) {
            const w0 = wide(best.d), slope = (sizeOf(el).h + gap()) / w0;
            const seen = new Map<number, { h: number; cap: number }>();
            const at = (w: number) => {
              let m = seen.get(w);
              if (!m) {
                writePlace(app, el, sized(w));
                seen.set(w, (m = { h: read(), cap: captionHeight(app, objects[i]) - gap() }));
              }
              return m;
            };
            const solve = (t: number, a0: number, b0: number) => {
              const off = (w: number) => Math.abs(Math.round(at(w).h) - t);
              const nearer = (w: number, d: number) => d < near.d || (d === near.d && (d === 0 ? Math.abs(w - w0) < Math.abs(near.w - w0) || (Math.abs(w - w0) === Math.abs(near.w - w0) && w < near.w) : w < near.w));
              const near = { w: w0, d: off(w0) };
              const take = (w: number) => {
                const d = off(w);
                if (nearer(w, d)) Object.assign(near, { w, d });
              };
              const bound = (a: number, b: number) => {
                const lo = (slope / 1.01) * a - 1 + at(b).cap, hi = slope * 1.01 * b + 1 + at(a).cap;
                return Math.max(0, Math.ceil(lo - 0.5) - t, t - Math.floor(hi + 0.5));
              };
              const open = (a: number, b: number) => {
                const d = bound(a, b);
                if (d !== near.d) return d < near.d;
                const w = near.d === 0 ? Math.min(b, Math.max(a, w0)) : a;
                return nearer(w, d);
              };
              const last = b0 || Math.max(w0 + 1, Math.ceil((t + near.d + 2) / (slope / 1.01)));
              const spans: [number, number][] = [[a0, w0], [w0, last]];
              for (const w of [a0, last]) take(w);
              while (spans.length) {
                const [a, b] = spans.pop()!;
                if (b - a < 2 || !open(a, b)) continue;
                const A = at(a), B = at(b);
                if (Math.abs(A.cap - B.cap) < 0.5) {
                  const w = Math.round(a + ((t - A.h) * (b - a)) / Math.max(0.01, B.h - A.h));
                  for (const v of [w - 1, w, w + 1]) if (v > a && v < b) take(v);
                  continue;
                }
                const m = Math.floor((a + b) / 2);
                take(m);
                const halves: [number, number][] = [[a, m], [m, b]];
                spans.push(...(m < w0 ? halves : halves.reverse()));
              }
              return near;
            };
            const words = captionEls(objects[i])[0];
            const style = words && getComputedStyle(words);
            const line = style ? parseFloat(style.lineHeight) || 1.2 * parseFloat(style.fontSize) : 0;
            let stop = w0;
            for (let lowest = at(w0).h; stop > 1; ) {
              stop = Math.max(1, Math.floor(stop * 0.85));
              const now = at(stop).h;
              if (now > lowest + 1.5 * line) break;
              lowest = Math.min(lowest, now);
            }
            const low = stop < w0 ? solve(0, stop, w0).w : w0;
            writePlace(app, el, sized(solve(h, low, 0).w));
          }
          const at = placeOf(el);
          if (boxed && at.height != null) {
            const off = () => Math.abs(Math.round(read()) - Math.round(h));
            let best = { d: 0, off: off() };
            for (const d of [1, -1, 2, -2]) {
              if (!best.off) break;
              writePlace(app, el, { ...at, height: Math.max(1, at.height + d) });
              if (off() < best.off) best = { d, off: off() };
            }
            writePlace(app, el, { ...at, height: Math.max(1, at.height + best.d) });
          }
        }
        return { el, from, to: placeOf(el) };
      }));
      for (const [i, t] of corners.entries()) {
        if (!angleOf(t.o) && !kept.has(i)) continue;
        const b = unturnedBoxOf(app, t.o), dx = t.box.left - b.left, dy = t.box.top - b.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        const at = placeOf(t.o);
        writePlace(app, t.o, { ...at, translate: { x: (at.translate?.x ?? 0) + dx, y: (at.translate?.y ?? 0) + dy } });
        const c = changes.find((c) => c.el === t.o);
        if (c) c.to = placeOf(t.o);
        else changes.push({ el: t.o, from: t.from, to: placeOf(t.o) });
      }
      const moved = record(app, 'resize', changes);
      if (moved.length) lastSize = { axis, objects, shown, changes: moved.map((c) => ({ ...c })), fitted };
      app.invalidate('content');
    },
  });
  list.push({
    id: 'arrange.constrainProportions',
    label: 'Constrain Proportions',
    enabled: (app) => picturesOf(app).some(heightWritten),
    checked: (app) => {
      const pics = picturesOf(app);
      return pics.length > 0 && pics.every(constrained);
    },
    run: (app) => {
      const pics = picturesOf(app).filter(heightWritten);
      const on = !pics.every(constrained);
      for (const m of pics) store(`beeson-edit-constrain-${kindOf(m)}`, on ? 'on' : 'off');
      app.invalidate('selection');
    },
  });
  return list;
}

const picturesOf = (app: App): Element[] => [...new Set(targetsOf(app).flatMap(sizedOf))].filter((m) => m.matches(RESIZABLE) && m.getBoundingClientRect().width > 0);
const heightWritten = (el: Element): boolean => declarationProblem(el.localName, [...el.classList], 'height', '1px') === null;

export function install(app: App): void {
  for (const c of commands()) app.commands.define(c);
}
