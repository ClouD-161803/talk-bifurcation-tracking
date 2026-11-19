import type { App } from '../app.ts';
import type { MathLookup } from '../math.ts';
import type { Edit } from '../merge.ts';
import type { Pairing, Rendered } from '../render.ts';
import type { Source } from '../source.ts';
import type { Mark } from './caret.ts';
import type { Applied, Engine, Tracked } from './port.ts';
import { apply as applyEdits, caretOf, contentRange, edits, elementRange, fine, mapOffset, markOf, mathLookup, mergeEdits, moved, pair, pairElement, parseSource, putCaret, renderDeck, renderTextElement, shared, textIn } from './host.ts';
import { applyAt, partial, refresh, repairText, type Done } from './apply.ts';
import { graft, locate, retag, windowOf, type Spot, type Window } from './tree.ts';

type Page = { MathJax?: { typesetPromise?(els: Element[]): Promise<unknown> } };

const NET = 500;
const REREAD = Symbol('reread');

function windowIn(source: Source, b: string): Window | null {
  const a = source.text;
  let w = windowOf(a, b);
  const cr = contentRange(source.slides);
  if (!w || !cr) return w;
  while (w.start > cr.start && w.endA > cr.end && (w.endA === w.start ? a[w.start - 1] === b[w.endB - 1] : w.endB === w.start && a[w.start - 1] === a[w.endA - 1])) w = { start: w.start - 1, endA: w.endA - 1, endB: w.endB - 1 };
  return w;
}

function byLine(text: string, e: Edit): Edit[] {
  const a = text.slice(e.start, e.end).split('\n');
  const b = e.text.split('\n');
  if (a.length < 2 || a.length !== b.length) return [e];
  const out: Edit[] = [];
  let at = e.start;
  a.forEach((x, i) => {
    const y = b[i];
    let p = 0;
    while (p < x.length && p < y.length && x[p] === y[p]) p++;
    let q = 0;
    while (q < x.length - p && q < y.length - p && x[x.length - 1 - q] === y[y.length - 1 - q]) q++;
    if (x !== y) out.push({ start: at + p, end: at + x.length - q, text: y.slice(p, y.length - q) });
    at += x.length + 1;
  });
  return out;
}

export function install(app: App, tracked: Tracked): Engine {
  let clean = tracked.clean;
  let mine = false;
  let handed = tracked.handed;
  let applying = false;
  let queued = 0;
  let chain: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const reloaders = new Set<(target?: string) => void>();
  let pending = false;
  let flushing: Promise<void> | null = null;
  let net = 0;

  let composing: Element | null = null;
  let behind: { shown: string; want: string } | null = null;
  let rest: string | null = null;
  let late: { host: Element; content: string } | null = null;

  let parked: { host: Element; offset: number; text: string } | null = null;

  const reload = (): Applied => ({ reload: true, changed: [] });
  const ready = () => !!app.source && !!app.pairing && !!app.pairing.root;
  const busy = () => !app.history.settled || app.doc.busy;
  let rendered: number[] = [];
  let places: number[] = [];
  const current = (): string => {
    rendered = [];
    if (clean) return app.source!.text;
    const r = renderDeck(app.source!, app.pairing!, mathLookup(), app.tagEdits);
    rendered = r.places;
    return r.text;
  };
  const virtual = (deck: string): string => (behind ? mergeEdits(behind.shown, fine(behind.shown, deck), fine(behind.shown, behind.want), 'ours', true).text : deck);

  app.listen('open', () => {
    clean = ready();
    handed = clean ? app.source!.text : null;
    behind = null;
    rest = null;
    late = null;
    parked = null;
  });

  const changed = (): void => {
    if (mine) return;
    if (app.session && app.note) {
      app.note = null;
      app.report();
    }
    clean = false;
    if (!listeners.size) return;
    pending = true;
    void flush();
  };
  app.listen('dirty', changed);
  app.listen('history', changed);

  function flush(): Promise<void> {
    if (!flushing && pending) flushing = drain();
    return flushing ?? Promise.resolve();
  }
  async function drain(): Promise<void> {
    try {
      do {
        await chain;
        await quiet();
        if (applying || queued) continue;
        pending = false;
        for (const fn of [...listeners]) fn();
      } while (pending);
    } finally {
      flushing = null;
    }
  }

  async function reported(): Promise<void> {
    while (pending || flushing || applying || queued || busy()) {
      await chain;
      await quiet();
      await flush();
    }
  }

  async function quiet(): Promise<void> {
    while (busy()) {
      await app.history.settle();
      await app.doc.idle();
    }
  }

  const reloadAll = (target?: string): void => {
    for (const fn of [...reloaders]) fn(target);
  };
  const ended = (): void => {
    late = null;
    if (rest !== null) {
      rest = null;
      if (listeners.size) {
        pending = true;
        void flush();
      }
    }
    if (behind) void run(null).then((r) => {
      if (r.reload) reloadAll(ready() ? virtual(current()) : undefined);
    }, (e) => reloadAll((e as { target?: string } | null)?.target));
  };
  let release = 0;
  document.addEventListener('compositionstart', (ev) => {
    clearTimeout(release);
    composing = app.hostOf(ev.target);
    const on = !!composing && ready() && listeners.size > 0;
    const t = on && busy() ? app.pairing!.byLive.get(composing!) : undefined;
    late = t ? { host: composing!, content: renderTextElement(app.source!, t, mathLookup(), app.tagEdits) } : null;
    rest = on && !busy() ? current() : null;
  }, true);
  function lateRest(): void {
    const l = late;
    if (!l || busy() || !ready()) return;
    late = null;
    const t = composition() === l.host ? app.pairing!.byLive.get(l.host) : undefined;
    const r = t && t.src.source === app.source ? contentRange(t.src) : null;
    if (!r) return;
    const { text, edits } = renderDeck(app.source!, app.pairing!, mathLookup(), app.tagEdits);
    const now = edits.find((e) => e.start === r.start && e.end === r.end)?.text ?? app.source!.text.slice(r.start, r.end);
    const top = edits.filter((e) => !edits.some((o) => o !== e && o.start <= e.start && e.end <= o.end));
    const span = top.find((e) => e.start <= r.start && r.end <= e.end && (r.start < e.end || e.start === e.end)) ?? { ...r, text: now };
    const at = span.text.indexOf(now);
    if (at < 0 || (span.text !== now && at !== span.text.lastIndexOf(now))) return;
    let p = span.start + at;
    for (const e of top) if (e.end <= span.start && e !== span) p += e.text.length - (e.end - e.start);
    rest = text.slice(0, p) + l.content + text.slice(p + now.length);
  }
  document.addEventListener('compositionend', () => {
    composing = null;
    release = window.setTimeout(ended, 0);
  }, true);
  document.addEventListener('focusout', () => {
    if (composing) setTimeout(ended);
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !composing) return;
    composing = null;
    ended();
  });

  function composition(): Element | null {
    const a = document.activeElement;
    if (composing && (!composing.isConnected || !a || !composing.contains(a))) composing = null;
    return composing;
  }

  function intoComposition(spot: Spot, w: Window): boolean {
    const c = composing;
    if (!c || spot.kind === 'reload' || spot.kind === 'tag') return false;
    if (spot.live === c) return true;
    if (!spot.live.contains(c)) return false;
    if (spot.kind === 'text') return true;
    let u = c;
    while (u.parentElement && u.parentElement !== spot.live) u = u.parentElement;
    const s = app.pairing!.elements.get(u);
    const r = s && s.source === app.source && elementRange(s);
    return !r || (w.start < r.end && w.endA > r.start);
  }

  function rebase(rendered: Rendered, math: MathLookup): boolean {
    const cuts = [...rendered.edits].sort((a, b) => b.start - a.start);
    let ok = true;
    for (let i = 0; i < cuts.length && ok; i++) {
      const e = cuts[i];
      if (i > 0 && e.end > cuts[i - 1].start) ok = false;
      else ok = rebaseOne(app.source!.text.slice(0, e.start) + e.text + app.source!.text.slice(e.end), math);
    }
    app.tagEdits.clear();
    if (ok && app.source!.text === rendered.text) {
      clean = true;
      return true;
    }
    try {
      app.source = parseSource(rendered.text);
    } catch {
      return false;
    }
    app.pairing = pair(app.source, app.slides(), math);
    app.typing.attach();
    clean = renderDeck(app.source, app.pairing, math).text === rendered.text;
    return clean;
  }

  function rebaseOne(next: string, math: MathLookup): boolean {
    const source = app.source!;
    const w = windowOf(source.text, next);
    if (!w) return true;
    const spot = locate(source, app.pairing!, w.start, w.endA);
    if (spot.kind === 'tag') return retag(source, spot.el, next);
    if (spot.kind !== 'text') return false;
    const textEl = app.pairing!.byLive.get(spot.live)!;
    const el = graft(source, spot.el, next);
    return !!el && !!repairText(app.pairing!, textEl, el, math);
  }

  function repiece(roots: Element[]): void {
    const pairing = app.pairing;
    if (!pairing || !roots.length) return;
    const math = mathLookup();
    const scratch: Pairing = { texts: [], byLive: new Map(), elements: new Map(), inner: new Map(), sections: [], problems: [], root: null };
    for (const t of pairing.texts) if (t.src.source === app.source && roots.some((r) => r.contains(t.live))) pairElement(t.src, t.live, t.slide, math, scratch);
    for (const r of roots) app.typing.markMath(r);
  }

  function settle(target: string, done: Done, texts: readonly Element[]): void {
    app.saved = target;
    clean = true;
    mine = true;
    try {
      app.history.prune(done.touched, done.within, undefined, texts);
      for (const el of done.changed) {
        if (!app.pairing?.byLive.has(el)) continue;
        if (texts.includes(el)) app.history.carry(el);
        else app.history.track(el);
      }
    } finally {
      mine = false;
    }
    if (done.structural) {
      app.report();
      app.invalidate();
    } else app.invalidate('content');
  }

  async function typeset(done: Done, mark: Mark | null): Promise<void> {
    const made = done.placed.filter((n) => n.isConnected);
    const mj = (window as unknown as Page).MathJax;
    const all = [...done.typeset];
    if (made.length && mj?.typesetPromise) all.push(mj.typesetPromise(made));
    if (!all.length && !made.length) return;
    await Promise.allSettled(all);
    mine = true;
    try {
      const roots = [...done.hosts, ...made].filter((n) => n.isConnected);
      repiece(roots);
      const page = window as unknown as { Beeson?: { mount?(root: Element): void } };
      for (const n of made) page.Beeson?.mount?.(n);
      if (made.length) refresh(app);
      for (const el of done.hosts) if (el.isConnected && app.pairing?.byLive.has(el)) app.history.track(el);
      if (done.caret && mark && !moved(mark)) done.caret();
    } finally {
      mine = false;
    }
  }

  function park(host: Element): void {
    const math = mathLookup();
    const c = caretOf(host, math);
    const text = c ? c.text : textIn(host, math);
    parked = { host, offset: c ? c.offset : text.length, text };
  }
  const types = (ev: KeyboardEvent): boolean =>
    !ev.isComposing &&
    (ev.key.length === 1
      ? !ev.metaKey && (!ev.ctrlKey || ev.altKey || ev.getModifierState('AltGraph'))
      : !ev.ctrlKey && !ev.metaKey && !ev.altKey && ['Backspace', 'Delete', 'Enter', 'Dead', 'Process'].includes(ev.key));
  function unpark(): void {
    const p = parked;
    parked = null;
    const was = document.activeElement;
    if (!p || !p.host.isConnected || (was !== p.host && was !== document.body)) return;
    app.showSlide(p.host);
    if (was === p.host) return;
    (p.host as HTMLElement).focus({ preventScroll: true });
    if (document.activeElement === p.host) putCaret(p.host, p.offset, mathLookup());
  }
  window.addEventListener('keydown', (ev) => {
    if (parked && types(ev)) unpark();
  }, true);
  window.addEventListener('beforeinput', () => {
    if (net) {
      clearTimeout(net);
      check();
    }
    if (parked) unpark();
  }, true);
  window.addEventListener('pointerdown', () => void (parked = null), true);
  document.addEventListener('focusin', () => void (parked = null), true);
  app.listen('slide', () => {
    if (!mine) parked = null;
  });

  async function turn(text: string | null | typeof REREAD): Promise<Applied> {
    await quiet();
    if (!ready()) return reload();
    lateRest();
    if (text === null && !behind) return { reload: false, changed: [] };
    const math = clean ? null : mathLookup();
    const rendered = math && renderDeck(app.source!, app.pairing!, math, app.tagEdits);
    const deck = rendered ? rendered.text : app.source!.text;
    const bare = composition() ? rest : null;
    const seen = virtual(bare ?? deck);
    if (text === REREAD) text = handed ?? seen;
    const from = handed ?? seen;
    let target = text ?? seen;
    if (text !== null && from !== seen) target = mergeEdits(from, fine(from, seen), fine(from, text), 'ours', true, true).text;
    if (text !== null) handed = text;
    const kept = (): string => (bare !== null ? mergeEdits(seen, fine(seen, virtual(deck)), fine(seen, target), 'ours', true).text : target);
    if (rendered && !rebase(rendered, math)) partial(kept());
    let reading: Edit | null = null;
    if (bare !== null) {
      const now = app.source!.text;
      const [head, tail] = shared(bare, now);
      reading = { start: head, end: now.length - tail, text: bare.slice(head, bare.length - tail) };
    }
    const changed: Element[] = [];
    const typesets: Promise<void>[] = [];
    const put = (next: string): boolean | null => {
      const w = windowIn(app.source!, next);
      if (!w) return true;
      const spot = locate(app.source!, app.pairing!, w.start, w.endA);
      if (spot.kind === 'reload') return false;
      if (intoComposition(spot, w)) return null;
      const had = app.caretHost();
      let done: Done | null;
      mine = true;
      try {
        done = applyAt(app, next, w, spot);
      } catch (e) {
        clean = false;
        throw Object.assign(e as Error, { target: kept() });
      } finally {
        mine = false;
      }
      if (!done) {
        clean = false;
        return false;
      }
      const r = reading;
      if (r) reading = w.endA <= r.start ? { start: r.start + w.endB - w.endA, end: r.end + w.endB - w.endA, text: r.text } : w.start >= r.end ? r : null;
      const mark = done.caret ? markOf() : null;
      const p = parked;
      if (p && p.host.isConnected && done.touched(p.host)) {
        const now = textIn(p.host, mathLookup());
        p.offset = mapOffset(p.offset, p.text, now);
        p.text = now;
      }
      if (had?.isConnected && !app.current()?.contains(had)) park(had);
      const texts = spot.kind === 'text' && !done.structural ? [spot.live] : done.hosts;
      settle(next, done, texts);
      typesets.push(typeset(done, mark));
      changed.push(...done.changed);
      return true;
    };
    const around = (list: Edit[]): boolean => {
      if (!list.length) return true;
      const r = put(applyEdits(app.source!.text, list));
      if (r !== null) return r;
      if (list.length === 1) {
        const lines = byLine(app.source!.text, list[0]);
        return lines[0] === list[0] || around(lines);
      }
      const mid = list.length >> 1;
      return around(list.slice(mid)) && around(list.slice(0, mid));
    };
    composition();
    const was = app.source!.text;
    const first = put(target);
    if (first === false) return reload();
    if (first === null && !around(edits(app.source!.text, target))) return app.source!.text === was ? reload() : partial(kept());
    const shown = app.source!.text;
    app.saved = shown;
    const without = reading ? shown.slice(0, reading.start) + reading.text + shown.slice(reading.end) : shown;
    if (composition()) rest = reading && without;
    behind = without === target ? null : { shown: without, want: target };
    await Promise.all(typesets);
    if (listeners.size && target !== handed) pending = true;
    return { reload: false, changed: changed.filter((el) => el.isConnected) };
  }

  function run(text: string | null | typeof REREAD): Promise<Applied> {
    queued += 1;
    return new Promise<Applied>((resolve, reject) => {
      chain = chain
        .then(async () => {
          applying = true;
          try {
            const r = await turn(text);
            if (r.reload && text !== null) behind = null;
            resolve(r);
          } catch (e) {
            reject(e);
          } finally {
            applying = false;
            queued -= 1;
          }
        })
        .then(() => {
          arm();
          if (pending) void flush();
        });
    });
  }

  function arm(): void {
    clearTimeout(net);
    if (reloaders.size) net = window.setTimeout(check, NET);
  }
  function check(): void {
    net = 0;
    if (!ready() || !clean || behind || applying || queued || busy()) return;
    if (app.files.render() !== app.source!.text) for (const fn of [...reloaders]) fn();
  }

  return {
    text: () => {
      if (!ready()) throw new Error('no file is open');
      if (handed !== null && (busy() || applying || queued)) return handed;
      lateRest();
      if (rest !== null && !composition()) rest = null;
      handed = virtual(rest ?? current());
      places = rest === null && !behind ? rendered : [];
      return handed;
    },
    places: () => places,
    copy: () => {
      if (!ready()) throw new Error('no file is open');
      return virtual(current());
    },
    apply: (text) => run(text),
    rebase: () => run(REREAD),
    onChange(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    onReload(fn) {
      reloaders.add(fn);
      return () => void reloaders.delete(fn);
    },
    reported,
  };
}
