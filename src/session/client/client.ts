import type { App } from '../../editor/app.ts';
import type { Applied, Port } from '../../editor/session/port.ts';
import { apply, diff, mergePatches } from '../patch.ts';
import { dropped, early, keeps } from './copy.ts';
import { NAME, store } from './join.ts';
import { FULL, type AppliedOp, type CommentsEvent, type Ended, type EventsAnswer, type FigureState, type HelloAnswer, type HelloRequest, type KnownPerson, type OpPost, type Patch, type Person, type Presence, type Restored, type Taken, type Token, type Version } from '../protocol.ts';
import type { Side } from '../replica.ts';
import type { Handover } from './handover.ts';
import type { Resolved } from './presence.ts';
import { Sync, type Whole } from './sync.ts';
import { SHORT, takeSlot } from './slot.ts';
import { Failure, Transport } from './transport.ts';

export type Connection = 'joining' | 'online' | 'offline' | 'no-host' | 'ended';

export type ClientEvents = {
  me: [];
  people: [];
  known: [];
  presence: [];
  ops: [AppliedOp[]];
  resolved: [];
  applied: [Element[]];
  tex: [];
  figures: [FigureState];
  settled: [moved: boolean];
  rebased: [before: string];
  dropped: [before: string];
  state: [];
  ended: [Ended];
  hello: [];
  history: [number];
  restored: [Restored];
  base: [text: string, v: Version, ops: AppliedOp[] | null];
  comments: [CommentsEvent, Version];
  overwritten: [];
};

export type Hooks = {
  side?(sync: Sync, whole: Whole | null, ops: AppliedOp[]): Side | Promise<Side> | null;
  ready?(text: string): boolean;
  held?(text: string): string[];
  defer?(): Promise<void> | null;
};

export const RETRY = [1, 2, 4, 8, 16, 30];
const SAVING = 500;
const LATE_CHANGE = 2000;
const BOUNCE = 5000;
export const BLOCKED = 'Your changes cannot be sent. Load the page again.';

export class Client {
  readonly app: App;
  readonly port: Port;
  readonly shell: Omit<Handover, 'app' | 'port'>;
  readonly transport: Transport;

  client = '';
  person = '';
  name = '';
  color = 0;
  host = false;
  token: Token = '';
  people: Person[] = [];
  known: KnownPerson[] = [];
  presence: Presence[] = [];
  connection: Connection = 'joining';
  saving = false;
  retryAt: number | null = null;
  lostAt: number | null = null;
  full = false;
  blocked = false;
  warning: string | null = null;
  ended: Ended | null = null;
  left = false;
  gone = false;
  hooks: Hooks = {};
  resolved: () => Resolved[] = () => [];

  private sync: Sync | null = null;
  get base(): { text: string; v: Version } | null {
    return this.sync && { text: this.sync.base, v: this.sync.version };
  }

  private since: Version = '';
  private tex = 0;
  figures: FigureState | null = null;
  private figureLoads = new Map<string, string>();
  private generation = 0;
  private readonly listeners = new Map<keyof ClientEvents, Set<(...args: never[]) => void>>();

  private dirty = false;
  private changes = 0;
  private changeWaiters: (() => void)[] = [];
  private framed = false;
  private driving = false;
  private deciding = false;
  private inbox: AppliedOp[] = [];
  private fresh: { text: string; v: Version } | null = null;
  private frozen = false;
  private handed: string | null = null;
  private readonly ask = (ev: BeforeUnloadEvent): void => {
    ev.preventDefault();
    ev.returnValue = true;
  };
  private asking = false;
  private unshown: string | null = null;
  private rewrites: ((text: string) => string)[] = [];

  private sending: OpPost | null = null;
  private idleWaiters: (() => void)[] = [];
  private driveWaiters: (() => void)[] = [];
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
  private long = false;
  private release = (): void => {};

  constructor(handover: Handover) {
    const { app, port, ...shell } = handover;
    this.app = app;
    this.port = port;
    this.shell = shell;
    this.transport = new Transport(location.href, (ended) => {
      if (this.sync) this.end(ended);
    });
    port.onChange(() => this.onChange());
    port.onSave(() => this.flush());
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

  emit<K extends keyof ClientEvents>(event: K, ...args: ClientEvents[K]): void {
    for (const fn of [...(this.listeners.get(event) ?? [])]) {
      try {
        (fn as (...a: ClientEvents[K]) => void)(...args);
      } catch (e) {
        if (typeof reportError === 'function') reportError(e);
        else console.error(e);
      }
    }
  }

  url(route: string, query?: Record<string, string>): string {
    return this.transport.url(route, query);
  }

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

  begin(answer: HelloAnswer, text: string, v: Version): void {
    this.accept(answer);
    this.sync = new Sync(answer.client, text, v);
    this.handed = text;
    if (answer.text !== undefined) this.fresh = { text: answer.text, v: answer.v };
    else this.receive(answer.ops);
    this.since = answer.v;
    this.setConnection('online');
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
    window.addEventListener('pageshow', (ev) => {
      if (ev.persisted) location.reload();
    });
    void this.poll();
    void this.drive();
    if (this.presenceDue) void this.flushPresence();
  }

  get version(): Version {
    return this.since;
  }

  setWarning(text: string | null): void {
    if (text === this.warning) return;
    this.warning = text;
    this.emit('state');
  }

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

  tryNow(): void {
    this.retry?.finish();
  }

  acked(): boolean {
    return !!this.sync && !this.dirty && !this.rewrites.length && !this.sending && this.sync.acked;
  }

  get reloading(): boolean {
    return this.frozen;
  }

  rewrite(fn?: (text: string) => string): void {
    if (fn) this.rewrites.push(fn);
    void this.drive();
  }

  snapshot(): { base: string; v: Version; mine: string } | null {
    return this.sync && { base: this.sync.base, v: this.sync.version, mine: this.sync.mine };
  }

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

  refresh(): void {
    this.askBeforeUnload(this.unkept());
    this.emit('state');
  }

  private unkept(): boolean {
    return !this.acked() && !this.ended && ((this.dirty && (!!this.sync || !early(this))) || !keeps(this));
  }

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
    if (this.frozen) {
      this.dirty = !this.capture();
      void this.drive();
      return;
    }
    this.dirty = true;
    this.frame();
    this.check();
  }

  private frame(): void {
    if (this.framed) return;
    this.framed = true;
    const run = () => {
      if (!this.framed) return;
      this.framed = false;
      cancelAnimationFrame(raf);
      clearTimeout(whileOccluded);
      void this.drive();
    };
    const raf = requestAnimationFrame(run);
    const whileOccluded = window.setTimeout(run, 100);
  }

  private read(): string | null {
    try {
      return this.port.text();
    } catch {
      return null;
    }
  }

  private async drive(): Promise<void> {
    const sync = this.sync;
    if (!sync || this.driving) return;
    this.driving = true;
    let read = sync.version;
    try {
      for (;;) {
        if (this.frozen) {
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

  private merge(ops: AppliedOp[]): string | null {
    const sync = this.sync!;
    const was = { text: sync.base, v: sync.version };
    const before = sync.mine;
    const dropped: Patch[] = [];
    const out = sync.receive(ops, dropped);
    this.emit('rebased', before);
    if (dropped.length) this.emit('dropped', before);
    if (sync.version !== was.v) this.emit('base', was.text, was.v, ops);
    return out;
  }

  private resync(text: string, v: Version): string | null {
    const sync = this.sync!;
    const was = { text: sync.base, v: sync.version };
    const out = sync.resync(text, v);
    this.emit('base', was.text, was.v, null);
    return out;
  }

  private async applyMine(): Promise<boolean> {
    if (this.frozen) return false;
    const text = this.sync!.mine;
    const before = this.changes;
    let applied: Applied;
    try {
      applied = await this.port.apply(text, this.sync!.takeOthers());
    } catch (e) {
      const target = (e as { target?: unknown } | null)?.target;
      if (typeof target === 'string') {
        this.handed = text;
        this.capture(target);
      }
      this.freeze(null);
      return false;
    }
    if (applied.reload) {
      this.freeze(text);
      return false;
    }
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

  private async send(op: OpPost): Promise<void> {
    this.sending = op;
    try {
      for (;;) {
        try {
          const answer = await this.transport.op(op);
          if (answer.ok || answer.reason !== 'unknown') this.online();
          this.sync!.answer(op, answer);
          break;
        } catch (e) {
          if (this.ended) return;
          if (e instanceof Failure && !e.retried) {
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

  private rejoin(): Promise<void> {
    if (this.gone) return Promise.resolve();
    return (this.joining ??= (async () => {
      try {
        while (this.sending) await new Promise<void>((done) => this.idleWaiters.push(done));
        const sync = this.sync!;
        while (!this.ended) {
          const whole = sync.needsResync;
          const request: HelloRequest = { name: '', person: this.person, token: this.token, was: sync.sender, ...(whole ? {} : { v: this.since }) };
          let answer: HelloAnswer | Taken;
          try {
            answer = await this.transport.hello(request).catch((e) => {
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
          if (Date.now() - this.rejoinedAt < BOUNCE) {
            this.attempt = this.bounces++;
            await this.offline(e);
          }
          await this.rejoin();
          this.rejoinedAt = Date.now();
        } else {
          await this.offline(e);
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
    this.port.redrawTex().then(() => this.emit('tex'), () => {
      if (this.tex === count) this.tex = was;
    });
  }

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
