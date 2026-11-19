// the core of the client of a session: the replica of the deck, the long poll of events, the
// operations sent to the edit command, and the reconnects. each part of the client, e.g. the save
// state, is installed on one Client by main.ts, and reads its fields and its events.
//
// the deck and the replica are kept apart by one rule: the text of the deck is read into the
// replica only after onChange of the port reported a change by the person, and never while an
// apply runs. an apply that leaves the deck at another text loads the page again, since sending
// that text as an edit would undo the work of another person for everyone

import type { App } from '../../editor/app.ts';
import type { Applied, Port } from '../../editor/session/port.ts';
import { apply, diff, mergePatches } from '../patch.ts';
import { dropped, early, keeps } from './copy.ts';
import { NAME, store } from './join.ts';
import { FULL, type AppliedOp, type CommentsEvent, type Ended, type EventsAnswer, type FigureState, type HelloAnswer, type HelloRequest, type KnownPerson, type OpPost, type Person, type Presence, type Restored, type Taken, type Token, type Version } from '../protocol.ts';
import type { Side } from '../replica.ts';
import type { Handover } from './handover.ts';
import type { Resolved } from './presence.ts';
import { Sync, type Whole } from './sync.ts';
import { SHORT, takeSlot } from './slot.ts';
import { Failure, Transport } from './transport.ts';

// joining: before the first answer of hello. online: the last request was answered. offline: a
// request failed on the network or with an error of the edit command, and the next reconnect is at
// retryAt. no-host: the relay answered that no edit command is registered for the session. ended:
// the session ended
export type Connection = 'joining' | 'online' | 'offline' | 'no-host' | 'ended';

export type ClientEvents = {
  // the name, the color, or the host flag of this page changed
  me: [];
  people: [];
  known: [];
  presence: [];
  // the operations of an answer, before they are applied, e.g. for the log of presence.ts
  ops: [AppliedOp[]];
  // resolved() changed
  resolved: [];
  // an apply changed the deck, with the elements that it changed
  applied: [Element[]];
  // the deck was drawn again with a new tex.js, e.g. with new numbers of its citations
  tex: [];
  // the state of the TikZ figures changed, or an answer of hello told it
  figures: [FigureState];
  // a drive ended, with whether the base moved on after the last applied without an apply, e.g. at
  // the broadcast of an operation of this page
  settled: [moved: boolean];
  // operations of others were merged into the edits of this page, whose text was before
  rebased: [before: string];
  // connection, saving, retryAt, blocked, or warning changed
  state: [];
  ended: [Ended];
  // an answer of hello was taken, after which the history is read again
  hello: [];
  // the rev of the version history changed, and a restore was made
  history: [number];
  restored: [Restored];
  // the base of the replica moved from text at version v, by the operations given, or by a resync
  // when they are null
  base: [text: string, v: Version, ops: AppliedOp[] | null];
  // the comments of an answer of events, whose anchors are of the text at version v
  comments: [CommentsEvent, Version];
  // a change of index.html from outside replaced text that a person wrote in the session
  overwritten: [];
};

// the parts of the offline path that the core calls, set by conflicts.ts and media.ts
export type Hooks = {
  // the side that wins at a conflict of the whole text and the operations that the next drive
  // merges, after a dialog when it is a promise, or null for a typing race, where mine wins
  side?(sync: Sync, whole: Whole | null, ops: AppliedOp[]): Side | Promise<Side> | null;
  // false while text names a file that is not uploaded yet, after which rewrite() is called
  ready?(text: string): boolean;
  // the paths of the files that text names and that wait for their upload, while the edits that
  // do not name them are sent
  held?(text: string): string[];
  // a promise while a reload of the page has to wait, e.g. for the end of Version History
  defer?(): Promise<void> | null;
};

// the reconnects in s, the last one repeated
export const RETRY = [1, 2, 4, 8, 16, 30];
// an edit waits this long in ms before the state says Saving…
const SAVING = 500;
// the longest wait in ms for onChange after an apply that a change of the person ran into
const LATE_CHANGE = 2000;
// a poll refused this soon in ms after a hello, e.g. of a page that the ninth page of its person
// evicts, waits for the reconnect before the next hello
const BOUNCE = 5000;
export const BLOCKED = 'Your changes cannot be sent. Load the page again.';

export class Client {
  readonly app: App;
  readonly port: Port;
  readonly shell: Omit<Handover, 'app' | 'port'>;
  readonly transport: Transport;

  // the public id of this page, its person, and the token of its requests, set by hello
  client = '';
  person = '';
  name = '';
  color = 0;
  host = false;
  token: Token = '';
  // the pages of the session, every person who ever joined it, and the presence of each page
  people: Person[] = [];
  known: KnownPerson[] = [];
  presence: Presence[] = [];
  connection: Connection = 'joining';
  // true once an edit of this page has waited for its acknowledgment over SAVING ms
  saving = false;
  // the time of the next reconnect in ms of Date.now(), or null
  retryAt: number | null = null;
  // the time in ms of Date.now() at which the poll first failed since the last reconnect, or null.
  // a failed operation alone leaves the page offline while its poll brings the edits of others
  lostAt: number | null = null;
  // the first hello was refused since the session is full, and is sent again at the next reconnect
  full = false;
  // an operation of this page was refused as invalid after a resync, and nothing is sent any more
  blocked = false;
  // a warning of the edit command shown in the save state while the page is online, e.g. that it
  // cannot write index.html
  warning: string | null = null;
  ended: Ended | null = null;
  // the guest left with Leave Session, after which the page is ended as at the end of the session
  left = false;
  // the page is hidden for good and said bye. it sends nothing after it, since a poll would bring
  // it back into the session, and its unsent edits are kept by the copy
  gone = false;
  hooks: Hooks = {};
  // the presence of the other pages, read as elements of this page, set by presence.ts
  resolved: () => Resolved[] = () => [];

  private sync: Sync | null = null;
  // the text of the authority that this page received last, and its version, which the offsets of
  // a presence state refer to
  get base(): { text: string; v: Version } | null {
    return this.sync && { text: this.sync.base, v: this.sync.version };
  }

  // the version after the operations taken from the last answer, which the next poll asks after
  private since: Version = '';
  // the count of the changes of tex.js of the last answer. a count that differs draws the deck again
  // with tex.js. each run of the edit command counts from the time of its start, hence a page draws
  // it once when it joins, and once after a restart
  private tex = 0;
  // the state of the TikZ figures told last, and the hash of each output being loaded or loaded
  figures: FigureState | null = null;
  private figureLoads = new Map<string, string>();
  // counts the hellos after the first, so that a poll sent before one is not taken
  private generation = 0;
  private readonly listeners = new Map<keyof ClientEvents, Set<(...args: never[]) => void>>();

  // a change by the person, reported by onChange and not yet read into the replica
  private dirty = false;
  private changes = 0;
  private changeWaiters: (() => void)[] = [];
  private framed = false;
  private driving = false;
  // a drive waits on the person in the dialog of the conflicts, which the end does not wait for
  private deciding = false;
  private inbox: AppliedOp[] = [];
  // the whole text of an answer of hello, merged by resync
  private fresh: { text: string; v: Version } | null = null;
  // after an apply that left the deck at another text: nothing is applied to the deck, the edits of
  // the person are read by capture(), and the page is loaded again once they are acknowledged
  private frozen = false;
  // the text that the deck reads as, apart from the edits that the person made since, or null once
  // this is not known, e.g. after an apply that the deck did not take
  private handed: string | null = null;
  // the browser asks before the page unloads while an edit is not acknowledged that the copy of
  // the page cannot keep in this browser. the listener is there only meanwhile, since Firefox keeps
  // a page with one out of its back-forward cache
  private readonly ask = (ev: BeforeUnloadEvent): void => {
    ev.preventDefault();
    ev.returnValue = true;
  };
  private asking = false;
  // the text of an apply that returned reload, which the deck does not read as, and which text() of
  // the port gives while a change of the person settles
  private unshown: string | null = null;
  private rewrites: ((text: string) => string)[] = [];

  private sending: OpPost | null = null;
  private idleWaiters: (() => void)[] = [];
  // called once the drive that runs is over
  private driveWaiters: (() => void)[] = [];
  // the end of the last hello after a refused poll, and the polls refused soon after a hello since
  // the last poll answered
  private rejoinedAt = 0;
  private bounces = 0;
  private joining: Promise<void> | null = null;
  private attempt = 0;
  private retry: { finish: () => void; promise: Promise<void> } | null = null;
  private savingTimer = 0;
  private ackWaiters: { done: () => void; fail: (e: Error) => void }[] = [];
  private presenceState: unknown = null;
  private presenceDue = false;
  private presenceBusy = false;
  private presenceTry = 0;
  // whether this page polls long, and the release of its lock
  private long = false;
  private release = (): void => {};

  constructor(handover: Handover) {
    const { app, port, ...shell } = handover;
    this.app = app;
    this.port = port;
    this.shell = shell;
    // the end that the relay keeps after End session, e.g. for a guest that was offline then
    this.transport = new Transport(location.href, (ended) => {
      if (this.sync) this.end(ended);
    });
    port.onChange(() => this.onChange());
    port.onSave(() => this.flush());
    // the port found that the page does not read as its text after an apply. the edits of the person
    // that were not read are taken from the text that the deck was meant to read, when it is known
    port.onReload((target) => {
      if (target !== undefined && !this.frozen) this.capture(target);
      this.freeze(null);
    });
  }

  on<K extends keyof ClientEvents>(event: K, fn: (...args: ClientEvents[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn as (...args: never[]) => void);
    return () => void set.delete(fn as (...args: never[]) => void);
  }

  // also by a part for an event that it owns, e.g. resolved of presence.ts
  emit<K extends keyof ClientEvents>(event: K, ...args: ClientEvents[K]): void {
    for (const fn of [...(this.listeners.get(event) ?? [])]) {
      try {
        (fn as (...a: ClientEvents[K]) => void)(...args);
      } catch (e) {
        // a listener that fails is reported, and the client goes on, e.g. with its poll
        if (typeof reportError === 'function') reportError(e);
        else console.error(e);
      }
    }
  }

  // the address of a request under .session/, e.g. url('share')
  url(route: string, query?: Record<string, string>): string {
    return this.transport.url(route, query);
  }

  // hello sent until it is answered, through the reconnects of the offline state
  async hello(request: HelloRequest): Promise<HelloAnswer | Taken> {
    for (;;) {
      try {
        const answer = await this.transport.hello(request);
        this.full = false;
        this.online();
        return answer;
      } catch (e) {
        if (e instanceof Failure && !e.retried) throw e;
        this.full = e instanceof Failure && e.status === 503 && e.message === FULL;
        await this.offline(e);
      }
    }
  }

  // the session begins with the first answer of hello. text is the text of the page at version v
  begin(answer: HelloAnswer, text: string, v: Version): void {
    this.accept(answer);
    this.sync = new Sync(answer.client, text, v);
    this.handed = text;
    if (answer.text !== undefined) this.fresh = { text: answer.text, v: answer.v };
    else this.receive(answer.ops);
    this.since = answer.v;
    this.setConnection('online');
    // the keys that are not read are sent when the page is hidden, since a hidden page draws no
    // frame that reads them, and a phone may suspend it or close it without pagehide
    const send = (): void => {
      if (this.dirty) this.dirty = !this.capture();
      this.pump();
    };
    document.addEventListener('visibilitychange', send);
    window.addEventListener('pagehide', () => {
      if (!this.token || this.ended) return;
      send();
      this.gone = true;
      this.transport.bye(this.token);
    });
    // a page kept in the cache of the browser said bye, hence it joins again as a new page
    window.addEventListener('pageshow', (ev) => {
      if (ev.persisted) location.reload();
    });
    // the edit command drops a page that has not polled 5 s after its hello
    void this.poll();
    void this.drive();
    if (this.presenceDue) void this.flushPresence();
  }

  // the version of the newest operations taken, which the deck reads once they are applied
  get version(): Version {
    return this.since;
  }

  setWarning(text: string | null): void {
    if (text === this.warning) return;
    this.warning = text;
    this.emit('state');
  }

  // the name of this page after Change Name, also in the people of the session as last heard, from
  // which the initials are drawn
  setName(name: string): void {
    this.name = name;
    for (const page of this.people) if (page.person === this.person) page.name = name;
    this.emit('me');
  }

  sendPresence(state: unknown): void {
    this.presenceState = state;
    this.presenceDue = true;
    if (!this.presenceBusy && this.token) void this.flushPresence();
  }

  leave(): void {
    if (this.ended) return;
    this.left = true;
    if (this.token) this.transport.bye(this.token);
    this.end({ by: null });
  }

  // the reconnect that waits is made now
  tryNow(): void {
    this.retry?.finish();
  }

  // every edit of this page is acknowledged by the edit command
  acked(): boolean {
    return !!this.sync && !this.dirty && !this.rewrites.length && !this.sending && this.sync.acked;
  }

  // the page waits for its acknowledgments to load again, and the deck lacks the operations since
  get reloading(): boolean {
    return this.frozen;
  }

  // fn applied to the text of the deck at the next drive, which runs now, e.g. for the name of an
  // uploaded file, and the deck made to read as its result
  rewrite(fn?: (text: string) => string): void {
    if (fn) this.rewrites.push(fn);
    void this.drive();
  }

  // the text of the authority that this page applied, its version, and the text of the deck
  snapshot(): { base: string; v: Version; mine: string } | null {
    return this.sync && { base: this.sync.base, v: this.sync.version, mine: this.sync.mine };
  }

  // the page loaded again by the person, e.g. with Load again while it is blocked
  loadAgain(): void {
    this.askBeforeUnload(false);
    location.reload();
  }

  private askBeforeUnload(on: boolean): void {
    if (on === this.asking) return;
    this.asking = on;
    if (on) window.addEventListener('beforeunload', this.ask);
    else window.removeEventListener('beforeunload', this.ask);
  }

  // the save state is drawn again, e.g. after a failed upload or a write of the copy of the page
  refresh(): void {
    this.askBeforeUnload(this.unkept());
    this.emit('state');
  }

  private unkept(): boolean {
    // a change that is not read yet is in neither the replica nor the copy. once join.ts has given
    // the copy before the join, this copy is read from the deck, and join.ts checks again after each
    // change
    return !this.acked() && !this.ended && ((this.dirty && (!!this.sync || !early(this))) || !keeps(this));
  }

  // resolves once every edit of this page is acknowledged, which is a save in a session
  flush(): Promise<void> {
    if (this.acked()) return Promise.resolve();
    if (this.ended) return Promise.reject(new Error('The session has ended'));
    if (this.blocked) return Promise.reject(new Error(BLOCKED));
    if (this.dirty) this.frame();
    return new Promise((done, fail) => this.ackWaiters.push({ done, fail }));
  }

  private accept(a: HelloAnswer): void {
    this.client = a.client;
    this.token = a.token;
    this.person = a.person;
    this.name = a.name;
    store(NAME, a.name);
    this.color = a.color;
    this.host = a.host;
    this.people = a.people;
    this.known = a.known;
    this.texCount(a.tex);
    this.takeFigures(a.figures);
    this.emit('me');
    this.emit('people');
    this.emit('known');
    this.emit('hello');
  }

  private setConnection(connection: Connection): void {
    if (this.connection === connection || this.connection === 'ended') return;
    this.connection = connection;
    this.emit('state');
  }

  private onChange(): void {
    this.changes++;
    for (const fn of this.changeWaiters.splice(0)) fn();
    // read at once, where the port gives the text of the deck
    if (this.frozen) {
      this.dirty = !this.capture();
      void this.drive();
      return;
    }
    this.dirty = true;
    this.frame();
    this.check();
  }

  // the deck is read once per animation frame at most
  private frame(): void {
    if (this.framed) return;
    this.framed = true;
    const run = () => {
      if (!this.framed) return;
      this.framed = false;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      void this.drive();
    };
    const raf = requestAnimationFrame(run);
    // a page behind other windows does not draw frames
    const timer = window.setTimeout(run, 100);
  }

  private read(): string | null {
    try {
      return this.port.text();
    } catch {
      return null;
    }
  }

  // the change of the person is read into the replica before the operations are merged, so that the
  // text that apply() gets is written against the deck as it reads now. the texts of several
  // answers that wait are merged into one, and only the newest is applied
  private async drive(): Promise<void> {
    const sync = this.sync;
    if (!sync || this.driving) return;
    this.driving = true;
    // the version of the base that the listeners of applied read last
    let read = sync.version;
    try {
      for (;;) {
        if (this.frozen) {
          // the edits are sent and their broadcasts taken, and nothing is applied to the deck
          // a change of the person that settles calls onChange, which captures it
          if (this.dirty) this.dirty = !this.capture();
          for (const fn of this.rewrites.splice(0)) sync.edit(fn(sync.mine));
          if (this.fresh) this.resync(this.fresh.text, this.fresh.v);
          this.fresh = null;
          if (this.inbox.length) this.merge(this.inbox.splice(0));
          break;
        }
        let stale = false;
        if (this.dirty) {
          this.dirty = false;
          const text = this.read();
          if (text !== null) {
            if (sync.edit(text, this.port.places()) !== null) stale = true;
            this.handed = text;
          }
        }
        for (const fn of this.rewrites.splice(0)) {
          const text = fn(sync.mine);
          if (text === sync.mine) continue;
          sync.edit(text);
          stale = true;
        }
        const side = (this.fresh || this.inbox.length) && this.hooks.side?.(sync, this.fresh, this.inbox);
        if (side) {
          this.deciding = true;
          for (const fn of this.driveWaiters.splice(0)) fn();
          const wins = await Promise.resolve(side).finally(() => (this.deciding = false));
          // the end closed the dialog, and the deck keeps the version of the person
          if (this.ended) break;
          const was = { text: sync.base, v: sync.version };
          const whole = this.fresh;
          const ops = this.inbox.splice(0);
          if (sync.settle(whole, ops, wins) !== null) stale = true;
          this.fresh = null;
          if (sync.version !== was.v) this.emit('base', was.text, was.v, whole ? null : ops);
        }
        if (this.fresh) {
          const { text, v } = this.fresh;
          this.fresh = null;
          if (this.resync(text, v) !== null) stale = true;
        }
        if (this.inbox.length && this.merge(this.inbox.splice(0)) !== null) stale = true;
        if (!stale) break;
        read = sync.version;
        if (!(await this.applyMine())) break;
      }
    } finally {
      this.driving = false;
      for (const fn of this.driveWaiters.splice(0)) fn();
    }
    this.emit('settled', sync.version !== read);
    this.pump();
    this.check();
  }

  // the operations that waited are taken into the replica. rebased tells copy.ts what moved, and
  // base tells the parts
  private merge(ops: AppliedOp[]): string | null {
    const sync = this.sync!;
    const was = { text: sync.base, v: sync.version };
    const before = sync.mine;
    const out = sync.receive(ops);
    this.emit('rebased', before);
    if (sync.version !== was.v) this.emit('base', was.text, was.v, ops);
    return out;
  }

  // the whole text of the authority taken into the replica, after which base tells the parts
  private resync(text: string, v: Version): string | null {
    const sync = this.sync!;
    const was = { text: sync.base, v: sync.version };
    const out = sync.resync(text, v);
    this.emit('base', was.text, was.v, null);
    return out;
  }

  private async applyMine(): Promise<boolean> {
    // e.g. after onReload during the side hook
    if (this.frozen) return false;
    const text = this.sync!.mine;
    const before = this.changes;
    let applied: Applied;
    try {
      applied = await this.port.apply(text, this.sync!.takeOthers());
    } catch (e) {
      // the deck may be changed in part, hence it is not read again. the edits of the person that
      // were not read are taken from the text that the deck was to read
      const target = (e as { target?: unknown } | null)?.target;
      if (typeof target === 'string') {
        this.handed = text;
        this.capture(target);
      }
      this.freeze(null);
      return false;
    }
    // the port leaves the deck as it was at a reload, with the edits of the person
    if (applied.reload) {
      this.freeze(text);
      return false;
    }
    // a change of the person that ran into the apply is reported after it, and explains a difference
    if (this.changes === before && this.read() !== text) await this.reported(before);
    if (this.changes === before && this.read() !== text) {
      this.freeze(null);
      return false;
    }
    this.handed = text;
    this.emit('applied', applied.changed);
    return true;
  }

  private reported(before: number): Promise<void> {
    if (this.changes !== before) return Promise.resolve();
    return new Promise((done) => {
      const timer = setTimeout(done, LATE_CHANGE);
      this.changeWaiters.push(() => {
        clearTimeout(timer);
        done();
      });
    });
  }

  // the page loads again: the slides are made inert, the edits of the person are read once more when
  // the deck is known to hold them apart from unshown, the text of the apply, and the page loads
  // again once every edit is acknowledged, also after a reconnect. null: the deck is not known
  private freeze(unshown: string | null): void {
    if (this.frozen || this.ended) return;
    this.frozen = true;
    this.unshown = unshown;
    if (unshown === null) this.handed = null;
    this.dirty = !this.capture();
    this.slides().inert = true;
    clearTimeout(this.savingTimer);
    this.savingTimer = 0;
    this.saving = true;
    this.emit('state');
    void this.reload();
  }

  private slides(): HTMLElement {
    return this.app.slides() as HTMLElement;
  }

  // the edits of the person since the deck read as handed, merged into mine, where they win at a
  // conflict. false while the port gives unshown, as it does until a change of the person settles.
  // given is read in place of the deck, e.g. the text that an apply rejected in part was to read
  private capture(given?: string): boolean {
    const sync = this.sync, handed = this.handed;
    if (!sync || handed === null) return true;
    const deck = given ?? this.read();
    if (deck === null || deck === this.unshown) return false;
    if (deck === handed) return true;
    const theirs = diff(handed, sync.mine);
    const ours = diff(handed, deck).filter((o) => !theirs.some((t) => t.start === o.start && t.end === o.end && t.text === o.text));
    sync.edit(apply(handed, mergePatches(theirs, ours, 'ours', handed, false).patches));
    this.handed = deck;
    return true;
  }

  // the session may end or the page be blocked first, and the dialog of this state takes over
  private async reload(): Promise<void> {
    const deferred = this.hooks.defer?.();
    if (deferred) {
      await deferred;
      if (this.ended) {
        this.slides().inert = false;
        return;
      }
    }
    try {
      await this.flush();
    } catch {
      if (this.ended) this.slides().inert = false;
      return;
    }
    await dropped(this);
    location.reload();
  }

  private pump(): void {
    const sync = this.sync;
    // a page stays blocked, also under the new replica of a restart of the edit command
    if (!sync || this.sending || this.joining || this.ended || this.blocked || this.gone) return;
    if (sync.blocked) {
      this.blocked = true;
      this.emit('state');
      for (const w of this.ackWaiters.splice(0)) w.fail(new Error(BLOCKED));
      return;
    }
    if (sync.needsResync) {
      void this.rejoin();
      return;
    }
    let held: ((text: string) => string[]) | undefined;
    if (sync.mine !== sync.base && this.hooks.ready && !this.hooks.ready(sync.mine)) {
      held = this.hooks.held;
      if (!held?.(sync.mine).length) return;
    }
    const op = sync.outgoing(this.token, held);
    if (op) void this.send(op);
  }

  // an operation sent again unchanged, with its seq, until it is answered, since the edit command
  // answers a repeated seq with its earlier answer
  private async send(op: OpPost): Promise<void> {
    this.sending = op;
    try {
      for (;;) {
        try {
          const answer = await this.transport.op(op);
          // an edit command that does not know the token is online after the hello of the rejoin
          if (answer.ok || answer.reason !== 'unknown') this.online();
          this.sync!.answer(op, answer);
          break;
        } catch (e) {
          if (this.ended) return;
          if (e instanceof Failure && !e.retried) {
            // the request itself was refused, hence the page reads the whole text again
            this.sync!.answer(op, { ok: false, reason: 'invalid', v: this.sync!.version });
            break;
          }
          await this.offline(e);
          if (this.ended) return;
        }
      }
    } finally {
      this.sending = null;
      for (const fn of this.idleWaiters.splice(0)) fn();
    }
    void this.drive();
  }

  // hello again with the token of this page, after a 404, a gap in the operations, or a restart of
  // the edit command. it waits while an operation of this page is unanswered, i.e. while send()
  // sends it again, since only its answer tells resync() whether the whole text holds it
  private rejoin(): Promise<void> {
    if (this.gone) return Promise.resolve();
    return (this.joining ??= (async () => {
      try {
        while (this.sending) await new Promise<void>((done) => this.idleWaiters.push(done));
        const sync = this.sync!;
        while (!this.ended) {
          const whole = sync.needsResync;
          // without a name, the edit command keeps the name of the person, which another page of the
          // person may have changed
          const request: HelloRequest = { name: '', person: this.person, token: this.token, was: sync.sender, ...(whole ? {} : { v: this.since }) };
          let answer: HelloAnswer | Taken;
          try {
            answer = await this.transport.hello(request).catch((e) => {
              // the edit command does not know the person any longer, e.g. without people.json
              if (!(e instanceof Failure && e.status === 400)) throw e;
              return this.transport.hello({ ...request, name: this.name });
            });
            if ('taken' in answer) throw new Failure(409, 'the name is taken');
          } catch (e) {
            await this.offline(e);
            continue;
          }
          this.generation++;
          const moved = answer.client !== sync.client;
          this.accept(answer);
          sync.move(answer.client, answer.applied);
          // after the new token, which a presence state that waits is then sent with
          this.online();
          this.lostAt = null;
          if (answer.text !== undefined) {
            this.fresh = { text: answer.text, v: answer.v };
            this.inbox = [];
          } else if (!moved) this.receive(answer.ops);
          this.since = answer.v;
          break;
        }
      } finally {
        this.joining = null;
      }
      void this.drive();
    })());
  }

  private async poll(): Promise<void> {
    while (!this.ended && !this.gone) {
      if (this.joining) {
        await this.joining;
        continue;
      }
      const generation = this.generation;
      this.long ||= await takeSlot((release) => (this.release = release));
      const long = this.long;
      let answer: EventsAnswer;
      try {
        answer = await this.transport.events(this.token, this.since, long ? undefined : 0);
      } catch (e) {
        if (this.ended || this.gone || generation !== this.generation) continue;
        this.lostAt ??= Date.now();
        if (e instanceof Failure && (e.status === 404 || e.status === 400)) {
          // the wait grows with each refusal, as the reconnect after a failure does
          if (Date.now() - this.rejoinedAt < BOUNCE) {
            this.attempt = this.bounces++;
            await this.offline(e);
          }
          await this.rejoin();
          this.rejoinedAt = Date.now();
        } else {
          await this.offline(e);
          // the edit command holds a poll without news, hence a hello tells first that it answers.
          // while an operation is sent again, its answer tells the same, and a hello would wait for it
          if (!this.ended && !this.gone && !this.sending && generation === this.generation) await this.rejoin();
        }
        continue;
      }
      if (this.ended || this.gone || generation !== this.generation) continue;
      this.online();
      this.lostAt = null;
      this.bounces = 0;
      await this.take(answer);
      if (!long) await new Promise((done) => window.setTimeout(done, SHORT));
    }
  }

  private async take(answer: EventsAnswer): Promise<void> {
    // the operations of the answer are taken first, e.g. the broadcast of the last edit of this page
    if (answer.ended) {
      if (answer.ops) this.receive(answer.ops);
      this.since = answer.v;
      while (this.driving && !this.deciding) await new Promise<void>((done) => this.driveWaiters.push(done));
      await this.drive();
      this.end(answer.ended);
      return;
    }
    this.texCount(answer.tex);
    this.takeFigures(answer.figures);
    if (answer.writeError !== undefined) this.setWarning(answer.writeError ? `${answer.writeError.file ?? 'The deck'} cannot be written on the host's machine: ${answer.writeError.message}` : null);
    this.people = answer.people;
    this.presence = answer.presence;
    this.emit('people');
    this.emit('presence');
    if (answer.known) {
      this.known = answer.known;
      this.emit('known');
      // Change Name on another page of the person
      const name = answer.known.find((p) => p.person === this.person)?.name;
      if (name && name !== this.name) {
        store(NAME, name);
        this.setName(name);
      }
    }
    if (answer.history !== undefined) this.emit('history', answer.history);
    if (answer.restored) this.emit('restored', answer.restored);
    if (answer.comments) this.emit('comments', answer.comments, answer.v);
    if (answer.overwritten) this.emit('overwritten');
    if (answer.ops === null) {
      this.sync!.lose();
      this.pump();
      return;
    }
    if (answer.ops.length) this.receive(answer.ops);
    this.since = answer.v;
    void this.drive();
  }

  private texCount(count: number): void {
    if (typeof count !== 'number' || count === this.tex) return;
    const was = this.tex;
    this.tex = count;
    // a redraw that failed, e.g. at a fetch of tex.js, is tried again at the next answer
    this.port.redrawTex().then(() => this.emit('tex'), () => {
      if (this.tex === count) this.tex = was;
    });
  }

  // every output of a figure whose hash differs from the one loaded is loaded again. a load that
  // failed is tried again at the next state
  private takeFigures(state: FigureState | undefined): void {
    if (!state) return;
    this.figures = state;
    for (const [name, hash] of Object.entries(state.outputs)) {
      if (!hash || this.figureLoads.get(name) === hash) continue;
      this.figureLoads.set(name, hash);
      const forget = () => this.figureLoads.get(name) === hash && this.figureLoads.delete(name);
      this.port.reloadFigure(name, hash).then((loaded) => loaded || forget(), forget);
    }
    this.emit('figures', state);
  }

  private receive(ops: AppliedOp[]): void {
    if (!ops.length) return;
    this.inbox.push(...ops);
    this.emit('ops', ops);
  }

  // resolves at the next reconnect, i.e. after the next delay of RETRY or at Try now. every request
  // that fails meanwhile waits for the same reconnect
  private offline(e: unknown): Promise<void> {
    if (this.ended) return Promise.resolve();
    if (!this.retry) {
      const delay = RETRY[Math.min(this.attempt++, RETRY.length - 1)] * 1000;
      let done!: () => void;
      const promise = new Promise<void>((resolve) => (done = resolve));
      const finish = () => {
        if (this.retry?.promise !== promise) return;
        clearTimeout(timer);
        clearInterval(tick);
        this.retry = null;
        this.retryAt = null;
        this.emit('state');
        done();
      };
      const timer = window.setTimeout(finish, delay);
      // the seconds to the reconnect, shown in the save state
      const tick = window.setInterval(() => this.emit('state'), 1000);
      this.retry = { finish, promise };
      this.retryAt = Date.now() + delay;
    }
    this.setConnection(e instanceof Failure && e.status === 502 ? 'no-host' : 'offline');
    this.emit('state');
    return this.retry.promise;
  }

  private online(): void {
    this.attempt = 0;
    if (this.connection === 'offline' || this.connection === 'no-host') {
      this.setConnection('online');
      if (this.presenceDue) void this.flushPresence();
    }
  }

  private end(ended: Ended): void {
    if (this.ended) return;
    this.ended = ended;
    this.release();
    this.retry?.finish();
    clearTimeout(this.savingTimer);
    this.saving = false;
    this.connection = 'ended';
    this.emit('state');
    this.emit('ended', ended);
    for (const w of this.ackWaiters.splice(0)) w.fail(new Error('The session has ended'));
    this.askBeforeUnload(false);
    this.port.setStatus(null);
    this.port.end();
  }

  private check(): void {
    const acked = this.acked();
    this.askBeforeUnload(this.unkept());
    if (acked) {
      clearTimeout(this.savingTimer);
      this.savingTimer = 0;
      const waiting = this.ackWaiters.splice(0);
      // a page that waits to load again stays at Saving… until it loads, and the event lets copy.ts
      // drop its record before
      if (this.frozen ? waiting.length : this.saving) {
        this.saving = this.frozen;
        this.emit('state');
      }
      for (const w of waiting) w.done();
    } else if (!this.saving && !this.savingTimer && !this.ended) {
      this.savingTimer = window.setTimeout(() => {
        this.savingTimer = 0;
        if (this.acked() || this.ended) return;
        this.saving = true;
        this.emit('state');
      }, SAVING);
    }
  }

  // presence is a state, hence only the newest is sent, and a state whose POST failed is sent again
  private async flushPresence(): Promise<void> {
    if (this.presenceBusy) return;
    this.presenceBusy = true;
    try {
      while (this.presenceDue && this.token && !this.ended && !this.gone) {
        this.presenceDue = false;
        try {
          await this.transport.presence(this.token, this.presenceState);
          this.presenceTry = 0;
        } catch (e) {
          this.presenceDue = true;
          if (e instanceof Failure && e.status === 404) await this.rejoin();
          else {
            // a page that stays online may not have a new state to send, hence it sends this one
            // again after the delays of RETRY, unless a new state or a reconnect sends it first
            if (e instanceof Failure && e.retried) {
              window.setTimeout(() => {
                if (this.connection === 'online') void this.flushPresence();
              }, RETRY[Math.min(this.presenceTry++, RETRY.length - 1)] * 1000);
            }
            return;
          }
        }
      }
    } finally {
      this.presenceBusy = false;
    }
  }
}
