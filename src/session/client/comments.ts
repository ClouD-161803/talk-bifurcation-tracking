import { allChecked, checkOf, moveAnchors, slideAt, startTagAt, type Anchored, type Check } from '../anchor.ts';
import { apply, checksum, diff, invert, size, type Patch } from '../patch.ts';
import { slidesOf, type Slide } from '../slides.ts';
import { parseVersion, type Anchor, type AppliedOp, type Comment, type CommentsAnswer, type CommentsEvent, type SeenAnswer, type Version } from '../protocol.ts';
import type { Client } from './client.ts';
import { Failure } from './transport.ts';

export type Place = { el: Element | null; slide: Element | null; number: number | null };
export type Spot = { at: Anchor; check: Check; twin?: [number, number]; place?: [number, number]; stack?: boolean; own?: Spot; left?: string };

const LEFT = 16;
const leftOf = (text: string, a: Anchor): string => checksum(text.slice(Math.max(0, a.start - LEFT), a.start));

const spot = (text: string, a: Anchor): Spot => {
  const check = checkOf(text, a);
  const all = allChecked(text, a.tag, check);
  const left = leftOf(text, a);
  const unique = all.filter((x) => leftOf(text, x) === left).length === 1;
  return { at: a, check, twin: [all.findIndex((x) => x.start === a.start), all.length], ...(unique ? { left } : {}) };
};

function checked(text: string, s: Spot | undefined): Anchor | null {
  if (typeof s?.at?.tag !== 'string' || typeof s.check?.sum !== 'string' || typeof s.check.tag !== 'string' || !Array.isArray(s.twin)) return null;
  const [k, n] = s.twin;
  const all = allChecked(text, s.at.tag, s.check);
  if (all.length !== n || !Number.isInteger(k)) return null;
  const same = typeof s.left === 'string' ? all.filter((x) => leftOf(text, x) === s.left) : [];
  return same.length === 1 ? same[0] : all[k] ?? null;
}

export type Item = { id: string; author: string; time: number; text: string; edited?: number };

const KEPT = 64;
const KEPT_SIZE = 8 * 2 ** 20;

type Step = { v: Version; patches: Patch[]; back: Patch[] };
type Pending = { at: Version; snapshot: CommentsAnswer | null; event: CommentsEvent | null };

const anchored = (t: Comment): Anchored => ({ anchor: t.anchor, slide: t.slide, ...(t.removed ? { removed: t.removed } : {}) });
const place = (t: Comment, a: Anchored) => {
  t.anchor = a.anchor;
  t.slide = a.slide;
  if (a.removed) t.removed = a.removed;
  else delete t.removed;
};
export const itemsOf = (t: Comment): Item[] => [t, ...t.replies];
export const stamp = (i: Item): number => Math.max(i.time, i.edited ?? 0);
const onSlide = (t: Comment): boolean => !!t.anchor && !!t.slide && t.anchor.start === t.slide.start;

export class Comments {
  readonly client: Client;
  threads = new Map<string, Comment>();
  rev = -1;
  seen = 0;
  read = new Map<string, number>();
  private held: { text: string; v: Version } | null = null;
  private steps: Step[] = [];
  private queue: Pending[] = [];
  private buffer: Pending[] | null = null;
  private again = false;
  private wanted = false;
  private tries = 0;
  private listeners = new Set<(fresh: Comment[]) => void>();
  private cache: { base: string; text: string; count: number; places: Map<string, Place> } | null = null;
  private count = 0;
  private slides: { text: string; slides: Slide[] } | null = null;
  private spotsOf: { key: unknown[]; out: { el: Spot | null; slide: Spot | null } } | null = null;
  private reread: string | null = null;
  private rereading = false;
  private unsent = new Map<string, { id: string; on: unknown[] }>();
  private late = new Map<string, number>();

  constructor(client: Client) {
    this.client = client;
    client.on('hello', () => {
      this.held ??= client.base;
      this.queue = [];
      void this.fetch();
    });
    client.on('base', (text, v, ops) => this.advance(text, v, ops));
    client.on('comments', (event, v) => {
      if (this.times(event.seen, event.read)) this.changed();
      if (event.changed === null || event.changed.length || event.removed.length) this.take({ at: v, snapshot: null, event });
    });
    client.on('state', () => {
      if (this.wanted && client.connection === 'online') void this.fetch();
      if (client.connection !== 'online') return;
      const late = [...this.late];
      this.late.clear();
      for (const [thread, time] of late) this.sendSeen(time, thread);
    });
  }

  onChange(fn: (fresh: Comment[]) => void): void {
    this.listeners.add(fn);
  }

  private changed(fresh: Comment[] = []): void {
    this.count++;
    for (const fn of this.listeners) {
      try {
        fn(fresh);
      } catch (e) {
        if (typeof reportError === 'function') reportError(e);
        else console.error(e);
      }
    }
  }

  private times(seen = 0, read: Record<string, number> = {}): boolean {
    let changed = seen > this.seen;
    this.seen = Math.max(this.seen, seen);
    for (const [id, time] of Object.entries(read)) {
      if (time <= (this.read.get(id) ?? 0)) continue;
      this.read.set(id, time);
      changed = true;
    }
    return changed;
  }

  private async fetch(): Promise<void> {
    if (this.buffer) {
      this.again = true;
      return;
    }
    this.wanted = false;
    this.buffer = [];
    try {
      for (;;) {
        this.again = false;
        let answer: CommentsAnswer;
        try {
          answer = await this.client.transport.comments(this.client.token);
        } catch {
          if (this.again) continue;
          this.wanted = true;
          return;
        }
        if (this.again) continue;
        const later = this.buffer.filter((p) => p.event!.v > answer.v);
        this.buffer = null;
        this.take({ at: answer.at, snapshot: answer, event: null });
        for (const p of later) this.take(p);
        return;
      }
    } finally {
      this.buffer = null;
    }
  }

  private take(p: Pending): void {
    if (p.event && p.event.changed === null) {
      void this.fetch();
      return;
    }
    if (this.buffer && p.event) {
      this.buffer.push(p);
      return;
    }
    this.queue.push(p);
    this.pump();
  }

  private pump(): void {
    let fresh: Comment[] | null = null;
    this.held ??= this.client.base;
    while (this.queue.length && this.held) {
      const p = this.queue[0];
      const list = p.snapshot ? p.snapshot.comments : p.event!.changed!;
      const moved = this.forward(p.at, list.map(anchored));
      if (moved === 'wait') break;
      this.queue.shift();
      if (moved === 'gone') {
        this.queue = [];
        if (this.tries++ < 3) void this.fetch();
        else setTimeout(() => void this.fetch(), 1000);
        break;
      }
      this.tries = 0;
      list.forEach((t, i) => place(t, moved[i]));
      if (p.snapshot) {
        this.threads = new Map(list.map((t) => [t.id, t]));
        this.rev = p.snapshot.v;
        for (const id of this.read.keys()) if (!this.threads.has(id)) this.read.delete(id);
        this.times(p.snapshot.seen, p.snapshot.read);
        fresh ??= [];
      } else {
        const e = p.event!;
        if (e.v <= this.rev) continue;
        for (const t of list) this.threads.set(t.id, t);
        for (const id of e.removed!) this.threads.delete(id);
        for (const id of e.removed!) this.read.delete(id);
        this.rev = e.v;
        (fresh ??= []).push(...list);
      }
    }
    if (fresh) this.changed(fresh);
  }

  private forward(at: Version, items: Anchored[]): Anchored[] | 'wait' | 'gone' {
    const held = this.held!;
    if (at === held.v) return items;
    const a = parseVersion(at);
    const b = parseVersion(held.v);
    if (!a || !b) return 'gone';
    if (a.epoch !== b.epoch || a.n > b.n) return 'wait';
    const from = this.steps.findIndex((s) => s.v === at);
    if (from < 0) return 'gone';
    let text = held.text;
    for (let i = this.steps.length; i-- > from; ) text = apply(text, this.steps[i].back);
    return this.walk(text, this.steps.slice(from), items);
  }

  private walk(text: string, steps: Step[], items: Anchored[]): Anchored[] {
    let slides: Slide[] | null = null;
    for (const s of steps) {
      const after = apply(text, s.patches);
      ({ items, slides } = moveAnchors(text, s.patches, after, items, slides));
      text = after;
    }
    return items;
  }

  private advance(text: string, v: Version, ops: AppliedOp[] | null): void {
    const now = this.client.base!;
    const held = this.held ?? { text, v };
    this.held = now;
    const threads = [...this.threads.values()];
    let items = threads.map(anchored);
    const steps = held.v === v && ops ? this.rebuild(text, v, ops, now) : null;
    if (steps) {
      items = this.walk(text, steps, items);
      this.steps.push(...steps);
      let k = this.steps.length;
      for (let n = 0; k > 0 && this.steps.length - k < KEPT && (n += size(this.steps[k - 1].patches)) <= KEPT_SIZE; ) k--;
      this.steps.splice(0, k);
    } else {
      items = moveAnchors(held.text, diff(held.text, now.text), now.text, items).items;
      this.steps = [];
      this.queue = [];
      void this.fetch();
    }
    threads.forEach((t, i) => place(t, items[i]));
    this.changed();
    this.pump();
  }

  private rebuild(text: string, v: Version, ops: AppliedOp[], now: { text: string; v: Version }): Step[] | null {
    const steps: Step[] = [];
    let n = parseVersion(v)!.n;
    try {
      for (const op of ops) {
        const at = parseVersion(op.v);
        if (!at || at.n <= n) continue;
        if (at.n !== n + 1) return null;
        steps.push({ v, patches: op.patches, back: invert(text, op.patches) });
        text = apply(text, op.patches);
        v = op.v;
        n = at.n;
        if (v === now.v) break;
      }
    } catch {
      return null;
    }
    return v === now.v && text === now.text ? steps : null;
  }

  private slidesOf(text: string): Slide[] {
    if (this.slides?.text !== text) this.slides = { text, slides: slidesOf(text) };
    return this.slides.slides;
  }

  places(): Map<string, Place> {
    const held = this.held;
    const text = this.client.app.source?.text;
    if (!held || text === undefined) return new Map();
    if (!this.threads.size) return new Map();
    if (text !== held.text && this.reread !== text && this.client.acked()) {
      this.reread = text;
      void this.client.port.rebase().then(() => this.changed(), () => {});
    }
    const c = this.cache;
    if (c && c.base === held.text && c.text === text && c.count === this.count) return c.places;
    const threads = [...this.threads.values()];
    let items = threads.map(anchored);
    const patches = text === held.text ? [] : diff(held.text, text);
    if (patches.length) items = moveAnchors(held.text, patches, text, items).items;
    if (this.reread !== text && patches.some((p) => /[<>]/.test(p.text + held.text.slice(p.start, p.end)))) {
      this.reread = text;
      this.rereading = true;
      void this.client.port.rebase().catch(() => {}).then(() => {
        this.rereading = false;
        this.changed();
      });
    }
    const slides = this.slidesOf(text);
    const places = new Map<string, Place>();
    let by: Map<number, Element> | null = null;
    const find = (a: Anchor) => this.find(a, (by ??= this.client.port.elementsAt()));
    threads.forEach((t, i) => {
      const was = this.rereading ? c?.places.get(t.id) : undefined;
      if (was && (was.el ?? was.slide)?.isConnected) {
        places.set(t.id, was);
        return;
      }
      const a = items[i];
      const el = a.anchor && !onSlide(t) && !a.removed ? find(a.anchor) : null;
      const slide = (a.slide && find(a.slide)) || el?.closest('.reveal .slides section') || null;
      const at = a.slide ?? a.anchor;
      places.set(t.id, { el, slide, number: slide && at ? slideAt(slides, at.start)?.number ?? null : null });
    });
    this.cache = { base: held.text, text, count: this.count, places };
    return places;
  }

  private find(a: Anchor, by = this.client.port.elementsAt()): Element | null {
    const el = by.get(a.start) ?? null;
    return el && el.localName.toLowerCase() === a.tag ? el : null;
  }

  async add(el: Element | null, slide: Element, text: string): Promise<Comment> {
    const { client } = this;
    const port = client.port;
    for (let k = 0; ; k++) {
      await client.flush();
      await port.rebase();
      const base = client.base!;
      const item = this.item(el, slide, base.text);
      const { anchor: a, slide: s } = item;
      if (s && !item.removed && (!el || (a && a.start !== s.start))) {
        try {
          const thread = await this.once(JSON.stringify(['', text]), [el, slide], (id) =>
            client.transport.post<Comment>('comments', {
              token: client.token,
              anchor: el ? { start: a!.start, end: a!.end } : null,
              slide: { start: s.start, end: s.end },
              base: base.v,
              text,
              id,
            }),
          );
          this.put(thread, base.v, el ? item : { anchor: s, slide: s });
          return thread;
        } catch (e) {
          if (!(e instanceof Failure && e.status === 409 && /base/.test(e.message)) || k > 2) throw e;
        }
      } else if (k > 2) throw new Error('The element is not found in the deck. Try again.');
    }
  }

  private item(el: Element | null, slide: Element, base: string): Anchored {
    const port = this.client.port;
    const source = this.client.app.source!.text;
    const at = (x: Element) => {
      const i = port.offsetOf(x);
      return i === null ? null : startTagAt(source, i);
    };
    const item: Anchored = { anchor: el ? at(el) : null, slide: at(slide) };
    return source !== base && item.slide ? moveAnchors(source, diff(source, base), base, [item]).items[0] : item;
  }

  spots(el: Element | null, slide: Element): { el: Spot | null; slide: Spot | null } {
    const base = this.client.base;
    if (!base || !this.client.app.source) return { el: null, slide: null };
    const mine = el ? this.client.snapshot()?.mine ?? base.text : base.text;
    const key = [el, slide, base.text, mine, this.client.app.source.text];
    if (this.spotsOf?.key.every((x, i) => x === key[i])) return this.spotsOf.out;
    const item = this.item(el, slide, base.text);
    const { anchor: a, slide: s } = item;
    const own = mine === base.text ? null : this.item(el, slide, mine);
    const slides = this.slidesOf(base.text);
    const n = s ? slides.findIndex((x) => x.start >= s.start) : -1;
    const out = {
      el: el && a && s && !item.removed && a.start !== s.start ? { ...spot(base.text, a), ...(own?.anchor && !own.removed ? { own: spot(mine, own.anchor) } : {}) } : null,
      slide: s ? { ...spot(base.text, s), place: [n, slides.length] as [number, number], ...(n >= 0 && slides[n].start !== s.start ? { stack: true } : {}) } : null,
    };
    this.spotsOf = { key, out };
    return out;
  }

  spotted(s: Spot): Element | null {
    const text = this.client.app.source?.text;
    if (text === undefined) return null;
    const own = checked(text, s.own);
    const base = checked(text, s);
    const a = own && base && own.start !== base.start ? null : own ?? base;
    if (a) return this.find(a);
    const slides = Array.isArray(s.place) ? this.slidesOf(text) : [];
    const x = slides.length === s.place?.[1] ? slides[s.place[0]] : null;
    const found = x ? this.find({ start: x.start, end: x.open, tag: 'section' }) : null;
    return s.stack ? found?.parentElement?.closest('.reveal .slides > section') ?? null : found;
  }

  private put(thread: Comment, at: Version, a: Anchored): void {
    if (!this.held) return;
    const moved = this.forward(at, [a]);
    if (typeof moved === 'string') return;
    place(thread, moved[0]);
    this.threads.set(thread.id, thread);
    this.changed();
  }

  private async once<T>(key: string, on: unknown[], send: (id: string) => Promise<T>): Promise<T> {
    let kept = this.unsent.get(key);
    if (!kept || kept.on.some((x, i) => x !== on[i])) this.unsent.set(key, (kept = { id: crypto.randomUUID(), on }));
    try {
      const answer = await send(kept.id);
      this.unsent.delete(key);
      return answer;
    } catch (e) {
      if (!(e instanceof Failure && e.retried)) this.unsent.delete(key);
      throw e;
    }
  }

  async act(id: string, route: 'reply' | 'edit' | 'delete' | 'resolve' | 'reopen', body: Record<string, unknown> = {}): Promise<void> {
    const send = (more: Record<string, unknown>) => this.client.transport.post<Comment | Record<string, never>>(`comments/${id}/${route}`, { token: this.client.token, ...body, ...more });
    const answer = route === 'reply' ? await this.once(JSON.stringify([id, body.text]), [], (reply) => send({ id: reply })) : await send({});
    const t = this.threads.get(id);
    if (!('id' in answer)) this.threads.delete(id);
    else if (t) {
      const kept = anchored(t);
      for (const key of ['resolved', 'edited'] as const) delete t[key];
      Object.assign(t, answer);
      place(t, kept);
    }
    this.changed();
  }

  unread(t: Comment): boolean {
    return this.unreadOf(t).length > 0;
  }

  private unreadOf(t: Comment): Item[] {
    const after = Math.max(this.seen, this.read.get(t.id) ?? 0);
    return itemsOf(t).filter((i) => i.author !== this.client.person && stamp(i) > after);
  }

  mine(t: Comment): boolean {
    const me = this.client.person;
    return t.author === me || t.mentions.includes(me) || t.replies.some((r) => r.author === me);
  }

  unreadCount(): number {
    let n = 0;
    for (const t of this.threads.values()) if (this.mine(t)) n += this.unreadOf(t).length;
    return n;
  }

  anyUnread(): boolean {
    for (const t of this.threads.values()) if (!t.resolved && this.unread(t)) return true;
    return false;
  }

  markRead(id: string): void {
    const t = this.threads.get(id);
    if (!t || !this.unread(t)) return;
    this.read.set(id, Math.max(...itemsOf(t).map(stamp)));
    let oldest = Infinity;
    let newest = 0;
    for (const u of this.threads.values()) {
      for (const i of itemsOf(u)) if (i.author !== this.client.person) newest = Math.max(newest, stamp(i));
      for (const i of this.unreadOf(u)) oldest = Math.min(oldest, stamp(i));
    }
    const time = oldest === Infinity ? newest : oldest - 1;
    this.changed();
    const read = this.read.get(id)!;
    if (time > this.seen) this.sendSeen(time, '');
    if (time < read) this.sendSeen(read, id);
  }

  private sendSeen(time: number, thread: string): void {
    void this.client.transport.post<SeenAnswer>('comments/seen', { token: this.client.token, time, ...(thread ? { thread } : {}) }).then(
      (a) => this.times(a.seen, a.read) && this.changed(),
      (e) => (e instanceof Failure && (e.status === 0 || e.status >= 500) ? this.late.set(thread, Math.max(this.late.get(thread) ?? 0, time)) : null),
    );
  }

  numberAt(slide: Element): number | null {
    const i = this.client.port.offsetOf(slide);
    const text = this.client.app.source?.text;
    return i === null || text === undefined ? null : slideAt(this.slidesOf(text), i)?.number ?? null;
  }

  numberOf(t: Comment): number | null {
    const at = t.slide ?? t.anchor;
    return this.held && at ? slideAt(this.slidesOf(this.held.text), at.start)?.number ?? null : null;
  }
}
