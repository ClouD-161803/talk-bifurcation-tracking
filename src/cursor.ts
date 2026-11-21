import { Orbits } from './orbits.ts';

const REACH = 20;

let dot: HTMLDivElement | null = null;

export function togglePointer(): void {
  if (dot) { dot.remove(); dot = null; return; }
  dot = document.createElement('div');
  dot.className = 'pointer-dot';
  dot.setAttribute('aria-hidden', 'true');
  Object.assign(dot.style, {
    position: 'fixed', left: '0', top: '0', width: '14px', height: '14px', boxSizing: 'border-box',
    border: '2px solid var(--accent, #e77500)', borderRadius: '50%', pointerEvents: 'none',
    transform: 'translate(-50%, -50%)', zIndex: '2147483000', display: 'none',
  });
  document.body.append(dot);
}

type Tinted = { el: HTMLElement; glow(clientX: number | null, clientY?: number, r?: number): void };

export function initCursor(orbits: () => Tinted[], slide: () => HTMLElement | null, tintOn = true): void {
  let last: { x: number; y: number } | null = null, frame = 0;
  const lit = new Set<Tinted>();
  const update = () => {
    frame = 0;
    const current = slide();
    for (const o of orbits()) {
      const r = o.el.getBoundingClientRect();
      const over = last && current?.contains(o.el) && last.x >= r.left && last.x <= r.right && last.y >= r.top && last.y <= r.bottom;
      if (over && last) { o.glow(last.x, last.y, REACH); lit.add(o); }
      else if (lit.has(o)) { o.glow(null); lit.delete(o); }
    }
  };
  const tint = tintOn && !Orbits.reduced();
  document.addEventListener('pointermove', (ev) => {
    if (dot) {
      dot.style.display = 'block';
      dot.style.left = `${ev.clientX}px`;
      dot.style.top = `${ev.clientY}px`;
    }
    if (!tint) return;
    last = { x: ev.clientX, y: ev.clientY };
    if (!frame) frame = requestAnimationFrame(update);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => {
    if (dot) dot.style.display = 'none';
    last = null;
    if (tint && !frame) frame = requestAnimationFrame(update);
  });
}
