type Box = { x: number; y: number; w: number };

function box(nodes: Element[]): Box | null {
  const rects = nodes.map((n) => n.getBoundingClientRect()).filter((r) => r.width > 0 || r.height > 0);
  if (!rects.length) return null;
  const left = Math.min(...rects.map((r) => r.left)), right = Math.max(...rects.map((r) => r.right));
  const top = Math.min(...rects.map((r) => r.top)), bottom = Math.max(...rects.map((r) => r.bottom));
  return { x: (left + right) / 2, y: (top + bottom) / 2, w: right - left };
}

function flyIn(slide: Element, el: HTMLElement): void {
  const from = box([...slide.querySelectorAll(el.dataset.flyFrom ?? '')]);
  const to = box(el.dataset.flyTo ? [...el.querySelectorAll(el.dataset.flyTo)] : [el]);
  const own = el.getBoundingClientRect();
  if (!from || !to || !to.w || !el.offsetWidth) return;
  const k = own.width / el.offsetWidth;
  const seconds = Number(el.dataset.flyDuration ?? 1.2);
  el.style.transition = 'none';
  el.style.transformOrigin = `${(to.x - own.left) / k}px ${(to.y - own.top) / k}px`;
  el.style.transform = `translate(${(from.x - to.x) / k}px, ${(from.y - to.y) / k}px) scale(${from.w / to.w})`;
  void el.offsetWidth;
  el.style.transition = `transform ${seconds}s cubic-bezier(0.45, 0, 0.25, 1), opacity 0s`;
  el.style.transform = '';
  setTimeout(() => {
    el.style.transition = '';
    el.style.transformOrigin = '';
  }, seconds * 1000 + 50);
}

export function fly(slide: Element, shown: Element[]): void {
  for (const f of shown) {
    for (const el of [f, ...f.querySelectorAll('[data-fly-from]')]) {
      if (el instanceof HTMLElement && el.dataset.flyFrom) flyIn(slide, el);
    }
  }
}
