import { heading } from './chrome.ts';
import { OWN } from './click.ts';
import type { Deck } from './reveal.d.ts';

type Timing = { totalTime?: number | null; defaultTiming?: number | null };

export function minutes(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

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

const GAP = 3.2;

const REACH = 16;
const FINGER_REACH = 44;
const REST = 200;

const SLOP = 10;

const LIFTED = 500;

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

  const place = () => ({ slide: deck.getCurrentSlide() as HTMLElement, f: deck.getIndices().f as number | undefined });
  let here = place();
  let viewed: typeof here | null = null;

  let rest = 0;
  let x = 0;
  let press: { id: number; x: number; y: number; state: 'rest' | 'open' | 'off' } | null = null;
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

  const all = () => [...document.querySelectorAll<HTMLElement>('.reveal .slides section:not(:has(> section))')];

  const build = () => {
    for (const t of [...ticks, ...names]) t.el.remove();
    ticks = [];
    names = [];
    const numbered = deck.getSlides() as HTMLElement[];
    const last = Math.max(1, deck.getTotalSlides() - 1);
    const times = starts(numbered.map((s) => s.dataset.timing), deck.getConfig() as Timing);
    band.classList.toggle('timed', !!times);
    let section = false;
    for (const slide of all()) {
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

  const thin = () => {
    zone = band.getBoundingClientRect();
    const em = parseFloat(getComputedStyle(band).fontSize) || 16;
    const sectioned = ticks.some((t) => t.el.classList.contains('section'));
    const k = Math.max(1, Math.ceil((GAP * em) / (zone.width / Math.max(1, ticks.length - 1))));
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

  const pick = (target: EventTarget | null, to: number) => {
    const el = target instanceof Element ? target.closest('.scrub-name') : null;
    return names.find((n) => n.el === el) ?? nearest(to);
  };

  const go = (t: Item | null) => {
    if (!t) return;
    const { h, v } = deck.getIndices(t.slide);
    deck.slide(h, v, t.slide === viewed?.slide ? viewed.f : undefined);
  };

  const inside = (ev: PointerEvent, reach: number) => ev.clientX >= zone.left && ev.clientX <= zone.right
    && ev.clientY <= zone.bottom && ev.clientY >= (open ? zone.top : zone.bottom - reach);

  const opened = () => {
    if (press) press.state = 'open';
    show(true);
    hover(pick(press && document.elementFromPoint(press.x, press.y), x));
  };

  document.addEventListener('pointerdown', (ev) => {
    lifted = -Infinity;
    unrest();
    if (press?.state === 'rest') press = null;
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
      if (press.state !== 'rest') ev.stopPropagation();
      if (press.state === 'open' && ev.clientY >= zone.top) hover(pick(document.elementFromPoint(ev.clientX, ev.clientY), x));
      else if (press.state === 'open') { press.state = 'off'; show(false); }
      else if (press.state === 'rest' && Math.hypot(x - press.x, ev.clientY - press.y) > SLOP) { press = null; unrest(); }
      return;
    }
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
  document.addEventListener('contextmenu', (ev) => { if (press && press.state !== 'rest') ev.preventDefault(); }, true);
  document.addEventListener('click', (ev) => {
    if (ev.timeStamp - lifted > LIFTED) return;
    lifted = -Infinity;
    ev.preventDefault();
    ev.stopPropagation();
  }, true);

  document.documentElement.addEventListener('pointerleave', (ev) => { if (ev.pointerType !== 'touch') show(false); });
  document.addEventListener('keydown', () => show(false), true);
  band.addEventListener('click', (ev) => go(pick(ev.target, ev.clientX)));

  const index = (slide: HTMLElement) => all().indexOf(slide);
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
  for (const event of ['fragmentshown', 'fragmenthidden']) {
    deck.on(event, () => {
      if (deck.getCurrentSlide() === here.slide) here = place();
      if (open) mark();
    });
  }
  window.addEventListener('resize', () => { zone = band.getBoundingClientRect(); if (open) thin(); });
}
