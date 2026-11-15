// the port of the synchronous editor, through which the client of a session reads the deck as the
// text of its file, is told of each change by the person, and makes the deck read as a new text,
// e.g. the text with the edits of another person. the apply of apply.ts runs one at a time, once
// the history and the document model are quiet, and it is quiet itself: it does not record an
// entry of the history, mark the deck as changed, keep a draft, or start a save

import type { App } from '../app.ts';
import { mathLookup } from '../math.ts';
import { changes, merge } from '../merge.ts';
import { pair, pairElement, renderDeck, type Pairing } from '../render.ts';
import { parseSource } from '../source.ts';
import { applyAt, refresh, repairText, type Done } from './apply.ts';
import { graft, locate, retag, windowOf, type Spot } from './tree.ts';

// what an apply did: the elements it changed, e.g. for a flash, and reload when the deck could not
// be made to read as the text, after which the client loads the page again
export type Applied = { reload: boolean; changed: Element[] };

export type Port = {
  text(): string;
  apply(text: string): Promise<Applied>;
  onChange(fn: () => void): () => void;
  offsetOf(el: Element): number | null;
  elementAt(offset: number): Element | null;
  begin(): void;
  end(): void;
  setStatus(text: string | null): void;
  onSave(fn: () => Promise<void> | void): void;
};

type Page = { MathJax?: { typesetPromise?(els: Element[]): Promise<unknown> } };

export function install(app: App): Port {
  // clean holds while the source reads as the deck, i.e. since the last open or apply without an
  // edit of the person after it. mine holds while an apply changes the page, whose events are not
  // edits of the person
  let clean = false;
  let mine = false;
  let applying = false;
  let queued = 0;
  let chain: Promise<unknown> = Promise.resolve();
  let lastApplied: string | null = null;
  let status: string | null = null;
  let saver: () => Promise<void> | void = () => {};
  let active = false;
  const listeners = new Set<() => void>();
  let pending = false;
  let flushing = false;

  const reload = (): Applied => ({ reload: true, changed: [] });
  const ready = () => !!app.source && !!app.pairing && !!app.pairing.root;
  // the text of the deck now, with the edits of the person
  const current = (): string => (clean ? app.source!.text : app.files.render());

  app.listen('open', () => {
    clean = ready();
    lastApplied = null;
  });

  const changed = (): void => {
    if (mine) return;
    clean = false;
    if (!listeners.size) return;
    pending = true;
    void flush();
  };
  app.listen('dirty', changed);
  app.listen('history', changed);

  // the listeners are called once the history, the document model, and the applies are quiet, so
  // that the text they read is the deck after a whole change
  async function flush(): Promise<void> {
    if (flushing) return;
    flushing = true;
    try {
      while (pending) {
        await chain;
        await quiet();
        if (applying || queued) continue;
        pending = false;
        for (const fn of [...listeners]) fn();
      }
    } finally {
      flushing = false;
    }
  }

  async function quiet(): Promise<void> {
    while (!app.history.settled || app.doc.busy) {
      await app.history.settle();
      await app.doc.idle();
    }
  }

  // the text element of an open composition of an input method, which an apply into it waits for
  let composing: Element | null = null;
  let composed: (() => void)[] = [];
  document.addEventListener('compositionstart', (ev) => void (composing = app.hostOf(ev.target)), true);
  document.addEventListener('compositionend', () => {
    composing = null;
    for (const fn of composed.splice(0)) fn();
  }, true);
  const intoComposition = (spot: Spot): boolean => !!composing && spot.kind !== 'reload' && spot.kind !== 'tag' && (spot.live === composing || spot.live.contains(composing));

  // the source made to read as the deck with the edits of the person, as at a save: each edit of
  // the text of a text element or of a start tag is read into the tree of the source, and any
  // other edit parses the deck again. false when the deck does not read as its own text
  function rebase(): boolean {
    const source = app.source!;
    const math = mathLookup();
    const rendered = renderDeck(source, app.pairing!, math, app.tagEdits);
    const edits = [...rendered.edits].sort((a, b) => b.start - a.start);
    let ok = true;
    for (let i = 0; i < edits.length && ok; i++) {
      const e = edits[i];
      if (i > 0 && e.end > edits[i - 1].start) ok = false;
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
    app.pairing = pair(app.source, app.slides(), mathLookup());
    app.typing.attach();
    clean = renderDeck(app.source, app.pairing, mathLookup()).text === rendered.text;
    return clean;
  }

  function rebaseOne(next: string, math: ReturnType<typeof mathLookup>): boolean {
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

  // the pieces of the text elements in roots read again after MathJax, which split their text
  // at each formula
  function repiece(roots: Element[]): void {
    const pairing = app.pairing;
    if (!pairing || !roots.length) return;
    const math = mathLookup();
    const scratch: Pairing = { texts: [], byLive: new Map(), elements: new Map(), inner: new Map(), sections: [], problems: [], root: null };
    for (const t of pairing.texts) if (t.src.source === app.source && roots.some((r) => r.contains(t.live))) pairElement(t.src, t.live, t.slide, math, scratch);
    for (const r of roots) app.typing.markMath(r);
  }

  // after the page was changed: the target is the text of the deck, the history is pruned of the
  // entries that name a changed element, and a text element changed in place is tracked again
  function settle(target: string, done: Done): void {
    app.saved = target;
    lastApplied = target;
    clean = true;
    mine = true;
    try {
      app.history.prune(done.touched);
      for (const el of done.changed) if (app.pairing?.byLive.has(el)) app.history.track(el);
    } finally {
      mine = false;
    }
    if (done.structural) {
      app.report();
      app.invalidate();
    } else app.invalidate('content');
  }

  // after MathJax: the formulas of the new content are typeset, the new elements are drawn by the
  // theme, and the caret is put back
  async function typeset(done: Done): Promise<void> {
    const made = done.placed.filter((n) => n.isConnected);
    const mj = (window as unknown as Page).MathJax;
    const all = [...done.typeset];
    if (made.length && mj?.typesetPromise) all.push(mj.typesetPromise(made));
    if (!all.length) return;
    await Promise.allSettled(all);
    mine = true;
    try {
      const roots = [...done.hosts, ...made].filter((n) => n.isConnected);
      repiece(roots);
      const page = window as unknown as { Beeson?: { mount?(root: Element): void } };
      for (const n of made) page.Beeson?.mount?.(n);
      if (made.length) refresh(app);
      for (const el of done.hosts) if (el.isConnected && app.pairing?.byLive.has(el)) app.history.track(el);
      done.caret?.();
    } finally {
      mine = false;
    }
  }

  async function turn(text: string, snap: string | null): Promise<Applied> {
    for (;;) {
      await quiet();
      if (!ready()) return reload();
      const base = current();
      const from = snap ?? lastApplied ?? base;
      let target = text;
      // an edit of the person made since the text was read is kept, and wins at a conflict
      if (from !== base) {
        const ours = changes(from, base);
        const merged = ours && merge(from, ours, text, 'ours');
        if (merged) target = merged.text;
      }
      if (!clean && !rebase()) return reload();
      const source = app.source!;
      const w = windowOf(source.text, target);
      if (!w) {
        app.saved = target;
        lastApplied = target;
        return { reload: false, changed: [] };
      }
      const spot = locate(source, app.pairing!, w.start, w.endA);
      if (spot.kind === 'reload') return reload();
      if (intoComposition(spot)) {
        await new Promise<void>((done) => composed.push(done));
        continue;
      }
      let done: Done | null;
      mine = true;
      try {
        done = applyAt(app, target, w, spot);
      } finally {
        mine = false;
      }
      if (!done) {
        clean = false;
        return reload();
      }
      settle(target, done);
      await typeset(done);
      return { reload: false, changed: done.changed.filter((el) => el.isConnected) };
    }
  }

  function apply(text: string): Promise<Applied> {
    // the text of the deck when the apply is asked for, against which the client wrote text. the
    // turn of an apply queued after another starts from the text of the one before
    const snap = applying || queued || !ready() ? null : current();
    queued += 1;
    const run = chain.then(async () => {
      applying = true;
      try {
        return await turn(text, snap);
      } finally {
        applying = false;
        queued -= 1;
      }
    });
    chain = run.catch(() => {});
    void run.finally(() => {
      if (pending) void flush();
    });
    return run;
  }

  // the element of the page whose start tag is at offset of the text last applied or opened
  function elementAt(offset: number): Element | null {
    const pairing = app.pairing;
    if (!pairing) return null;
    for (const map of [pairing.elements, pairing.inner]) for (const [live, s] of map) if (s.source === app.source && s.open?.start === offset && live.isConnected) return live;
    return null;
  }

  function offsetOf(el: Element): number | null {
    const s = app.pairing?.elements.get(el) ?? app.pairing?.inner.get(el);
    return s && s.source === app.source && s.open ? s.open.start : null;
  }

  const session = {
    get status() {
      return status;
    },
    save: () => saver(),
  };

  return {
    text: () => {
      if (!ready()) throw new Error('no file is open');
      return current();
    },
    apply,
    onChange(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    offsetOf,
    elementAt,
    begin() {
      if (active) return;
      active = true;
      app.session = session;
      app.report();
    },
    end() {
      if (!active) return;
      active = false;
      app.session = null;
      app.report();
    },
    setStatus(text) {
      status = text;
      if (active) app.report();
    },
    onSave(fn) {
      saver = fn;
    },
  };
}
