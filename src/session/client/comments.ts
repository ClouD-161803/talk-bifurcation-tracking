// the comments of a session in a page. the threads are read with GET comments after each hello and
// taken from the answers of events, and their anchors are kept at the version of the base of the
// replica. an answer whose anchors are of a later version waits until the page applied it, and one
// of an earlier version is moved forward through the operations that the page applied since, as the
// edit command moves them. to be shown, the anchors are moved once more to the text that the editor
// indexes, i.e. with the edits of this page that are not acknowledged, and an element is taken only
// when its start tag there holds the name of the anchor. a thread is otherwise shown on its slide,
// or under On the deck. a mention is written @{person id} in the text of a comment

import { moveAnchors, slideAt, startTagAt, type Anchored } from '../anchor.ts';
import { apply, diff, type Patch } from '../patch.ts';
import { slidesOf, type Slide } from '../slides.ts';
import { parseVersion, type Anchor, type AppliedOp, type Comment, type CommentsAnswer, type CommentsEvent, type Version } from '../protocol.ts';
import type { Client } from './client.ts';
import { Failure } from './transport.ts';

// where a thread is shown. el is the element commented on, slide is its slide, and both are null on
// the deck. number is the number of the slide in the status bar
export type Place = { el: Element | null; slide: Element | null; number: number | null };

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
    client.on('comments', (event, v) => this.take({ at: v, snapshot: null, event }));
    client.on('state', () => {
      if (this.wanted && client.connection === 'online') void this.fetch();
    });
  }

  // fn is called after every change, with the threads of an answer of events
  onChange(fn: (fresh: Comment[]) => void): void {
    this.listeners.add(fn);
  }

  private changed(fresh: Comment[] = []): void {
    this.count++;
    for (const fn of this.listeners) fn(fresh);
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
        this.seen = Math.max(this.seen, p.snapshot.seen);
        fresh ??= [];
      } else {
        const e = p.event!;
        if (e.v <= this.rev) continue;
        for (const t of list) this.threads.set(t.id, t);
        for (const id of e.removed!) this.threads.delete(id);
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
    if (text !== held.text) items = moveAnchors(held.text, diff(held.text, text), text, items).items;
    const slides = this.slidesOf(text);
    const places = new Map<string, Place>();
    threads.forEach((t, i) => {
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
      // an element inserted in this page has an offset once the source is read from the deck
      if (k > 0 || (el && port.offsetOf(el) === null) || port.offsetOf(slide) === null) await port.rebase();
      const base = client.base!;
      const source = client.app.source!.text;
      const at = (x: Element) => {
        const i = port.offsetOf(x);
        return i === null ? null : startTagAt(source, i);
      };
      let item: Anchored = { anchor: el ? at(el) : null, slide: at(slide) };
      if (source !== base.text && item.slide) item = moveAnchors(source, diff(source, base.text), base.text, [item]).items[0];
      const { anchor: a, slide: s } = item;
      if (s && !item.removed && (!el || (a && a.start !== s.start))) {
        try {
          const thread = await client.transport.post<Comment>('comments', {
            token: client.token,
            anchor: el ? { start: a!.start, end: a!.end } : null,
            slide: { start: s.start, end: s.end },
            base: base.v,
            text,
            mentions,
          });
          this.put(thread, base.v, el ? item : { anchor: s, slide: s });
          return thread;
        } catch (e) {
          // the version of the anchors left the log of the edit command
          if (!(e instanceof Failure && e.status === 409 && /base/.test(e.message)) || k > 2) throw e;
        }
      } else if (k > 2) throw new Error('The element is not found in the deck. Try again.');
    }
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

  // a request on a thread, whose answer replaces the comments of the thread and keeps its anchors
  async act(id: string, route: 'reply' | 'edit' | 'delete' | 'resolve' | 'reopen', body: Record<string, unknown> = {}): Promise<void> {
    const answer = await this.client.transport.post<Comment | Record<string, never>>(`comments/${id}/${route}`, { token: this.client.token, ...body });
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
  // another thread, since the edit command keeps one time per person
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
    if (time <= this.seen) return;
    void this.client.transport.post<{ seen: number }>('comments/seen', { token: this.client.token, time }).then(
      (a) => {
        if (a.seen > this.seen) {
          this.seen = a.seen;
          this.changed();
        }
      },
      () => {},
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
