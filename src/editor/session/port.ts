import type { FigureState } from '../../session/protocol.ts';
import type { App } from '../app.ts';
import { setServed } from '../commands/origin.ts';
import { refreshHeads } from '../history.ts';
import { mathIn, mathLookup, setContentWithTex } from '../math.ts';
import { media } from '../media/store.ts';
import { apply, charEdits, edits, fine, mergeEdits, shared } from '../merge.ts';
import { fragmentRoot, parseFragment } from '../model/fragments.ts';
import { detached, isTextElement, pair, pairElement, renderDeck, renderTextElement, unitsWithin, virtualChildren } from '../render.ts';
import { contentRange, decode, elementRange, parseSource, segmentsOf, VOID } from '../source.ts';
import { stateOf } from '../tags.ts';
import { redrawTex as redrawDeckTex } from '../tex/install.ts';
import { RAW_TEXT, tokenize } from '../tokens.ts';
import { script } from '../ui/script.ts';
import { caretOf, mapOffset, markOf, moved, putCaret, runsOf, textIn } from './caret.ts';
import type { Host } from './host.ts';

const SEND_WAIT = 4000;

const host: Host = { caretOf, mapOffset, markOf, moved, putCaret, runsOf, textIn, fragmentRoot, parseFragment, refreshHeads, mathIn, mathLookup, setContentWithTex, apply, charEdits, edits, fine, mergeEdits, shared, detached, isTextElement, pair, pairElement, renderDeck, renderTextElement, unitsWithin, virtualChildren, contentRange, decode, elementRange, parseSource, segmentsOf, VOID, media, stateOf, RAW_TEXT, tokenize };

export type Applied = { reload: boolean; changed: Element[] };

export type Port = {
  text(): string;
  places(): number[];
  copy(): string;
  apply(text: string): Promise<Applied>;
  rebase(): Promise<Applied>;
  onChange(fn: () => void): () => void;
  onReload(fn: (target?: string) => void): () => void;
  offsetOf(el: Element): number | null;
  elementsAt(): Map<number, Element>;
  begin(): void;
  served(on: boolean): void;
  end(): void;
  setStatus(text: string | null): void;
  onSave(fn: () => Promise<void> | void): void;
  redrawTex(): Promise<void>;
  reloadFigure(name: string, hash: string): Promise<boolean>;
  figures(link: FigureLink): void;
};

export type FigureLink = { state(): FigureState | null; token(): string; on(fn: (state: FigureState) => void): void; host(): boolean };
let figures: FigureLink | null = null;
export const figureLink = (): FigureLink | null => figures;

export type Engine = Pick<Port, 'text' | 'places' | 'copy' | 'apply' | 'rebase' | 'onChange' | 'onReload'> & { reported(): Promise<void> };

export type Tracked = { clean: boolean; handed: string | null };

declare global {
  interface Window {
    BeesonEditorSession?: (host: Host, app: App, tracked: Tracked) => Engine;
  }
}

let load: () => Promise<Port | null> = () => Promise.resolve(null);

export const loadEngine = (): Promise<Port | null> => load();

export function install(app: App): Port {
  let active = false;
  let status: string | null = null;
  let saver: () => Promise<void> | void = () => {};
  let engine: Engine | null = null;
  const tracked: Tracked = { clean: false, handed: null };
  const ready = () => !!app.source && !!app.pairing && !!app.pairing.root;
  const busy = () => !app.history.settled || app.doc.busy;

  app.listen('open', () => {
    if (engine) return;
    tracked.clean = ready();
    tracked.handed = tracked.clean ? app.source!.text : null;
  });
  const changed = (): void => {
    if (engine) return;
    if (active && app.note) {
      app.note = null;
      app.report();
    }
    tracked.clean = false;
  };
  app.listen('dirty', changed);
  app.listen('history', changed);

  const session = {
    get status() {
      return status;
    },
    save: async () => {
      if (engine) await engine.reported();
      else
        while (busy()) {
          await app.history.settle();
          await app.doc.idle();
        }
      return saver();
    },
    sent: async () => {
      let timer = 0;
      const late = new Promise<never>((_, fail) => {
        timer = window.setTimeout(() => fail(new Error('Your last changes are not sent yet. Try again once they are saved')), SEND_WAIT);
      });
      try {
        await Promise.race([session.save(), late]);
      } finally {
        clearTimeout(timer);
      }
    },
  };

  const absent = (): never => {
    throw new Error('the session code is not loaded');
  };

  const port: Port = {
    text: absent,
    places: () => [],
    copy: absent,
    apply: absent,
    rebase: absent,
    onChange: absent,
    onReload: absent,
    elementsAt() {
      const by = new Map<number, Element>();
      const pairing = app.pairing;
      if (!pairing) return by;
      for (const map of [pairing.elements, pairing.inner]) for (const [live, s] of map) if (s.source === app.source && s.open && !by.has(s.open.start) && live.isConnected) by.set(s.open.start, live);
      return by;
    },
    offsetOf(el) {
      const s = app.pairing?.elements.get(el) ?? app.pairing?.inner.get(el);
      return s && s.source === app.source && s.open ? s.open.start : null;
    },
    served: setServed,
    begin() {
      if (active) return;
      active = true;
      app.note = null;
      app.session = session;
      app.emit('session');
      app.report();
    },
    end() {
      if (!active) return;
      active = false;
      figures = null;
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
    reloadFigure: async (name, hash) => (await window.Beeson?.figures?.reload?.(name, hash)) ?? false,
    figures(link) {
      figures = link;
      link.on((state) => {
        window.Beeson?.figures?.compiling?.(state.compiling);
        app.invalidate('selection');
      });
    },
  };

  let loading: Promise<Port | null> | null = null;
  load = () =>
    (loading ??= script('editor-session.js').then(
      () => {
        const start = window.BeesonEditorSession;
        if (typeof start !== 'function') return null;
        try {
          const { reported, ...members } = start(host, app, { ...tracked });
          engine = { reported, ...members };
          Object.assign(port, members);
          return port;
        } catch (e) {
          console.error(e);
          return null;
        }
      },
      () => null,
    ));
  return port;
}
