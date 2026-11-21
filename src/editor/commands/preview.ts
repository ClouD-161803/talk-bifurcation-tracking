import type { App } from '../app.ts';
import { previewPlays, setPreview, stopPreviews } from '../canvas/frames.ts';
import type { Command } from '../commands.ts';
import { showFormat } from '../inspector/inspector.ts';
import { OFF } from '../shown-steps.ts';
import { drawInto } from '../navigator/thumbs.ts';
import { showStep, stepsOfSlide } from '../present.ts';
import { stepVideos } from '../steps.ts';
import { injectStyle, make } from '../ui/dom.ts';
import { liveOf, slideBackdrop, spanOf, type Live } from './backdrop.ts';

export const timing = { step: 1000 };

const CSS = `
.beeson-edit-play { position: fixed; z-index: 65; overflow: hidden; pointer-events: none; }
.beeson-edit-play > .shot { position: absolute; inset: 0; }
`;

const theme = () => (window as unknown as { Beeson?: { preview?(el: HTMLElement): Live } }).Beeson;

let current: { stop(): void } | null = null;
export const playing = (): boolean => !!current;

function halt(app: App): void {
  const c = current;
  if (!c) return;
  current = null;
  c.stop();
  setPreview(app, 'play', false);
  app.invalidate();
}

const ready = (app: App) => !!app.pairing?.root && !!app.current();
const backdropOf = (app: App) => (ready(app) ? slideBackdrop(app) : null);
const hasSteps = (app: App) => ready(app) && stepsOfSlide(app.current()!) > 0;
const tableShown = (app: App) => !!app.commands.get('view.lightTable') && !!app.commands.state('view.lightTable').checked;
const traceable = (app: App) => {
  const el = tableShown(app) ? null : backdropOf(app);
  return el && !el.classList.contains(OFF) ? el : null;
};
const playable = (app: App) => !tableShown(app) && hasSteps(app);

type Part = 'backdrop' | 'steps';

async function play(app: App, parts: Part[]): Promise<void> {
  halt(app);
  const slide = app.current();
  if (!slide) return;
  const ends: (() => void)[] = [];
  let stopped = false;
  const me = { stop: () => { stopped = true; for (const end of ends.splice(0)) end(); } };
  current = me;
  setPreview(app, 'play', true, () => halt(app));
  app.invalidate();
  let place: (() => void) | null = null;
  let frame = 0;
  const follow = () => {
    if (stopped) return;
    if (tableShown(app)) { halt(app); return; }
    place?.();
    frame = requestAnimationFrame(follow);
  };
  frame = requestAnimationFrame(follow);
  ends.push(() => cancelAnimationFrame(frame));
  const pause = (ms: number) => new Promise<void>((done) => {
    const t = window.setTimeout(done, ms);
    ends.push(() => { clearTimeout(t); done(); });
  });

  const trace = async (el: HTMLElement) => {
    const o = liveOf(el);
    if (!o) return;
    await o.ready;
    if (stopped) return;
    ends.push(() => { if (o.tracing) o.complete(); });
    o.reset();
    o.start();
    const until = performance.now() + spanOf(o) * 1000 + 100;
    while (!stopped && o.tracing && performance.now() < until) await pause(50);
    if (o.tracing) o.complete();
  };

  const steps = async () => {
    const stage = app.slides() as HTMLElement;
    const box = stage.getBoundingClientRect();
    if (!box.width || !box.height) return;
    injectStyle('play', CSS);
    const layer = make('div', 'beeson-edit-play');
    layer.style.background = getComputedStyle(stage.closest('.reveal') ?? document.body).backgroundColor;
    const host = make('div', 'shot');
    layer.append(host);
    document.body.append(layer);
    const traced: Live[] = [];
    const busy: (() => boolean)[] = [];
    ends.push(() => {
      for (const o of traced) o.destroy();
      layer.remove();
    });
    const deck = { width: stage.offsetWidth || 1920, height: stage.offsetHeight || 1080 };
    drawInto(host, slide, deck, box.width);
    place = () => {
      const b = stage.getBoundingClientRect();
      layer.style.left = `${b.left}px`;
      layer.style.top = `${b.top}px`;
      layer.style.width = `${b.width}px`;
      layer.style.height = `${b.height}px`;
      const v = app.stage?.viewport;
      if (v) {
        const cut = [v.top - b.top, b.right - v.right, b.bottom - v.bottom, v.left - b.left];
        layer.style.clipPath = `inset(${cut.map((d) => `${Math.max(0, d)}px`).join(' ')})`;
      }
      const shot = host.shadowRoot?.querySelector<HTMLElement>('.slides');
      if (shot) shot.style.transform = `scale(${b.width / deck.width})`;
    };
    place();
    const copy = host.shadowRoot?.querySelector('.beeson-thumb .slides > section');
    const videos = copy ? stepVideos(copy) : null;
    if (videos) ends.push(() => videos.stop());
    const reached = (v: Element) => {
      for (let f = v.closest('.fragment'); f; f = f.parentElement?.closest('.fragment') ?? null) if (!f.classList.contains('visible') || f.classList.contains(OFF)) return false;
      return true;
    };
    const n = stepsOfSlide(slide);
    for (let k = 0; k <= n && !stopped; k++) {
      if (k) await pause(timing.step);
      if (stopped) return;
      showStep(host, slide, k);
      videos?.update(reached);
      const now = '.backdrop.fragment.current-fragment:not(.beeson-off)';
      for (const el of host.shadowRoot?.querySelectorAll<HTMLElement>(now) ?? []) {
        const o = theme()?.preview?.(el);
        if (!o) continue;
        traced.push(o);
        void o.ready.then(() => {
          if (stopped) return;
          o.reset();
          o.start();
          const until = performance.now() + spanOf(o) * 1000 + 100;
          busy.push(() => o.tracing && performance.now() < until);
        });
      }
    }
    await pause(timing.step);
    while (!stopped && busy.some((b) => b())) await pause(50);
  };

  try {
    for (const part of parts) {
      if (stopped) break;
      const el = traceable(app);
      if (part === 'backdrop' && el) await trace(el);
      else if (part === 'steps' && stepsOfSlide(slide) > 0) await steps();
    }
  } finally {
    if (current === me) halt(app);
  }
}

const start = (app: App, parts: Part[]) => void play(app, parts).catch((e) => app.fail(e));

export function install(app: App): void {
  const c = app.commands;
  const preview = (order: number) => ({ group: 'present', order, icon: 'play', label: 'Preview', split: 'Preview' });
  const menu = (order: number) => ({ bar: 'Play', group: 'preview', order });
  c.define({
    id: 'preview.slide',
    label: 'Play Slide',
    menu: menu(25),
    toolbar: preview(39),
    enabled: (a) => playing() || !!traceable(a) || playable(a),
    run: (a) => (playing() ? halt(a) : start(a, ['backdrop', 'steps'])),
  });
  c.define({
    id: 'preview.backdrop',
    label: 'Trace Backdrop',
    menu: menu(26),
    toolbar: preview(39.01),
    enabled: (a) => !!traceable(a),
    run: (a) => start(a, ['backdrop']),
  });
  c.define({
    id: 'preview.steps',
    label: 'Play Steps',
    menu: menu(27),
    toolbar: preview(39.02),
    enabled: playable,
    run: (a) => start(a, ['steps']),
  });
  c.define({
    id: 'preview.selectBackdrop',
    label: 'Select Backdrop',
    toolbar: preview(39.03),
    enabled: (a) => !!backdropOf(a),
    run: (a) => {
      const el = backdropOf(a);
      if (!el) return;
      a.selection.set('elements', [el]);
      showFormat(a, 'backdrop');
    },
  });
  c.define({
    id: 'preview.addBackdrop',
    label: 'Add Backdrop…',
    toolbar: preview(39.04),
    enabled: (a) => ready(a) && !backdropOf(a) && c.enabled('insert.backdrop'),
    run: (a) => a.commands.run('insert.backdrop'),
  });

  c.veto((_, cmd, ev) => previewPlays() && ev?.key === 'Escape' && Object.values(cmd.keys ?? {}).some((k) => k.includes('Escape')));
  window.addEventListener('pointerdown', (ev) => {
    const t = ev.target;
    if (playing() && !(t instanceof Element && t.closest('.beeson-edit-top, .beeson-edit-menu'))) halt(app);
  }, true);
  const starts = '.beeson-edit-top [data-command="preview.slide"], .beeson-edit-side button.play, [data-command="slide.previewTransition"]';
  window.addEventListener('mousedown', (ev) => {
    const t = ev.target;
    if (t instanceof Element && t.closest(starts) && (document.activeElement as HTMLElement | null)?.isContentEditable) ev.preventDefault();
  }, true);
  const typing = () => previewPlays() && !!(document.activeElement as HTMLElement | null)?.isContentEditable;
  const typed = (ev: KeyboardEvent) => ev.key !== 'Escape' && !['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(ev.key) && typing();
  const zooms = (cmd: Command | undefined) => !!cmd?.id.startsWith('zoom.');
  c.veto((_, cmd, ev) => {
    if (ev && typed(ev) && !zooms(cmd)) stopPreviews();
    return false;
  });
  window.addEventListener('keydown', (ev) => { if (typed(ev) && !zooms(c.forKey(ev, app.region()))) stopPreviews(); }, true);
  window.addEventListener('beforeinput', () => { if (typing()) stopPreviews(); }, true);
  window.addEventListener('keydown', (ev) => {
    if (!playing() || ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    halt(app);
  }, true);
  app.listen('slide', () => halt(app));
  app.listen('history', () => halt(app));
}
