import type { Deck } from './reveal.d.ts';

const PINCH = 0.7;

const PAUSE = 150;

const FULL = 1.03;

const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

export function initOverview(deck: Deck): void {
  const reveal = deck.getRevealElement() as HTMLElement;

  let swipe = { x: 0, y: 0, from: 0, to: 0, step: 0, last: -Infinity };
  const width = () => {
    const slides = deck.getHorizontalSlides();
    const h = deck.getIndices().h;
    const next = slides[h + 1] ?? slides[h - 1];
    return next ? Math.abs(next.getBoundingClientRect().left - slides[h].getBoundingClientRect().left) : 0;
  };
  const onWheel = (ev: WheelEvent) => {
    if (ev.ctrlKey) return;
    ev.preventDefault();
    const unit = ev.deltaMode === 1 ? 40 : ev.deltaMode === 2 ? window.innerWidth : 1;
    const h = deck.getIndices().h;
    if (ev.timeStamp - swipe.last > PAUSE) swipe = { x: 0, y: 0, from: h, to: h, step: width(), last: 0 };
    swipe.from += h - swipe.to;
    swipe.to = h;
    swipe.last = ev.timeStamp;
    swipe.x += ev.deltaX * unit;
    swipe.y += ev.deltaY * unit;
    if (Math.abs(ev.deltaX) <= Math.abs(ev.deltaY)) return;
    if (!swipe.step || Math.abs(swipe.x) <= Math.abs(swipe.y)) return;
    const passed = Math.sign(swipe.x) * Math.ceil(Math.abs(swipe.x) / swipe.step);
    swipe.to = Math.min(Math.max(swipe.from + passed, 0), deck.getHorizontalSlides().length - 1);
    if (swipe.to !== h) deck.slide(swipe.to);
  };

  deck.on('overviewshown', () => {
    window.addEventListener('wheel', onWheel, { passive: false });
    reveal.style.touchAction = 'none';
  });
  deck.on('overviewhidden', () => {
    window.removeEventListener('wheel', onWheel);
    reveal.style.touchAction = '';
  });

  let pinch: { from: number; x: number; y: number } | null = null;
  document.addEventListener('touchstart', (ev) => {
    pinch = null;
    if (ev.touches.length !== 2) return;
    const zoom = window.visualViewport?.scale ?? 1;
    const own = ev.target instanceof Element && ev.target.closest('tycho-viewer');
    if (!deck.isOverview() && (zoom >= FULL || own)) return;
    const [a, b] = [ev.touches[0], ev.touches[1]];
    pinch = { from: distance(ev.touches), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }, { passive: true });
  const read = (scale: number) => {
    if (!pinch) return;
    if (!deck.isOverview() && scale < PINCH) {
      pinch = null;
      deck.toggleOverview(true);
    } else if (deck.isOverview() && scale > 1 / PINCH) {
      const under = document.elementFromPoint(pinch.x, pinch.y)?.closest<HTMLElement>('.slides section:not(.stack)');
      pinch = null;
      deck.toggleOverview(false);
      if (under) deck.slide(Number(under.dataset.indexH), Number(under.dataset.indexV ?? 0));
    }
  };
  document.addEventListener('touchmove', (ev) => {
    if (pinch && ev.touches.length === 2) read(distance(ev.touches) / pinch.from);
  }, { passive: true });
  const lift = (ev: TouchEvent) => { if (ev.touches.length < 2) pinch = null; };
  document.addEventListener('touchend', lift, { passive: true });
  document.addEventListener('touchcancel', lift, { passive: true });
  const gesture = (ev: Event) => {
    const scale = (ev as Event & { scale: number }).scale;
    if (!pinch) return;
    if (deck.isOverview() || scale < 1) ev.preventDefault();
    read(scale);
  };
  document.addEventListener('gesturestart', gesture, { passive: false });
  document.addEventListener('gesturechange', gesture, { passive: false });
}
