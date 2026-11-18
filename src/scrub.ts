// the scrubber of the progress line. the band is the progress line magnified, with a tick at the
// start of each numbered slide, the name of each section over the start of its stretch, and the
// last viewed slide. it is opened by a mouse that rests in the reach at the bottom edge of the
// window, and by a finger that rests there. a click on a tick or on a name shows its slide, and so
// does a finger lifted from the band. while the band is closed, the progress line of reveal.js is
// left as it is drawn

import { heading } from './chrome.ts';
import { OWN } from './click.ts';
import type { Deck } from './reveal.d.ts';

type Timing = { totalTime?: number | null; defaultTiming?: number | null };

// seconds as m:ss
export function minutes(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// the start time of each slide, in s from the start of the talk, by the rule of the pacing of the
// speaker view of reveal.js (getTimings in theme/vendor/reveal/notes.js): data-timing of a slide in
// s, and else defaultTiming, or with totalTime set, an equal share of the time left by the timed
// slides. starts returns null when the deck sets neither totalTime nor defaultTiming
export function starts(timings: (string | undefined)[], config: Timing): number[] | null {
  const { totalTime } = config;
  if (config.defaultTiming == null && totalTime == null) return null;
  const fallback = totalTime ? 0 : (config.defaultTiming ?? 0);
  let own = timings.map((t) => {
    const n = t === undefined ? NaN : parseInt(t, 10);
    return Number.isNaN(n) ? fallback : n;
  });
  if (totalTime) {
    const open = own.filter((x) => x === 0).length;
    const share = open ? Math.round((totalTime - own.reduce((a, b) => a + b, 0)) / open) : 0;
    own = own.map((x) => (x === 0 ? share : x));
  }
  let t = 0;
  return own.map((x) => { const at = t; t += x; return at; });
}

// the least gap between two numbers, in em of the band
const GAP = 3.2;

// the reach is the height at the bottom edge of the band within which a pointer opens the band, in
// screen pixels. the rest is the time in ms that the pointer stays in the reach before the band is
// opened, hence a pointer on its way to a control low on a slide does not open it. the reach of a
// finger is higher, since a finger covers about 44 px
const REACH = 16;
const FINGER_REACH = 44;
const REST = 200;

// the farthest a finger moves during its rest, in screen pixels. a finger that moves farther is
// left to the swipe of reveal.js
const SLOP = 10;

// the longest time in ms from the lift of a finger off the band to the click that a browser makes
// of it
const LIFTED = 500;

// a tick or a name on the band, at the share at of the width of the band
type Item = { slide: HTMLElement; at: number; el: HTMLElement };

export function initScrub(deck: Deck): void {
  const reveal = deck.getRevealElement() as HTMLElement;
  const band = document.createElement('div');
  band.className = 'scrub';
  band.setAttribute('aria-hidden', 'true');
  const track = document.createElement('div');
  track.className = 'scrub-track';
  const fill = document.createElement('span');
  track.append(fill);
  const headingBox = document.createElement('div');
  headingBox.className = 'scrub-heading';
  band.append(track, headingBox);
  reveal.append(band);

  let ticks: Item[] = [];
  let names: Item[] = [];
  let hovered: Item | null = null;
  let open = false;
  let zone = band.getBoundingClientRect();

  // the slide and the step shown, and the slide and the step left at the last jump
  const place = () => ({ slide: deck.getCurrentSlide() as HTMLElement, f: deck.getIndices().f as number | undefined });
  let here = place();
  let viewed: typeof here | null = null;

  // the timer of a rest, the last x of the pointer, and a finger down in the reach. the finger is
  // in its rest, on the open band, or off the band, which it has left upward
  let rest = 0;
  let x = 0;
  let press: { id: number; x: number; y: number; state: 'rest' | 'open' | 'off' } | null = null;
  // the click that a browser makes of a finger lifted from the band is not left to the slide. it
  // follows the lift at once, and a finger that moved is not followed by one, hence only a click
  // within LIFTED ms of the time stamp of the lift is canceled
  let lifted = -Infinity;

  const item = (name: string, slide: HTMLElement, at: number, text: string): Item => {
    const el = document.createElement('div');
    el.className = name;
    el.classList.toggle('viewed', slide === viewed?.slide);
    const span = document.createElement('span');
    span.textContent = text;
    el.append(span);
    band.append(el);
    return { slide, at, el };
  };

  // the ticks are placed where the progress of reveal.js stands at the first step of each slide. the
  // slides of reveal.js leave out those with data-visibility="uncounted", which are not numbered. of
  // these, a section slide and a closing slide have a name at the place of the next tick, and so
  // has the last viewed slide
  const build = () => {
    for (const t of [...ticks, ...names]) t.el.remove();
    ticks = [];
    names = [];
    const numbered = deck.getSlides() as HTMLElement[];
    const last = Math.max(1, deck.getTotalSlides() - 1);
    const times = starts(numbered.map((s) => s.dataset.timing), deck.getConfig() as Timing);
    band.classList.toggle('timed', !!times);
    let section = false;
    for (const slide of deck.getHorizontalSlides() as HTMLElement[]) {
      const i = deck.getSlidePastCount(slide);
      const at = Math.min(i / last, 1);
      if (numbered[i] !== slide) {
        section ||= slide.classList.contains('section');
        if (slide.matches('.section, .closing') || slide === viewed?.slide) names.push(item('scrub-name', slide, at, slide.dataset.appendix ? `A${slide.dataset.appendix}` : heading(slide)));
        continue;
      }
      const t = item('scrub-tick', slide, at, String(i + 1));
      t.el.style.left = `${at * 100}%`;
      t.el.classList.toggle('first', i === 0);
      t.el.classList.toggle('last', i > 0 && i === numbered.length - 1);
      t.el.classList.toggle('section', section);
      section = false;
      if (times) {
        const time = document.createElement('span');
        time.className = 'scrub-time';
        time.textContent = minutes(times[i]);
        t.el.append(time);
      }
      ticks.push(t);
    }
  };

  // a number is shown on every k-th tick, so that numbers are at least GAP em apart. in a deck with
  // sections, it is shown on the first tick of each section in their place. the last tick, the
  // current slide, the hovered slide, and the last viewed slide always have their numbers. another
  // number whose box would come within an em of the box of the last tick is not shown. the boxes
  // are compared and not the places, since the number of the last tick ends at its tick and the
  // number of a section starts at its tick. a name starts at its place, and it is moved or cut
  // where it would meet the next name
  const thin = () => {
    zone = band.getBoundingClientRect();
    const em = parseFloat(getComputedStyle(band).fontSize) || 16;
    const sectioned = ticks.some((t) => t.el.classList.contains('section'));
    const k = Math.max(1, Math.ceil((GAP * em) / (zone.width / Math.max(1, ticks.length - 1))));
    // the boxes are read before a class is written, hence the band is laid out once
    const boxes = ticks.map((t) => t.el.getBoundingClientRect());
    const lastLeft = boxes.at(-1)?.left ?? 0;
    let before = -Infinity;
    ticks.forEach((t, i) => {
      const at = t.at * zone.width;
      const far = at - before >= GAP * em;
      const shown = i === ticks.length - 1 || (boxes[i].right + em <= lastLeft
        && (sectioned ? far && (i === 0 || t.el.classList.contains('section')) : i % k === 0));
      if (shown) before = at;
      t.el.classList.toggle('quiet', !shown);
    });

    for (const n of names) n.el.style.maxWidth = '';
    const widths = names.map((n) => Math.ceil(n.el.getBoundingClientRect().width));
    const cut = Math.min(1, (zone.width - em * (names.length - 1)) / Math.max(1, widths.reduce((a, b) => a + b, 0)));
    let edge = 0;
    const lefts = names.map((n, i) => {
      const left = Math.max(n.at * zone.width, edge);
      edge = left + widths[i] * cut + em;
      return left;
    });
    edge = zone.width;
    for (let i = names.length - 1; i >= 0; i -= 1) {
      const left = Math.min(lefts[i], edge - widths[i] * cut);
      edge = left - em;
      names[i].el.style.left = `${left}px`;
      if (cut < 1) names[i].el.style.maxWidth = `${widths[i] * cut}px`;
    }
  };

  const mark = () => {
    fill.style.transform = `scaleX(${deck.getTotalSlides() < 2 ? 0 : deck.getProgress()})`;
    const current = deck.getCurrentSlide();
    for (const t of [...ticks, ...names]) t.el.classList.toggle('now', t.slide === current);
  };

  // the heading of the hovered slide is written over its tick. a name is already written on the
  // band, hence it is written again only where it is cut or covered by a finger. the number of the
  // tick is covered by a finger as well, and it is then written before the heading
  const hover = (t: Item | null) => {
    if (t === hovered) return;
    hovered?.el.classList.remove('hover');
    hovered = t;
    headingBox.textContent = '';
    if (!t) return;
    t.el.classList.add('hover');
    const text = t.el.firstElementChild?.textContent ?? '';
    const box = t.el.getBoundingClientRect();
    let at = t.at * zone.width;
    if (names.includes(t)) {
      if (press || t.el.scrollWidth > t.el.clientWidth) headingBox.textContent = text;
      at = box.left + box.width / 2 - zone.left;
    } else headingBox.textContent = press ? `${text} · ${heading(t.slide)}` : heading(t.slide);
    const half = headingBox.offsetWidth / 2;
    headingBox.style.left = `${Math.min(Math.max(at, half), zone.width - half)}px`;
  };

  const unrest = () => {
    if (!rest) return;
    window.clearTimeout(rest);
    rest = 0;
  };

  const show = (on: boolean) => {
    unrest();
    if (on === open) return;
    open = on;
    if (on) { build(); thin(); mark(); }
    else hover(null);
    // a finger on a band closed by a key, the mouse, or a pen does not hover or pick a tick
    if (!on && press?.state === 'open') press.state = 'off';
    band.classList.toggle('finger', on && !!press);
    reveal.classList.toggle('scrubbing', on);
  };

  const nearest = (to: number) => {
    const at = (to - zone.left) / zone.width;
    let best = ticks[0] ?? null;
    for (const t of ticks) if (Math.abs(t.at - at) < Math.abs((best?.at ?? 0) - at)) best = t;
    return best;
  };

  // the name under the pointer, and else the nearest tick
  const pick = (target: EventTarget | null, to: number) => {
    const el = target instanceof Element ? target.closest('.scrub-name') : null;
    return names.find((n) => n.el === el) ?? nearest(to);
  };

  // a slide before the current one is shown with every step by reveal.js, and a slide after it at
  // its first step. the last viewed slide is shown at the step left
  const go = (t: Item | null) => {
    if (!t) return;
    const { h, v } = deck.getIndices(t.slide);
    deck.slide(h, v, t.slide === viewed?.slide ? viewed.f : undefined);
  };

  // whether the pointer is in the reach of the closed band, or on the open band
  const inside = (ev: PointerEvent, reach: number) => ev.clientX >= zone.left && ev.clientX <= zone.right
    && ev.clientY <= zone.bottom && ev.clientY >= (open ? zone.top : zone.bottom - reach);

  // the names are in the reach of a finger, hence a finger may rest on one. the band takes the
  // pointer once it is shown
  const opened = () => {
    if (press) press.state = 'open';
    show(true);
    hover(pick(press && document.elementFromPoint(press.x, press.y), x));
  };

  // a press of the mouse in the reach, e.g. on a control, does not open the band, and neither does
  // a finger on an element that takes the pointer, e.g. a surface that it drags. a second finger
  // ends the rest of the first, since the two are in a pinch
  document.addEventListener('pointerdown', (ev) => {
    lifted = -Infinity;
    unrest();
    if (press?.state === 'rest') press = null;
    // a new first finger drops a press whose lift never reached the page. the band would otherwise
    // stay open on a phone, where it is not closed by a key or by the mouse
    if (press && ev.isPrimary && ev.pointerType !== 'mouse' && ev.pointerId !== press.id) {
      press = null;
      show(false);
    }
    if (ev.pointerType === 'mouse' || !ev.isPrimary || press || open || !inside(ev, FINGER_REACH)) return;
    if (ev.target instanceof Element && ev.target.closest(OWN)) return;
    press = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, state: 'rest' };
    x = ev.clientX;
    rest = window.setTimeout(opened, REST);
  }, true);
  document.addEventListener('pointermove', (ev) => {
    if (press?.id === ev.pointerId) {
      x = ev.clientX;
      // the moves of a finger on the band are kept from reveal.js, which reads a swipe from them
      if (press.state !== 'rest') ev.stopPropagation();
      // the target of a finger stays the element of its press, hence the name under it is found
      // by its place
      if (press.state === 'open' && ev.clientY >= zone.top) hover(pick(document.elementFromPoint(ev.clientX, ev.clientY), x));
      else if (press.state === 'open') { press.state = 'off'; show(false); }
      else if (press.state === 'rest' && Math.hypot(x - press.x, ev.clientY - press.y) > SLOP) { press = null; unrest(); }
      return;
    }
    // a pen that hovers is a mouse, and a pen on the screen is a finger
    if (ev.pointerType === 'touch') return;
    x = ev.clientX;
    if (open) {
      if (inside(ev, 0)) hover(pick(ev.target, x));
      else show(false);
    } else if (inside(ev, REACH) && !ev.buttons) rest ||= window.setTimeout(opened, REST);
    else unrest();
  }, true);
  const lift = (ev: PointerEvent) => {
    if (press?.id !== ev.pointerId) return;
    const { state } = press;
    press = null;
    if (state === 'rest') return unrest();
    lifted = ev.timeStamp;
    const t = hovered;
    show(false);
    if (state === 'open' && ev.type === 'pointerup') go(t);
  };
  document.addEventListener('pointerup', lift, true);
  document.addEventListener('pointercancel', lift, true);
  // the finger on the band is kept from the menu of a long press, and from the click of the browser
  // when it is lifted
  document.addEventListener('contextmenu', (ev) => { if (press && press.state !== 'rest') ev.preventDefault(); }, true);
  document.addEventListener('click', (ev) => {
    if (ev.timeStamp - lifted > LIFTED) return;
    lifted = -Infinity;
    ev.preventDefault();
    ev.stopPropagation();
  }, true);

  document.documentElement.addEventListener('pointerleave', (ev) => { if (ev.pointerType !== 'touch') show(false); });
  // a key, e.g. of a remote, moves the talk on, and the band is closed until the mouse moves
  document.addEventListener('keydown', () => show(false), true);
  band.addEventListener('click', (ev) => go(pick(ev.target, ev.clientX)));

  // a jump is a move that is not to the next or the previous slide, and it sets the last viewed
  // slide. the moves in the overview are one move, from the slide at which the overview was opened
  // to the slide shown when it is closed. at a click on a slide, reveal.js closes the overview
  // before it shows the slide, in one task, hence the move is settled in a microtask
  const index = (slide: HTMLElement) => (deck.getHorizontalSlides() as HTMLElement[]).indexOf(slide);
  let from: typeof here | null = null;
  const leave = (left: typeof here) => {
    if (Math.abs(index(deck.getCurrentSlide() as HTMLElement) - index(left.slide)) > 1) viewed = left;
  };
  const redraw = () => {
    if (!open) return;
    const slide = hovered?.slide;
    hover(null);
    build();
    thin();
    mark();
    hover([...ticks, ...names].find((t) => t.slide === slide) ?? null);
  };
  deck.on('overviewshown', () => { from = here; });
  deck.on('overviewhidden', () => queueMicrotask(() => {
    if (from) leave(from);
    from = null;
    redraw();
  }));
  deck.on('slidechanged', () => {
    if (!from) leave(here);
    here = place();
    redraw();
  });
  // reveal.js shows the step of a jump before it reports the new slide, and the step left is not
  // replaced by it
  for (const event of ['fragmentshown', 'fragmenthidden']) {
    deck.on(event, () => {
      if (deck.getCurrentSlide() === here.slide) here = place();
      if (open) mark();
    });
  }
  // reveal.js reports a resize only at a change of scale, and before it sets --slide-scale. its own
  // listener on the window is added before this one, hence the band is in its new place here
  window.addEventListener('resize', () => { zone = band.getBoundingClientRect(); if (open) thin(); });
}
