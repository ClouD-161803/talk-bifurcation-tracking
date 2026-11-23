import type { Deck } from './reveal.d.ts';

const running = new WeakSet<HTMLVideoElement>();
const turns = new WeakMap<HTMLVideoElement, number>();
let turn = 0;
let revealSeeks = () => true;
const guarded = new WeakSet<HTMLVideoElement>();

const HIDES = '.fade-out, .fade-in-then-out:not(.current-fragment), .current-visible:not(.current-fragment)';

export function stepShown(el: Element, slide: Element): boolean {
  for (let e: Element | null = el; e && e !== slide; e = e.parentElement) {
    if (!e.classList.contains('fragment')) continue;
    if (!e.classList.contains('visible') || e.matches(HIDES)) return false;
  }
  return true;
}

const mode = (v: Element) => (v.classList.contains('for-dark') ? 'dark' : v.classList.contains('for-light') ? 'light' : '');

const coveredBy = (v: Element, later: Element) => !mode(later) || mode(later) === mode(v);

export function cover(slide: Element): void {
  for (const place of slide.querySelectorAll('.figure-box, .plate')) {
    const videos = [...place.children].filter((c): c is HTMLVideoElement => c instanceof HTMLVideoElement);
    const shown = videos.map((v) => stepShown(v, slide));
    videos.forEach((v, i) => {
      const under = !place.classList.contains('row') && videos.some((later, j) => j > i && shown[j] && coveredBy(v, later));
      v.toggleAttribute('data-covered', under);
    });
  }
}

export function coverAll(root: ParentNode): void {
  for (const slide of root.querySelectorAll('.reveal .slides section')) cover(slide);
}

const plays = (v: HTMLVideoElement, slide: Element) => {
  if (v.hasAttribute('data-autoplay')) return true;
  const step = v.closest('.fragment.play');
  return !!step && slide.contains(step);
};

const ready = (v: HTMLVideoElement) => v.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA || v.error !== null;

const once = (v: HTMLVideoElement, types: string[]) => new Promise<void>((done) => {
  for (const type of types) v.addEventListener(type, () => done(), { once: true });
});

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

async function start(videos: HTMLVideoElement[]): Promise<void> {
  const mine = ++turn;
  for (const v of videos) {
    running.add(v);
    turns.set(v, mine);
  }
  const taken = new Set<HTMLVideoElement>();
  const current = () => videos.filter((v) => turns.get(v) === mine && running.has(v) && !taken.has(v));
  if (!videos.every(ready)) {
    const take = (e: Event) => {
      const v = e.target as HTMLVideoElement;
      if (v.currentTime > 0 || !revealSeeks()) taken.add(v);
    };
    for (const v of videos) {
      v.pause();
      if (!ready(v)) v.preload = 'auto';
      v.addEventListener('seeking', take);
    }
    await Promise.race([Promise.all(videos.filter((v) => !ready(v)).map((v) => once(v, ['canplay', 'error']))), sleep(5000)]);
    for (const v of videos) v.removeEventListener('seeking', take);
  }
  const seeks = current().filter((v) => v.currentTime > 0).map((v) => {
    v.currentTime = 0;
    return once(v, ['seeked', 'error']);
  });
  if (seeks.length) await Promise.race([Promise.all(seeks), sleep(1000)]);
  for (const v of current()) v.play().catch(() => {});
}

function stop(v: HTMLVideoElement): void {
  const played = !v.paused || v.currentTime > 0;
  running.delete(v);
  turns.delete(v);
  v.pause();
  if (!played) return;
  const style = getComputedStyle(v);
  if (style.visibility !== 'hidden' && !v.hasAttribute('data-covered')) {
    v.load();
    return;
  }
  setTimeout(() => {
    if (!running.has(v) && v.currentTime > 0) v.currentTime = 0;
  }, transitionsEnd(style) + 50);
}

const seconds = (list: string) => list.split(',').map((s) => parseFloat(s) || 0);

function transitionsEnd(style: CSSStyleDeclaration): number {
  const delays = seconds(style.transitionDelay);
  return 1000 * Math.max(0, ...seconds(style.transitionDuration).map((d, i) => d + delays[i % delays.length]));
}

function guard(v: HTMLVideoElement): void {
  if (guarded.has(v)) return;
  guarded.add(v);
  v.addEventListener('play', () => {
    if (!running.has(v)) v.pause();
  });
}

export function syncVideos(slide: Element, speaker = false): void {
  cover(slide);
  const starts: HTMLVideoElement[] = [];
  for (const v of slide.querySelectorAll('video')) {
    if (!plays(v, slide) || (speaker && !v.muted)) continue;
    guard(v);
    if (stepShown(v, slide) && !v.hasAttribute('data-covered')) {
      if (!running.has(v)) starts.push(v);
    } else stop(v);
  }
  if (starts.length) void start(starts);
}

function leave(slide: Element): void {
  for (const v of slide.querySelectorAll('video')) {
    running.delete(v);
    turns.delete(v);
  }
}

export function initVideos(deck: Deck): void {
  const speaker = deck.isSpeakerNotes();
  revealSeeks = () => deck.getConfig().autoPlayMedia !== false;
  const sync = () => {
    const slide = deck.getCurrentSlide();
    if (slide) syncVideos(slide, speaker);
  };
  deck.on('slidechanged', (event) => {
    const previous = (event as Event & { previousSlide?: HTMLElement | null }).previousSlide;
    if (previous && previous !== deck.getCurrentSlide()) leave(previous);
    sync();
  });
  deck.on('fragmentshown', sync);
  deck.on('fragmenthidden', sync);
  sync();
}
