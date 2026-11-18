// the gestures of the overview of reveal.js, next to its keys and its swipe of one finger. in the
// overview, the row of slides is moved with a sideways wheel, i.e. a swipe of two fingers on a
// trackpad or a horizontal mouse wheel, and a slide is shown with a pinch open. on a touch screen at
// the full view, the overview is opened with a pinch closed. a pinch on a zoomed page, and a pinch
// on a trackpad, are left to the zoom of the browser

import type { Deck } from './reveal.d.ts';

// a pinch is taken once the distance between the two fingers is this fraction of its start, or its
// inverse
const PINCH = 0.7;

// a wheel after this pause, in ms, starts a new swipe
const PAUSE = 150;

// the page is at its full view below this scale of the visual viewport, which is 1 at the full view
// of a deck with the viewport of the template
const FULL = 1.03;

const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

export function initOverview(deck: Deck): void {
  const reveal = deck.getRevealElement() as HTMLElement;

  // the distance in px of a swipe, summed since its start, the slide at which it set off, the slide
  // it showed last, the width of a slide in the row, and the time of its last wheel
  let swipe = { x: 0, y: 0, from: 0, to: 0, step: 0, last: -Infinity };
  // the slides of the row are as far apart on the screen as their left edges. the width is measured
  // once per swipe, since a read of a box after a move of the row forces a layout
  const width = () => {
    const slides = deck.getHorizontalSlides();
    const h = deck.getIndices().h;
    const next = slides[h + 1] ?? slides[h - 1];
    return next ? Math.abs(next.getBoundingClientRect().left - slides[h].getBoundingClientRect().left) : 0;
  };
  // the row is moved by a slide as soon as a swipe sets off, and by one more slide at each width of
  // a slide that the swipe covers. the browser goes back or forward in its history at a sideways
  // swipe of two fingers on a Mac unless the wheel is prevented. in Chrome, the rest of a swipe is
  // not prevented once its first wheel is not. a deck does not scroll, hence every wheel is
  // prevented. a wheel with Ctrl is a pinch on a trackpad, which is left to the zoom of the page
  const onWheel = (ev: WheelEvent) => {
    if (ev.ctrlKey) return;
    ev.preventDefault();
    const unit = ev.deltaMode === 1 ? 40 : ev.deltaMode === 2 ? window.innerWidth : 1;
    const h = deck.getIndices().h;
    if (ev.timeStamp - swipe.last > PAUSE) swipe = { x: 0, y: 0, from: h, to: h, step: width(), last: 0 };
    // a slide shown otherwise during a swipe, e.g. with a key, moves the swipe with it
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

  // the overview takes every touch, so that a pinch open does not zoom the page as well
  deck.on('overviewshown', () => {
    window.addEventListener('wheel', onWheel, { passive: false });
    reveal.style.touchAction = 'none';
  });
  deck.on('overviewhidden', () => {
    window.removeEventListener('wheel', onWheel);
    reveal.style.touchAction = '';
  });

  // the browser cancels the pointers of a pinch that it zooms, hence a pinch is read from the touch
  // events, which are sent to its end. pinch is null while fewer than two fingers touch, and after a
  // pinch is taken
  let pinch: { from: number; x: number; y: number } | null = null;
  document.addEventListener('touchstart', (ev) => {
    pinch = null;
    if (ev.touches.length !== 2) return;
    const zoom = window.visualViewport?.scale ?? 1;
    // a pinch on a tycho viewer dollies and pans its camera. the surfaces and the strip bundles are
    // turned by a drag of one finger, and do not read a pinch
    const own = ev.target instanceof Element && ev.target.closest('tycho-viewer');
    if (!deck.isOverview() && (zoom >= FULL || own)) return;
    const [a, b] = [ev.touches[0], ev.touches[1]];
    pinch = { from: distance(ev.touches), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }, { passive: true });
  // a pinch closed opens the overview, and a pinch open in the overview shows the slide under the
  // midpoint of the fingers at the start of the pinch, as a tap does, or else the current slide
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
  // Safari on iOS cancels the touches of a pinch closed at the full view, and shows its tabs, unless
  // the gesture events of the pinch are prevented. gesturestart is sent at a scale of 1 as a second
  // finger touches, before its touchstart, but after the touchstart of two fingers that touch
  // together, once they have moved. desktop Safari sends the same events at a pinch on a trackpad,
  // without touches, hence the events are read only during a pinch of two touches
  const gesture = (ev: Event) => {
    const scale = (ev as Event & { scale: number }).scale;
    if (!pinch) return;
    if (deck.isOverview() || scale < 1) ev.preventDefault();
    read(scale);
  };
  document.addEventListener('gesturestart', gesture, { passive: false });
  document.addEventListener('gesturechange', gesture, { passive: false });
}
