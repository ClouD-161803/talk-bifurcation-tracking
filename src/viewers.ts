import type { Deck } from './reveal.d.ts';
import { stepShown } from './video.ts';

type Viewer = HTMLElement & {
  readonly state?: object | null;
  play(): void;
  seek(t: number): void;
};

const running = new WeakSet<Viewer>();
const turns = new WeakMap<Viewer, number>();
let turn = 0;
const loads = new WeakMap<Element, Promise<void>>();

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

const loaded = (v: Element) => ((v as Viewer).state ?? null) !== null;
const failed = (v: Element) => !!v.shadowRoot?.querySelector('.status.error');

export function whenLoaded(v: Element): Promise<void> {
  let load = loads.get(v);
  if (!load) {
    const until = performance.now() + 60000;
    load = new Promise((done) => {
      const poll = () => (loaded(v) || failed(v) || performance.now() > until ? done() : setTimeout(poll, 50));
      poll();
    });
    loads.set(v, load);
  }
  return load;
}

const plays = (v: Element, slide: Element) => {
  const step = v.closest('.fragment.play');
  return !!step && slide.contains(step);
};

function hold(v: Viewer): void {
  if (loaded(v)) v.seek(0);
}

async function start(viewers: Viewer[]): Promise<void> {
  const mine = ++turn;
  for (const v of viewers) {
    running.add(v);
    turns.set(v, mine);
  }
  const waiting = viewers.filter((v) => !loaded(v));
  if (waiting.length) {
    for (const v of viewers) hold(v);
    await Promise.race([Promise.all(waiting.map(whenLoaded)), sleep(5000)]);
  }
  const current = viewers.filter((v) => turns.get(v) === mine && running.has(v) && loaded(v));
  for (const v of current) v.seek(0);
  for (const v of current) v.play();
}

function stop(v: Viewer): void {
  running.delete(v);
  turns.delete(v);
  hold(v);
}

export function stepViewers(slide: Element, shown: (v: Element) => boolean = (v) => stepShown(v, slide)): void {
  const starts: Viewer[] = [];
  for (const v of slide.querySelectorAll<Viewer>('tycho-viewer')) {
    if (!plays(v, slide)) continue;
    if (shown(v)) {
      if (!running.has(v)) starts.push(v);
    } else stop(v);
  }
  if (starts.length) void start(starts);
}

function leave(slide: Element): void {
  for (const v of slide.querySelectorAll<Viewer>('tycho-viewer')) if (plays(v, slide)) stop(v);
}

export function initViewers(deck: Deck): void {
  for (const v of document.querySelectorAll<Viewer>('.reveal .slides tycho-viewer')) {
    const slide = v.closest('section');
    if (!slide || !plays(v, slide)) continue;
    void whenLoaded(v).then(() => {
      if (!running.has(v)) hold(v);
    });
  }
  const sync = () => {
    const slide = deck.getCurrentSlide();
    if (slide) stepViewers(slide);
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
