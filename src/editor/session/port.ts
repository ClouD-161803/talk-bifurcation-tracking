// the port of the synchronous editor, through which the client of a session reads the deck as the
// text of its file, is told of each change by the person, and makes the deck read as a new text,
// e.g. the text with the edits of another person. the port is made at the start of every edit
// page. its members that read and apply the text are those of the engine in session.ts, which is
// installed only once a page starts or joins a session

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
import { caretOf, mapOffset, markOf, moved, putCaret, textIn } from './caret.ts';
import type { Host } from './host.ts';

const host: Host = { caretOf, mapOffset, markOf, moved, putCaret, textIn, fragmentRoot, parseFragment, refreshHeads, mathIn, mathLookup, setContentWithTex, apply, charEdits, edits, fine, mergeEdits, shared, detached, isTextElement, pair, pairElement, renderDeck, renderTextElement, unitsWithin, virtualChildren, contentRange, decode, elementRange, parseSource, segmentsOf, VOID, media, stateOf, RAW_TEXT, tokenize };

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

// the members of the port from the engine, and reported(), which resolves once every change of the
// person is reported through onChange, and no apply runs or waits
export type Engine = Pick<Port, 'text' | 'copy' | 'apply' | 'rebase' | 'onChange' | 'onReload'> & { reported(): Promise<void> };

// what the engine takes over at its install. clean holds while the source reads as the deck, and
// handed is the text last handed to the client, see install of session.ts
export type Tracked = { clean: boolean; handed: string | null };

declare global {
  interface Window {
    BeesonEditorSession?: (host: Host, app: App, tracked: Tracked) => Engine;
  }
}

let load: () => Promise<Port | null> = () => Promise.resolve(null);

// the engine of theme/editor-session.js loaded and installed once into the port of install, which
// resolves with the port, or with null when the script does not load, does not define its entry,
// or throws
export const loadEngine = (): Promise<Port | null> => load();

export function install(app: App): Port {
  let active = false;
  let status: string | null = null;
  let saver: () => Promise<void> | void = () => {};
  let engine: Engine | null = null;
  // tracked is kept from the start of the page until the engine is installed. on a page in a session
  // the engine is installed before the deck is opened, and on a page that loads the engine with
  // BeesonEditor.loadSession the deck is opened before it
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
    // the note of a command is shown in the state line until the next edit of the person
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
  };

  const absent = (): never => {
    throw new Error('the session code is not loaded');
  };

  const port: Port = {
    text: absent,
    copy: absent,
    apply: absent,
    rebase: absent,
    onChange: absent,
    onReload: absent,
    // the element of the page whose start tag is at offset of the text last applied or opened
    elementAt(offset) {
      const pairing = app.pairing;
      if (!pairing) return null;
      for (const map of [pairing.elements, pairing.inner]) for (const [live, s] of map) if (s.source === app.source && s.open?.start === offset && live.isConnected) return live;
      return null;
    },
    offsetOf(el) {
      const s = app.pairing?.elements.get(el) ?? app.pairing?.inner.get(el);
      return s && s.source === app.source && s.open ? s.open.start : null;
    },
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
          // the dialog does not tell a file that threw from a missing one, hence its error is reported
          console.error(e);
          return null;
        }
      },
      () => null,
    ));
  return port;
}
