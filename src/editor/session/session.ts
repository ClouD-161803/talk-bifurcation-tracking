// the port of the synchronous editor, through which the client of a session reads the deck as the
// text of its file, is told of each change by the person, and makes the deck read as a new text,
// e.g. the text with the edits of another person. the apply of apply.ts runs one at a time, once
// the history and the document model are quiet, and it is quiet itself: it does not record an
// entry of the history, mark the deck as changed, keep a draft, or start a save

import type { App } from '../app.ts';
import { setServed } from '../commands/origin.ts';
import { mathLookup, type MathLookup } from '../math.ts';
import { apply as applyEdits, edits, fine, mergeEdits, type Edit } from '../merge.ts';
import { pair, pairElement, renderDeck, type Pairing, type Rendered } from '../render.ts';
import { contentRange, elementRange, parseSource, type Source } from '../source.ts';
import { redrawTex as redrawDeckTex } from '../tex/install.ts';
import { applyAt, partial, refresh, repairText, type Done } from './apply.ts';
import { caretOf, mapOffset, markOf, moved, putCaret, textIn, type Mark } from './caret.ts';
import { graft, locate, retag, windowOf, type Spot, type Window } from './tree.ts';

// what an apply did: the elements it changed, e.g. for a flash, and reload when the deck could not
// be made to read as the text, after which the client loads the page again
export type Applied = { reload: boolean; changed: Element[] };

// the client reads text() inside a listener of onChange or after an apply has resolved, and writes
// the text of each apply against the text last handed to it, i.e. the text it last read or passed
// to apply. at a reload, apply leaves the deck as it was, and it rejects when it changed the deck in
// part, with an error whose target is the text of the apply with the edits of the person that the
// client has not read. an edit of the person that the client has not read is kept through every
// apply, and onChange is called after it. the listeners of onReload are called when the page does not read as
// its text after the applies, after which the client loads the page again. they get the text that
// the deck was meant to read, with these edits, when it is known. copy() reads the deck
// with the edits of the person at any time, and leaves the text handed to the client as it is.
// rebase() is an apply of the text handed to the client when its turn comes, which reads the deck
// into the source, e.g. so that offsetOf knows an element made since the last apply. redrawTex()
// draws the deck again with the tex.js next to it, after the edit command counted a change of it,
// and rejects when it fails. served() tells whether an edit command serves the page, see
// commands/origin.ts
export type Port = {
  text(): string;
  copy(): string;
  apply(text: string): Promise<Applied>;
  rebase(): Promise<Applied>;
  onChange(fn: () => void): () => void;
  onReload(fn: (target?: string) => void): () => void;
  offsetOf(el: Element): number | null;
  elementAt(offset: number): Element | null;
  begin(): void;
  served(on: boolean): void;
  end(): void;
  setStatus(text: string | null): void;
  onSave(fn: () => Promise<void> | void): void;
  redrawTex(): Promise<void>;
};

type Page = { MathJax?: { typesetPromise?(els: Element[]): Promise<unknown> } };

// the time in ms after the last apply at which the page is read against its text
const NET = 500;
// the text of a turn of rebase(), read in the turn
const REREAD = Symbol('reread');

// the window of b against source.text. an insertion or a removal at the end of div.slides, e.g. a
// slide after the last slide, whose common start runs into the end tag of div.slides, is moved
// back over the bytes that it repeats, to start before this tag
function windowIn(source: Source, b: string): Window | null {
  const a = source.text;
  let w = windowOf(a, b);
  const cr = contentRange(source.slides);
  if (!w || !cr) return w;
  while (w.start > cr.start && w.endA > cr.end && (w.endA === w.start ? a[w.start - 1] === b[w.endB - 1] : w.endB === w.start && a[w.start - 1] === a[w.endA - 1])) w = { start: w.start - 1, endA: w.endA - 1, endB: w.endB - 1 };
  return w;
}

// an edit over lines of text split into an edit of each changed line, narrowed to the characters
// that differ, when it keeps the number of lines. e itself otherwise
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

export function install(app: App): Port {
  // clean holds while the source reads as the deck, i.e. since the last open or apply without an
  // edit of the person after it. mine holds while an apply changes the page, whose events are not
  // edits of the person. handed is the text last handed to the client, hence an edit of the person
  // that the client has not read is the difference of the deck from it
  let clean = false;
  let mine = false;
  let handed: string | null = null;
  let applying = false;
  let queued = 0;
  let chain: Promise<unknown> = Promise.resolve();
  let status: string | null = null;
  let saver: () => Promise<void> | void = () => {};
  let active = false;
  const listeners = new Set<() => void>();
  const reloaders = new Set<(target?: string) => void>();
  let pending = false;
  let flushing: Promise<void> | null = null;
  let net = 0;

  // the text element of an open composition of an input method. the changes of its text are held
  // back until the composition ends, while behind holds the text shown and the text wanted. the
  // client reads prior during the composition, the deck as it was before it with the applies since,
  // hence the composing word is read once it is committed
  let composing: Element | null = null;
  let behind: { shown: string; want: string } | null = null;
  let prior: string | null = null;

  // the caret of a text element that an apply moved to a slide that is not shown, as an offset into
  // the text of the element, see park
  let parked: { host: Element; offset: number; text: string } | null = null;

  const reload = (): Applied => ({ reload: true, changed: [] });
  const ready = () => !!app.source && !!app.pairing && !!app.pairing.root;
  const busy = () => !app.history.settled || app.doc.busy;
  // the text of the deck now, with the edits of the person
  const current = (): string => (clean ? app.source!.text : app.files.render());
  // the text of the deck with the changes held back, merged as the authority of the session
  // orders them, since they arrived before the edits of the person
  const virtual = (deck: string): string => (behind ? mergeEdits(behind.shown, fine(behind.shown, deck), fine(behind.shown, behind.want), 'ours', true).text : deck);

  app.listen('open', () => {
    clean = ready();
    handed = clean ? app.source!.text : null;
    behind = null;
    prior = null;
    parked = null;
  });

  const changed = (): void => {
    if (mine) return;
    // the note of a command is shown in the state line until the next edit of the person
    if (active && app.note) {
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

  // the listeners are called once the history, the document model, and the applies are quiet, so
  // that the text they read is the deck after a whole change
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

  // once every change of the person is reported through onChange, and no apply runs or waits
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

  // the changes held back are applied once the composition ends. a browser may not send its end
  // when the text loses the focus, e.g. Safari on a click, or when the page is hidden, and the
  // focusout waits a task for the end that Firefox sends after it. the page is loaded again when
  // the changes held back cannot be applied, also when they change the deck in part
  const reloadAll = (target?: string): void => {
    for (const fn of [...reloaders]) fn(target);
  };
  // at a reload the deck is as it was, and reads with the changes still held back as the text that
  // it was meant to read
  const ended = (): void => {
    if (prior !== null) {
      prior = null;
      if (listeners.size) {
        pending = true;
        void flush();
      }
    }
    if (behind) void run(null).then((r) => {
      if (r.reload) reloadAll(ready() ? virtual(current()) : undefined);
    }, (e) => reloadAll((e as { target?: string } | null)?.target));
  };
  // Safari sends the input of the committed text after compositionend, hence the end waits a task
  // for it, unless a new composition starts first
  let release = 0;
  document.addEventListener('compositionstart', (ev) => {
    clearTimeout(release);
    composing = app.hostOf(ev.target);
    prior = composing && ready() ? (handed !== null && (busy() || applying || queued) ? handed : virtual(current())) : null;
  }, true);
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

  // the text element of the open composition, which is over once the element is taken off the page
  // or does not have the focus
  function composition(): Element | null {
    const a = document.activeElement;
    if (composing && (!composing.isConnected || !a || !composing.contains(a))) composing = null;
    return composing;
  }

  // whether the apply of the window w at spot would set or move the composing text. a change
  // within one of its parents that leaves the unit of the composing text as it is keeps its node
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

  // the source made to read as the rendered deck, as at a save: each edit of the text of a text
  // element or of a start tag is read into the tree of the source, and any other edit parses the
  // deck again. false when the deck does not read as its own text
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
  // entries that name a changed element, apart from the typing of the person in texts, and a text
  // element changed in place is tracked again, with the typing in it carried over the change
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

  // after MathJax: the formulas of the new content are typeset, the new elements are drawn by the
  // theme, and the caret is put back unless the person moved it since mark
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

  // the caret of host, which an apply moved to a slide that is not shown, where it cannot have the
  // focus. the person stays on the slide, and the first key that types shows the slide of host and
  // puts the caret back, hence the key goes into host. a press, a focus, or a move to another slide
  // lets the caret go
  function park(host: Element): void {
    const math = mathLookup();
    const c = caretOf(host, math);
    const text = c ? c.text : textIn(host, math);
    parked = { host, offset: c ? c.offset : text.length, text };
  }
  // a character typed with Option or AltGr types, and a dead key or an input method starts to
  // type, where a shortcut does not
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
  // the keyboard of a phone sends the key Unidentified, and its input is known at beforeinput. the
  // first input after an apply reads the page against its text before it changes the deck
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

  // the turn of an apply of text, or of the changes held back when text is null
  async function turn(text: string | null | typeof REREAD): Promise<Applied> {
    await quiet();
    if (!ready()) return reload();
    if (text === null && !behind) return { reload: false, changed: [] };
    // the deck is rendered once, and not at all while the source reads as it
    const math = clean ? null : mathLookup();
    const rendered = math && renderDeck(app.source!, app.pairing!, math, app.tagEdits);
    const seen = virtual(rendered ? rendered.text : app.source!.text);
    if (text === REREAD) text = handed ?? seen;
    const from = handed ?? seen;
    let target = text ?? seen;
    // an edit of the person that the client has not read is kept, and wins at a conflict. the
    // authority orders it after the text, which arrived first
    if (text !== null && from !== seen) target = mergeEdits(from, fine(from, seen), fine(from, text), 'ours', true).text;
    if (text !== null && prior !== null) prior = prior === from ? text : mergeEdits(from, fine(from, prior), fine(from, text), 'ours', true).text;
    if (text !== null) handed = text;
    // a rebase that fails has read the source again from the page, which then renders otherwise
    if (rendered && !rebase(rendered, math)) partial(target);
    const changed: Element[] = [];
    const typesets: Promise<void>[] = [];
    // the deck made to read as next by one apply: false when the page is loaded again, and null
    // when the apply would set or move the text of an open composition
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
        throw Object.assign(e as Error, { target });
      } finally {
        mine = false;
      }
      if (!done) {
        clean = false;
        return false;
      }
      const mark = done.caret ? markOf() : null;
      const p = parked;
      if (p && p.host.isConnected && done.touched(p.host)) {
        const now = textIn(p.host, mathLookup());
        p.offset = mapOffset(p.offset, p.text, now);
        p.text = now;
      }
      if (had?.isConnected && !app.current()?.contains(had)) park(had);
      // the text elements whose text the apply wrote, where an entry of typing is kept
      const texts = spot.kind === 'text' && !done.structural ? [spot.live] : done.hosts;
      settle(next, done, texts);
      typesets.push(typeset(done, mark));
      changed.push(...done.changed);
      return true;
    };
    // the edits of list by as few applies as go around the composing text, from the last to the
    // first, so that the offsets of the others hold. an edit that reaches into it is held back, and
    // an edit of lines next to it, which edits makes one, is taken line by line
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
    // around() may apply edits before one that it cannot apply, after which the deck reads as neither
    // text
    if (first === null && !around(edits(app.source!.text, target))) return app.source!.text === was ? reload() : partial(target);
    const shown = app.source!.text;
    app.saved = shown;
    behind = shown === target ? null : { shown, want: target };
    await Promise.all(typesets);
    if (listeners.size && target !== handed) pending = true;
    return { reload: false, changed: changed.filter((el) => el.isConnected) };
  }

  // a turn queued after the others
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

  // the page read against its text once the applies are over, or at the first input after them,
  // while the person does not change the deck: a page that does not read as its text after an
  // apply is loaded again
  function arm(): void {
    clearTimeout(net);
    if (reloaders.size) net = window.setTimeout(check, NET);
  }
  function check(): void {
    net = 0;
    if (!ready() || !clean || behind || applying || queued || busy()) return;
    if (app.files.render() !== app.source!.text) for (const fn of [...reloaders]) fn();
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
    save: async () => {
      await reported();
      return saver();
    },
  };

  return {
    // during an operation or an apply, the text last handed, rather than a render of a deck
    // changed in part
    text: () => {
      if (!ready()) throw new Error('no file is open');
      if (handed !== null && (busy() || applying || queued)) return handed;
      if (prior !== null && !composition()) prior = null;
      return (handed = prior ?? virtual(current()));
    },
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
    offsetOf,
    elementAt,
    served: setServed,
    begin() {
      if (active) return;
      active = true;
      // a note from before the session is not shown in it
      app.note = null;
      app.session = session;
      app.emit('session');
      app.report();
    },
    end() {
      if (!active) return;
      active = false;
      app.session = null;
      app.emit('session');
      app.report();
    },
    setStatus(text) {
      status = text;
      if (active) app.report();
    },
    onSave(fn) {
      saver = fn;
    },
    redrawTex: () => redrawDeckTex(app),
  };
}
