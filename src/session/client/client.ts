// the core of the client of a session: the replica of the deck, the long poll of events, the
// operations sent to the edit command, and the reconnects. each part of the client, e.g. the save
// state, is installed on one Client by main.ts, and reads its fields and its events.
//
// the deck and the replica are kept apart by one rule: the text of the deck is read into the
// replica only after onChange of the port reported a change by the person, and never while an
// apply runs. an apply that leaves the deck at another text loads the page again, since sending
// that text as an edit would undo the work of another person for everyone

import type { App } from '../../editor/app.ts';
import type { Applied, Port } from '../../editor/session/session.ts';
import type { AppliedOp, Ended, EventsAnswer, HelloAnswer, HelloRequest, KnownPerson, OpPost, Person, Presence, Taken, Token, Version } from '../protocol.ts';
import type { Handover } from './handover.ts';
import { Sync } from './sync.ts';
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
  // an apply changed the deck, with the elements that it changed
  applied: [Element[]];
  // connection, saving, retryAt, blocked, or warning changed
  state: [];
  ended: [Ended];
};

// the reconnects in s, the last one repeated
const RETRY = [1, 2, 4, 8, 16, 30];
// an edit waits this long in ms before the state says Saving…
const SAVING = 500;
// the longest wait in ms for onChange after an apply that a change of the person ran into
const LATE_CHANGE = 2000;
// the longest wait in ms for the edits of this page before it is loaded again
const BEFORE_RELOAD = 2000;
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
  // the elements that the last apply changed, e.g. for a flash
  changed: Element[] = [];
  connection: Connection = 'joining';
  // true once an edit of this page has waited for its acknowledgment over SAVING ms
  saving = false;
  // the time of the next reconnect in ms of Date.now(), or null
  retryAt: number | null = null;
  // an operation of this page was refused as invalid after a resync, and nothing is sent any more
  blocked = false;
  // a warning of the edit command shown in the save state while the page is online, e.g. that it
  // cannot write index.html
  warning: string | null = null;
  ended: Ended | null = null;
  // the guest left with Leave Session, after which the page is ended as at the end of the session
  left = false;

  private sync: Sync | null = null;
  // the version after the operations taken from the last answer, which the next poll asks after
  private since: Version = '';
  // counts the hellos after the first, so that a poll sent before one is not taken
  private generation = 0;
  private readonly listeners = new Map<keyof ClientEvents, Set<(...args: never[]) => void>>();

  // a change by the person, reported by onChange and not yet read into the replica
  private dirty = false;
  private changes = 0;
  private changeWaiters: (() => void)[] = [];
  private framed = false;
  private driving = false;
  private inbox: AppliedOp[] = [];
  // the whole text of an answer of hello, merged by resync
  private fresh: { text: string; v: Version } | null = null;
  // after an apply that left the deck at another text: the deck is not read again, and the page is
  // loaded again
  private frozen = false;

  private sending: OpPost | null = null;
  private idleWaiters: (() => void)[] = [];
  private joining: Promise<void> | null = null;
  private attempt = 0;
  private retry: { finish: () => void; promise: Promise<void> } | null = null;
  private savingTimer = 0;
  private ackWaiters: { done: () => void; fail: (e: Error) => void }[] = [];
  private presenceState: unknown = null;
  private presenceDue = false;
  private presenceBusy = false;

  constructor(handover: Handover) {
    const { app, port, ...shell } = handover;
    this.app = app;
    this.port = port;
    this.shell = shell;
    this.transport = new Transport(location.href);
    port.onChange(() => this.onChange());
    port.onSave(() => this.flush());
  }

  on<K extends keyof ClientEvents>(event: K, fn: (...args: ClientEvents[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn as (...args: never[]) => void);
    return () => void set.delete(fn as (...args: never[]) => void);
  }

  private emit<K extends keyof ClientEvents>(event: K, ...args: ClientEvents[K]): void {
    for (const fn of [...(this.listeners.get(event) ?? [])]) (fn as (...a: ClientEvents[K]) => void)(...args);
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
        this.online();
        return answer;
      } catch (e) {
        if (e instanceof Failure && !e.retried) throw e;
        await this.offline(e);
      }
    }
  }

  // the session begins with the first answer of hello. text is the text of the page at version v
  begin(answer: HelloAnswer, text: string, v: Version): void {
    this.accept(answer);
    this.sync = new Sync(answer.client, text, v);
    if (answer.text !== undefined) this.fresh = { text: answer.text, v: answer.v };
    else this.inbox.push(...answer.ops);
    this.since = answer.v;
    this.setConnection('online');
    window.addEventListener('pagehide', () => {
      if (this.token && !this.ended) this.transport.bye(this.token);
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

  setWarning(text: string | null): void {
    if (text === this.warning) return;
    this.warning = text;
    this.emit('state');
  }

  // the name of this page after Change Name
  setName(name: string): void {
    this.name = name;
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
    return !!this.sync && (this.frozen || !this.dirty) && !this.sending && this.sync.acked;
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
    this.color = a.color;
    this.host = a.host;
    this.people = a.people;
    this.known = a.known;
    this.emit('me');
    this.emit('people');
    this.emit('known');
  }

  private setConnection(connection: Connection): void {
    if (this.connection === connection || this.connection === 'ended') return;
    this.connection = connection;
    this.emit('state');
  }

  private onChange(): void {
    this.changes++;
    this.dirty = true;
    for (const fn of this.changeWaiters.splice(0)) fn();
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
    try {
      for (;;) {
        if (this.frozen) {
          // the broadcast of an operation of this page acknowledges it, hence operations are taken
          if (this.inbox.length) sync.receive(this.inbox.splice(0));
          this.fresh = null;
          break;
        }
        let stale = false;
        if (this.dirty) {
          this.dirty = false;
          const text = this.read();
          if (text !== null && sync.edit(text) !== null) stale = true;
        }
        if (this.fresh) {
          const { text, v } = this.fresh;
          this.fresh = null;
          if (sync.resync(text, v) !== null) stale = true;
        }
        if (this.inbox.length && sync.receive(this.inbox.splice(0)) !== null) stale = true;
        if (!stale || !(await this.applyMine())) break;
      }
    } finally {
      this.driving = false;
    }
    this.pump();
    this.check();
  }

  private async applyMine(): Promise<boolean> {
    const text = this.sync!.mine;
    const before = this.changes;
    let applied: Applied;
    try {
      applied = await this.port.apply(text);
    } catch {
      applied = { reload: true, changed: [] };
    }
    // a change of the person that ran into the apply is reported after it, and explains a difference
    if (!applied.reload && this.changes === before && this.read() !== text) await this.reported(before);
    if (applied.reload || (this.changes === before && this.read() !== text)) {
      this.frozen = true;
      void this.reload();
      return false;
    }
    this.changed = applied.changed;
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

  // the page loaded again, once the edits of this page are acknowledged or BEFORE_RELOAD has passed
  private async reload(): Promise<void> {
    if (!this.acked()) {
      await new Promise<void>((done) => {
        const timer = setTimeout(done, BEFORE_RELOAD);
        this.ackWaiters.push({ done: () => (clearTimeout(timer), done()), fail: () => {} });
      });
    }
    location.reload();
  }

  private pump(): void {
    const sync = this.sync;
    // a page stays blocked, also under the new replica of a restart of the edit command
    if (!sync || this.sending || this.joining || this.ended || this.blocked) return;
    if (sync.blocked) {
      this.blocked = true;
      this.emit('state');
      for (const w of this.ackWaiters.splice(0)) w.fail(new Error(BLOCKED));
      return;
    }
    if (sync.needsResync) {
      if (!this.frozen) void this.rejoin();
      return;
    }
    const op = sync.outgoing(this.token);
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
          this.online();
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
    return (this.joining ??= (async () => {
      try {
        while (this.sending) await new Promise<void>((done) => this.idleWaiters.push(done));
        const sync = this.sync!;
        while (!this.ended) {
          const whole = sync.needsResync;
          const request: HelloRequest = { name: this.name, person: this.person, token: this.token, ...(whole ? {} : { v: this.since }) };
          let answer: HelloAnswer | Taken;
          try {
            answer = await this.transport.hello(request);
            // another person holds the name now, and the edit command keeps the name of this person
            if ('taken' in answer) answer = await this.transport.hello({ ...request, name: '' });
            if ('taken' in answer) throw new Failure(409, 'the name is taken');
          } catch (e) {
            await this.offline(e);
            continue;
          }
          this.online();
          this.generation++;
          const moved = answer.client !== sync.client;
          this.accept(answer);
          sync.move(answer.client);
          if (answer.text !== undefined) {
            this.fresh = { text: answer.text, v: answer.v };
            this.inbox = [];
          } else if (!moved) this.inbox.push(...answer.ops);
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
    while (!this.ended) {
      if (this.joining) {
        await this.joining;
        continue;
      }
      const generation = this.generation;
      let answer: EventsAnswer;
      try {
        answer = await this.transport.events(this.token, this.since);
      } catch (e) {
        if (this.ended || generation !== this.generation) continue;
        if (e instanceof Failure && (e.status === 404 || e.status === 400)) await this.rejoin();
        else await this.offline(e);
        continue;
      }
      if (generation !== this.generation) continue;
      this.online();
      this.take(answer);
    }
  }

  private take(answer: EventsAnswer): void {
    if (answer.ended) {
      this.end(answer.ended);
      return;
    }
    this.people = answer.people;
    this.presence = answer.presence;
    this.emit('people');
    this.emit('presence');
    if (answer.known) {
      this.known = answer.known;
      this.emit('known');
    }
    if (answer.ops === null) {
      this.sync!.lose();
      this.pump();
      return;
    }
    if (answer.ops.length) this.inbox.push(...answer.ops);
    this.since = answer.v;
    void this.drive();
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
    this.retry?.finish();
    clearTimeout(this.savingTimer);
    this.saving = false;
    this.connection = 'ended';
    this.emit('state');
    this.emit('ended', ended);
    for (const w of this.ackWaiters.splice(0)) w.fail(new Error('The session has ended'));
    this.port.setStatus(null);
    this.port.end();
  }

  private check(): void {
    if (this.acked()) {
      clearTimeout(this.savingTimer);
      this.savingTimer = 0;
      if (this.saving) {
        this.saving = false;
        this.emit('state');
      }
      for (const w of this.ackWaiters.splice(0)) w.done();
    } else if (!this.saving && !this.savingTimer && !this.ended) {
      this.savingTimer = window.setTimeout(() => {
        this.savingTimer = 0;
        if (this.acked() || this.ended) return;
        this.saving = true;
        this.emit('state');
      }, SAVING);
    }
  }

  // presence is a state, hence only the newest is sent, and it is sent again once the page is online
  private async flushPresence(): Promise<void> {
    if (this.presenceBusy) return;
    this.presenceBusy = true;
    try {
      while (this.presenceDue && this.token && !this.ended) {
        this.presenceDue = false;
        try {
          await this.transport.presence(this.token, this.presenceState);
        } catch (e) {
          this.presenceDue = true;
          if (e instanceof Failure && e.status === 404) await this.rejoin();
          else return;
        }
      }
    } finally {
      this.presenceBusy = false;
    }
  }
}
