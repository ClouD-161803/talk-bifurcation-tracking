// the comments of a session in a page. the threads are read with GET comments after each hello and
// taken from the answers of events, and their anchors are kept at the version of the base of the
// replica. an answer whose anchors are of a later version waits until the page applied it, and one
// of an earlier version is moved forward through the operations that the page applied since, as the
// edit command moves them. to be shown, the anchors are moved once more to the text that the editor
// indexes, i.e. with the edits of this page that are not acknowledged, and an element is taken only
// when its start tag there holds the name of the anchor. a thread is otherwise shown on its slide,
// or under On the deck. a mention is written @{person id} in the text of a comment

import { allChecked, checkOf, moveAnchors, slideAt, startTagAt, type Anchored, type Check } from '../anchor.ts';
import { apply, checksum, diff, type Patch } from '../patch.ts';
import { slidesOf, type Slide } from '../slides.ts';
import { parseVersion, type Anchor, type AppliedOp, type Comment, type CommentsAnswer, type CommentsEvent, type SeenAnswer, type Version } from '../protocol.ts';
import type { Client } from './client.ts';
import { Failure } from './transport.ts';

// where a thread is shown. el is the element commented on, slide is its slide, and both are null on
// the deck. number is the number of the slide in the status bar
export type Place = { el: Element | null; slide: Element | null; number: number | null };
// an element or a slide as its start tag in a text of the deck and its check, by which it is found
// again in a later text, e.g. once the page is loaded again. twin is its index among the elements
// of the text that read as at its check, and their count. place is the index of a slide among the
// slides of the text and their count, and stack is set for a stack, which is kept at the place of
// its first vertical slide. own is the element in the text with the edits of this page that wait,
// which are merged again once the page is loaded again. left is the checksum of the characters
// before its start tag, kept only when no other twin has the same
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

// the element of a spot in text, or null. while the elements that read as at its check are as many
// as before, the element is the one twin with its left, e.g. after a twin before it was removed
// and one after it added, or else the twin at its index. an element that was changed or removed is
// thus not found in another one that reads as it did. what was kept by another version of the
// theme is not read
function checked(text: string, s: Spot | undefined): Anchor | null {
  if (typeof s?.at?.tag !== 'string' || typeof s.check?.sum !== 'string' || typeof s.check.tag !== 'string' || !Array.isArray(s.twin)) return null;
  const [k, n] = s.twin;
  const all = allChecked(text, s.at.tag, s.check);
  if (all.length !== n || !Number.isInteger(k)) return null;
  const same = typeof s.left === 'string' ? all.filter((x) => leftOf(text, x) === s.left) : [];
  return same.length === 1 ? same[0] : all[k] ?? null;
}

export type Item = { id: string; author: string; time: number; text: string; edited?: number };

// the count of operations kept to move the anchors of an answer of an earlier version
const KEPT = 64;
export const MENTION = /@\{([A-Za-z0-9_-]{22,64})\}/g;

type Step = { v: Version; text: string; patches: Patch[]; after: string };
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
// a comment on a slide is anchored to the start tag of its slide
const onSlide = (t: Comment): boolean => !!t.anchor && !!t.slide && t.anchor.start === t.slide.start;

export class Comments {
  readonly client: Client;
  threads = new Map<string, Comment>();
  // rev and seen as the edit command keeps them. seen is the time up to which the person read
  rev = -1;
  seen = 0;
  // the threads read in this page, with the time of their newest comment then
  read = new Map<string, number>();
  // the base of the replica that the anchors are of
  private held: { text: string; v: Version } | null = null;
  private steps: Step[] = [];
  private queue: Pending[] = [];
  // the answers of events taken while GET comments is answered, or null
  private buffer: Pending[] | null = null;
  private again = false;
  private wanted = false;
  private tries = 0;
  private listeners = new Set<(fresh: Comment[]) => void>();
  private cache: { base: string; text: string; count: number; places: Map<string, Place> } | null = null;
  private count = 0;
  private slides: { text: string; slides: Slide[] } | null = null;
  private reread: string | null = null;
  private rereading = false;
  // the id of each request whose answer may have been lost, by its text, sent again with it
  private unsent = new Map<string, { id: string; on: unknown[] }>();
  // the read times that did not reach the edit command, by thread and '' for seen, sent again once
  // the page is online
  private late = new Map<string, number>();

  constructor(client: Client) {
    this.client = client;
    // at the first hello the replica is not made yet, hence held is then taken from the first move
    // of the base or at the first answer
    client.on('hello', () => {
      this.held ??= client.base;
      this.queue = [];
      void this.fetch();
    });
    client.on('base', (text, v, ops) => this.advance(text, v, ops));
    client.on('comments', (event, v) => {
      if (this.times(event.seen, event.read)) this.changed();
      // an event of the times alone, after a read on another page of the person
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

  // fn is called after every change, with the threads of an answer of events
  onChange(fn: (fresh: Comment[]) => void): void {
    this.listeners.add(fn);
  }

  private changed(fresh: Comment[] = []): void {
    this.count++;
    for (const fn of this.listeners) {
      try {
        fn(fresh);
      } catch (e) {
        // a listener that fails is reported, as Client.emit reports it, and the others go on
        if (typeof reportError === 'function') reportError(e);
        else console.error(e);
      }
    }
  }

  // the times up to which the person read, kept as the latest of the edit command and of this page
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
          // read again once the page is online
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

  // the answers whose version the page reached, in their order
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

  // items of the text at version at moved to the held text. wait while the page has not applied at,
  // and gone when the operations after at are not kept any more
  private forward(at: Version, items: Anchored[]): Anchored[] | 'wait' | 'gone' {
    const held = this.held!;
    if (at === held.v) return items;
    const a = parseVersion(at);
    const b = parseVersion(held.v);
    if (!a || !b) return 'gone';
    // another epoch is reached by a hello, which reads the comments again
    if (a.epoch !== b.epoch || a.n > b.n) return 'wait';
    const from = this.steps.findIndex((s) => s.v === at);
    if (from < 0) return 'gone';
    for (const s of this.steps.slice(from)) items = moveAnchors(s.text, s.patches, s.after, items).items;
    return items;
  }

  // the base of the replica moved from text at version v
  private advance(text: string, v: Version, ops: AppliedOp[] | null): void {
    const now = this.client.base!;
    const held = this.held ?? { text, v };
    this.held = now;
    const threads = [...this.threads.values()];
    let items = threads.map(anchored);
    const steps = held.v === v && ops ? this.rebuild(text, v, ops, now) : null;
    if (steps) {
      let slides: Slide[] | null = null;
      for (const s of steps) ({ items, slides } = moveAnchors(s.text, s.patches, s.after, items, slides));
      this.steps.push(...steps);
      this.steps.splice(0, this.steps.length - KEPT);
    } else {
      // a resync, or operations that do not give the base. the anchors are moved by the difference
      // of the texts until GET comments gives them
      items = moveAnchors(held.text, diff(held.text, now.text), now.text, items).items;
      this.steps = [];
      this.queue = [];
      void this.fetch();
    }
    threads.forEach((t, i) => place(t, items[i]));
    this.changed();
    this.pump();
  }

  // the steps from text at version v to the base now, or null when the operations do not give it
  private rebuild(text: string, v: Version, ops: AppliedOp[], now: { text: string; v: Version }): Step[] | null {
    const steps: Step[] = [];
    let n = parseVersion(v)!.n;
    try {
      for (const op of ops) {
        const at = parseVersion(op.v);
        if (!at || at.n <= n) continue;
        if (at.n !== n + 1) return null;
        const after = apply(text, op.patches);
        steps.push({ v, text, patches: op.patches, after });
        text = after;
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

  // where each thread is shown now, found again only after a change of the texts or of the threads
  places(): Map<string, Place> {
    const held = this.held;
    const text = this.client.app.source?.text;
    if (!held || text === undefined) return new Map();
    if (!this.threads.size) return new Map();
    // the edits of this page leave the text that the editor indexes behind the base, and once they
    // are acknowledged it is read from the deck again, since a long difference may pair a slide
    // or an element with another
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
    // a difference of tags, from edits of this page that wait, may pair an anchor with a twin of its
    // element. the deck is read again, and a thread keeps the element where it was shown meanwhile
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
    threads.forEach((t, i) => {
      const was = this.rereading ? c?.places.get(t.id) : undefined;
      if (was && (was.el ?? was.slide)?.isConnected) {
        places.set(t.id, was);
        return;
      }
      const a = items[i];
      const el = a.anchor && !onSlide(t) && !a.removed ? this.find(a.anchor) : null;
      const slide = (a.slide && this.find(a.slide)) || el?.closest('.reveal .slides section') || null;
      const at = a.slide ?? a.anchor;
      places.set(t.id, { el, slide, number: slide && at ? slideAt(slides, at.start)?.number ?? null : null });
    });
    this.cache = { base: held.text, text, count: this.count, places };
    return places;
  }

  private find(a: Anchor): Element | null {
    const el = this.client.port.elementAt(a.start);
    return el && el.localName.toLowerCase() === a.tag ? el : null;
  }

  // a new thread on el, or on the slide when el is null. the edits of this page are acknowledged
  // first, so that the anchors are of a version that the edit command keeps
  async add(el: Element | null, slide: Element, text: string, mentions: string[]): Promise<Comment> {
    const { client } = this;
    const port = client.port;
    for (let k = 0; ; k++) {
      await client.flush();
      // an element inserted in this page has an offset once the source is read from the deck, and an
      // element after a removal in this page may be paired with a twin until then
      await port.rebase();
      const base = client.base!;
      const item = this.item(el, slide, base.text);
      const { anchor: a, slide: s } = item;
      if (s && !item.removed && (!el || (a && a.start !== s.start))) {
        try {
          const thread = await this.once(JSON.stringify(['', text, mentions]), [el, slide], (id) =>
            client.transport.post<Comment>('comments', {
              token: client.token,
              anchor: el ? { start: a!.start, end: a!.end } : null,
              slide: { start: s.start, end: s.end },
              base: base.v,
              text,
              mentions,
              id,
            }),
          );
          this.put(thread, base.v, el ? item : { anchor: s, slide: s });
          return thread;
        } catch (e) {
          // the version of the anchors left the log of the edit command
          if (!(e instanceof Failure && e.status === 409 && /base/.test(e.message)) || k > 2) throw e;
        }
      } else if (k > 2) throw new Error('The element is not found in the deck. Try again.');
    }
  }

  // el and slide as anchors of the text base, moved there from the text that the editor indexes
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

  // the spots of el and of its slide, each null when the base does not hold it, as for an element
  // inserted in this page until its edit is acknowledged
  spots(el: Element | null, slide: Element): { el: Spot | null; slide: Spot | null } {
    const base = this.client.base;
    if (!base || !this.client.app.source) return { el: null, slide: null };
    const item = this.item(el, slide, base.text);
    const { anchor: a, slide: s } = item;
    const mine = el ? this.client.port.text() : base.text;
    const own = mine === base.text ? null : this.item(el, slide, mine);
    const slides = this.slidesOf(base.text);
    const n = s ? slides.findIndex((x) => x.start >= s.start) : -1;
    return {
      el: el && a && s && !item.removed && a.start !== s.start ? { ...spot(base.text, a), ...(own?.anchor && !own.removed ? { own: spot(mine, own.anchor) } : {}) } : null,
      slide: s ? { ...spot(base.text, s), place: [n, slides.length], ...(n >= 0 && slides[n].start !== s.start ? { stack: true } : {}) } : null,
    };
  }

  // the element of a spot in the deck as it is now, or null. a slide that reads otherwise is taken
  // at its place while the deck has as many slides as before
  spotted(s: Spot): Element | null {
    const text = this.client.app.source?.text;
    if (text === undefined) return null;
    const a = checked(text, s) ?? checked(text, s.own);
    if (a) return this.find(a);
    const slides = Array.isArray(s.place) ? this.slidesOf(text) : [];
    const x = slides.length === s.place?.[1] ? slides[s.place[0]] : null;
    const found = x ? this.find({ start: x.start, end: x.open, tag: 'section' }) : null;
    return s.stack ? found?.parentElement?.closest('.reveal .slides > section') ?? null : found;
  }

  // a thread of an answer to this page, with its anchors of the text at version at
  private put(thread: Comment, at: Version, a: Anchored): void {
    if (!this.held) return;
    const moved = this.forward(at, [a]);
    if (typeof moved === 'string') return;
    place(thread, moved[0]);
    this.threads.set(thread.id, thread);
    this.changed();
  }

  // a request sent with the id kept for key while on holds the same, so that the edit command makes
  // nothing new when the request is sent again after its answer was lost
  private async once<T>(key: string, on: unknown[], send: (id: string) => Promise<T>): Promise<T> {
    let kept = this.unsent.get(key);
    // randomUUID needs a secure context, which a page of a session has: the edit command is at
    // 127.0.0.1, and relayAddress() takes only https or a loopback address
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

  // a request on a thread, whose answer replaces the comments of the thread and keeps its anchors
  async act(id: string, route: 'reply' | 'edit' | 'delete' | 'resolve' | 'reopen', body: Record<string, unknown> = {}): Promise<void> {
    const send = (more: Record<string, unknown>) => this.client.transport.post<Comment | Record<string, never>>(`comments/${id}/${route}`, { token: this.client.token, ...body, ...more });
    const answer = route === 'reply' ? await this.once(JSON.stringify([id, body.text, body.mentions]), [], (reply) => send({ id: reply })) : await send({});
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

  // a thread is unread while a comment of another person is newer than seen and than its last read
  unread(t: Comment): boolean {
    return this.unreadOf(t).length > 0;
  }

  private unreadOf(t: Comment): Item[] {
    const after = Math.max(this.seen, this.read.get(t.id) ?? 0);
    return itemsOf(t).filter((i) => i.author !== this.client.person && stamp(i) > after);
  }

  // a thread of the person: written by them, replied to by them, or mentioning them
  mine(t: Comment): boolean {
    const me = this.client.person;
    return t.author === me || t.mentions.includes(me) || t.replies.some((r) => r.author === me);
  }

  // the count of unread comments of other people in the threads of the person
  unreadCount(): number {
    let n = 0;
    for (const t of this.threads.values()) if (this.mine(t)) n += this.unreadOf(t).length;
    return n;
  }

  // the thread of id read by the person. seen is sent up to the oldest comment still unread in
  // another thread, and the time of the thread alone when seen does not reach it
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

  // seen up to time, or the thread read up to time when thread is not ''
  private sendSeen(time: number, thread: string): void {
    void this.client.transport.post<SeenAnswer>('comments/seen', { token: this.client.token, time, ...(thread ? { thread } : {}) }).then(
      (a) => this.times(a.seen, a.read) && this.changed(),
      // a time that the edit command refuses is not sent again
      (e) => (e instanceof Failure && (e.status === 0 || e.status >= 500) ? this.late.set(thread, Math.max(this.late.get(thread) ?? 0, time)) : null),
    );
  }

  // the number of a slide of the deck in the status bar, or null
  numberAt(slide: Element): number | null {
    const i = this.client.port.offsetOf(slide);
    const text = this.client.app.source?.text;
    return i === null || text === undefined ? null : slideAt(this.slidesOf(text), i)?.number ?? null;
  }

  // the number of the slide of a thread in the held text
  numberOf(t: Comment): number | null {
    const at = t.slide ?? t.anchor;
    return this.held && at ? slideAt(this.slidesOf(this.held.text), at.start)?.number ?? null : null;
  }
}
