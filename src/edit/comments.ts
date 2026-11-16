// the comments of a session, kept in .session/comments.json and never in index.html. a thread is
// anchored on an element, a slide, or the deck, and its anchors are moved with every operation of
// the authority. the file is written before a change of a thread is answered, and else at most once
// a second and at a stop, with the checksum of the text that its anchors are of, so that a start
// finds them again after a change of index.html while the edit command was not running

import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkAnchors, checkOf, moveAnchors, slideAnchorAt, startTagAt, type Anchored, type Check, type Moved } from '../session/anchor.ts';
import type { Authority } from '../session/authority.ts';
import { apply, checksum, copy, type Patch } from '../session/patch.ts';
import {
  COMMENT_MAX,
  formatVersion,
  isPersonId,
  REPLIES_MAX,
  THREADS_MAX,
  type Anchor,
  type AppliedOp,
  type Comment,
  type CommentReply,
  type CommentsAnswer,
  type CommentsEvent,
} from '../session/protocol.ts';
import { slidesOf, type Slide } from '../session/slides.ts';
import { renameRetriedSync, setAsideSync } from './disk.ts';
import { RELAY_BODY } from './relay.ts';

export type CommentsOptions = {
  now?: () => number;
  log?: (message: string) => void;
  // the shortest time between two writes of the file, in ms
  every?: number;
  // the bytes of every thread as the comments are sent, together
  maxBytes?: number;
};

export type Failure = { status: number; error: string };

const MENTIONS_MAX = 50;
// the changes kept for the events of the pages that are behind
const LOG_MAX = 4000;

export const isCommentId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(id);
const newId = () => randomBytes(9).toString('base64url');
// an id that a page made with crypto.randomUUID(), sent again with a request whose answer was lost
const isPageId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
const fail = (status: number, error: string): Failure => ({ status, error });
export const isFailure = (x: unknown): x is Failure => !!x && typeof (x as Failure).error === 'string' && typeof (x as Failure).status === 'number';
const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isInt = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0;
const bytesOf = (x: unknown) => Buffer.byteLength(JSON.stringify(x));
// the bytes of a thread without its replies, and of a reply, each with the comma after it
const headBytes = (t: Comment) => bytesOf({ ...t, replies: [] }) + 1;
const replyBytes = (r: CommentReply) => bytesOf(r) + 1;
const tooLarge = () => fail(413, 'the comments of the deck are too large');
// the texts of a removed element are cut from a whole earlier text of the deck, which a copy does not
// keep alive
const copyRemoved = (r: NonNullable<Anchored['removed']>) => (r.slide === undefined ? { text: r.text && copy(r.text) } : { text: r.text && copy(r.text), slide: copy(r.slide) });
const NOT_SAVED = 'The host could not save the comment';
const readOnly = () => fail(503, 'the comments could not be read at the start, hence they are read only until the edit command is started again');

// a text of a comment, or a failure
function cleanText(raw: unknown): string | Failure {
  if (typeof raw !== 'string' || !raw.trim()) return fail(400, 'the text is empty');
  if (Array.from(raw).length > COMMENT_MAX) return fail(413, `the text is longer than ${COMMENT_MAX} characters`);
  return raw;
}

function cleanMentions(raw: unknown): string[] | Failure {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw) && raw.length > MENTIONS_MAX) return fail(413, `the comment has more than ${MENTIONS_MAX} mentions`);
  if (!Array.isArray(raw) || !raw.every(isPersonId)) return fail(400, 'mentions must be person ids');
  return [...new Set(raw as string[])];
}

// any tag name, since the tokenizer gives one of any length and of any character but a few
const isAnchor = (a: unknown): a is Anchor =>
  !!a && isInt((a as Anchor).start) && isInt((a as Anchor).end) && (a as Anchor).start < (a as Anchor).end && typeof (a as Anchor).tag === 'string' && (a as Anchor).tag.length > 0;

const readCheck = (t: unknown): Check | null => {
  const c = (t as { check?: Check }).check;
  return !!c && typeof c === 'object' && typeof c.tag === 'string' && c.tag.length > 0 && typeof c.sum === 'string' && /^[0-9a-f]{1,8}-[0-9a-f]{8}$/.test(c.sum) ? { tag: c.tag, sum: c.sum } : null;
};

const isReply = (r: unknown): r is CommentReply =>
  !!r && isCommentId((r as CommentReply).id) && isPersonId((r as CommentReply).author) && isNumber((r as CommentReply).time) && typeof (r as CommentReply).text === 'string' && ((r as CommentReply).edited === undefined || isNumber((r as CommentReply).edited));

// a thread as read from the file, or null
function readThread(t: unknown): Comment | null {
  if (!t || typeof t !== 'object') return null;
  const c = t as Comment;
  if (!isCommentId(c.id) || !isPersonId(c.author) || !isNumber(c.time) || typeof c.text !== 'string') return null;
  if (!(c.anchor === null || isAnchor(c.anchor)) || !(c.slide === null || isAnchor(c.slide))) return null;
  if (!Array.isArray(c.replies) || c.replies.length > REPLIES_MAX || !c.replies.every(isReply)) return null;
  if (!Array.isArray(c.mentions) || !c.mentions.every(isPersonId)) return null;
  if (c.edited !== undefined && !isNumber(c.edited)) return null;
  if (c.resolved !== undefined && !(c.resolved && isPersonId(c.resolved.by) && isNumber(c.resolved.time))) return null;
  if (c.removed !== undefined && !(c.removed && (c.removed.text === null || typeof c.removed.text === 'string') && (c.removed.slide === undefined || typeof c.removed.slide === 'string'))) return null;
  const out: Comment = { id: c.id, anchor: c.anchor, slide: c.slide, author: c.author, time: c.time, text: c.text, replies: c.replies.map((r) => ({ ...r })), mentions: [...c.mentions] };
  if (c.removed) out.removed = c.removed.slide === undefined ? { text: c.removed.text } : { text: c.removed.text, slide: c.removed.slide };
  if (c.edited !== undefined) out.edited = c.edited;
  if (c.resolved) out.resolved = { by: c.resolved.by, time: c.resolved.time };
  return out;
}

export class Comments {
  // grows with every change of a thread, but not with a shift of its anchors
  v = 0;
  private readonly file: string;
  private readonly authority: Authority;
  private readonly now: () => number;
  private readonly log: (message: string) => void;
  private readonly every: number;
  private readonly maxBytes: number;
  private threads = new Map<string, Comment>();
  private seenBy = new Map<string, number>();
  // the bytes of every thread, and of the head of each as last counted, since a shift of its anchors
  // is not counted again
  private bytes = 0;
  private heads = new Map<string, number>();
  // the checks of the elements of the threads: those of the file until the anchors are placed, and
  // then those of the current text, each kept while no patch comes near its element
  private checks = new Map<string, Check>();
  // true when the file could not be read nor set aside, hence it is neither written nor changed
  private locked = false;
  // the time up to which each person read each thread, kept only while it is after the seen of the
  // person, hence at most one time per thread and person
  private readBy = new Map<string, Map<string, number>>();
  // the count of changes of the times of reading, and the count at the last change of each person
  reads = 0;
  private readsBy = new Map<string, number>();
  // the text that the anchors are of, its checksum, and its slides when they are known
  private text: string;
  private sum: string;
  private slides: Slide[] | null = null;
  // the changes after v = logStart, in order
  private changes: { v: number; id: string; gone: boolean }[] = [];
  private logStart = 0;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> | null = null;
  private lastWrite = 0;
  // the count of writes made at once, after which a write in progress is older than the file
  private writesNow = 0;
  // the count of changes, and the count that the file holds
  private edits = 0;
  private saved = 0;
  private stopped = false;
  // true from a failed delayed write to the next one that succeeds, which log once each
  private failing = false;

  // dir is the .session folder of the talk, and found the patches from the text of the last version
  // of the history to index.html at this start
  constructor(dir: string, authority: Authority, found: { before: string; patches: Patch[] } | null, options: CommentsOptions = {}) {
    this.file = join(dir, 'comments.json');
    this.authority = authority;
    this.now = options.now ?? Date.now;
    this.log = options.log ?? (() => {});
    this.every = options.every ?? 1000;
    this.maxBytes = options.maxBytes ?? RELAY_BODY / 2;
    this.text = authority.text;
    this.sum = checksum(this.text);
    try {
      mkdirSync(dir, { recursive: true });
    } catch {}
    const saved = this.load();
    if (saved) this.place(saved.sum, found);
    authority.observe((op, text) => this.operation(op, text));
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  list(person: string): CommentsAnswer {
    return { v: this.v, at: this.authority.version, comments: [...this.threads.values()], ...this.times(person) };
  }

  // the time up to which person read the comments, and each thread read after it
  times(person: string): { seen: number; read: Record<string, number> } {
    return { seen: this.seenBy.get(person) ?? 0, read: Object.fromEntries(this.readBy.get(person) ?? []) };
  }

  readsOf(person: string): number {
    return this.readsBy.get(person) ?? 0;
  }

  // the changes after rev seen of a page, which holds -1 when it may have missed some
  since(seen: number): CommentsEvent {
    if (seen < this.logStart) return { v: this.v, changed: null, removed: null };
    const changed = new Set<string>();
    const removed = new Set<string>();
    for (let k = this.changes.length - 1; k >= 0 && this.changes[k].v > seen; k--) {
      const { id, gone } = this.changes[k];
      if (changed.has(id) || removed.has(id)) continue;
      if (gone || !this.threads.has(id)) removed.add(id);
      else changed.add(id);
    }
    // in the order of list(), which a page keeps for threads of the same time
    return { v: this.v, changed: [...this.threads.values()].filter((t) => changed.has(t.id)), removed: [...removed] };
  }

  // a new thread of person. anchor and slide are of the text at version base
  add(person: string, body: Record<string, unknown>): Comment | Failure {
    if (body.id !== undefined && !isPageId(body.id)) return fail(400, 'id must be made by crypto.randomUUID()');
    const held = body.id === undefined ? undefined : this.threads.get(body.id);
    if (held) return held.author === person ? held : fail(409, 'the id is taken');
    const text = cleanText(body.text);
    if (isFailure(text)) return text;
    const mentions = cleanMentions(body.mentions);
    if (isFailure(mentions)) return mentions;
    if (this.locked) return readOnly();
    if (this.threads.size >= THREADS_MAX) return fail(409, `a deck holds at most ${THREADS_MAX} threads`);
    if (this.bytes + bytesOf(text) > this.maxBytes) return tooLarge();
    const n = typeof body.base === 'string' ? this.authority.reach(body.base) : null;
    if (n === null) return fail(409, 'base is not in the log, read the deck again');
    const at = this.anchorsAt(n, body.anchor, body.slide);
    if (isFailure(at)) return at;
    const item = this.toCurrent(n, at);
    const thread: Comment = { id: (body.id as string | undefined) ?? newId(), anchor: item.anchor, slide: item.slide, author: person, time: this.now(), text, replies: [], mentions };
    if (item.removed) thread.removed = copyRemoved(item.removed);
    if (thread.removed?.text && this.bytes + headBytes(thread) > this.maxBytes) thread.removed = { text: null };
    const head = headBytes(thread);
    if (this.bytes + head > this.maxBytes) return tooLarge();
    this.threads.set(thread.id, thread);
    this.heads.set(thread.id, head);
    this.bytes += head;
    const undo = () => {
      this.threads.delete(thread.id);
      this.heads.delete(thread.id);
      // the check that the failed write took, which a thread sent again with this id would keep
      this.checks.delete(thread.id);
      this.bytes -= head;
    };
    return this.commit([thread.id], undo, NOT_SAVED) ?? thread;
  }

  reply(id: string, person: string, body: Record<string, unknown>): Comment | Failure {
    const thread = this.threads.get(id);
    if (!thread) return fail(404, 'there is no such thread');
    if (body.id !== undefined && !isPageId(body.id)) return fail(400, 'id must be made by crypto.randomUUID()');
    const held = body.id === undefined ? undefined : thread.replies.find((r) => r.id === body.id);
    if (held) return held.author === person ? thread : fail(409, 'the id is taken');
    const text = cleanText(body.text);
    if (isFailure(text)) return text;
    const mentions = cleanMentions(body.mentions);
    if (isFailure(mentions)) return mentions;
    if (thread.replies.length >= REPLIES_MAX) return fail(409, `a thread holds at most ${REPLIES_MAX} replies`);
    if (this.locked) return readOnly();
    const reply: CommentReply = { id: (body.id as string | undefined) ?? newId(), author: person, time: this.now(), text };
    const size = replyBytes(reply);
    if (this.bytes + size > this.maxBytes) return tooLarge();
    const mentioned = thread.mentions.length;
    thread.replies.push(reply);
    this.bytes += size;
    this.mention(thread, mentions);
    this.recount(thread);
    const undo = () => {
      thread.replies.pop();
      this.bytes -= size;
      thread.mentions.length = mentioned;
      this.recount(thread);
    };
    return this.commit([id], undo, NOT_SAVED) ?? thread;
  }

  // a new text of the thread, or of its reply of id body.reply, by its author
  edit(id: string, person: string, body: Record<string, unknown>): Comment | Failure {
    const thread = this.threads.get(id);
    if (!thread) return fail(404, 'there is no such thread');
    const target = this.target(thread, body.reply);
    if (isFailure(target)) return target;
    if (target.author !== person) return fail(403, 'only the author may edit a comment');
    const text = cleanText(body.text);
    if (isFailure(text)) return text;
    const mentions = cleanMentions(body.mentions);
    if (isFailure(mentions)) return mentions;
    if (this.locked) return readOnly();
    const edited = this.now();
    const grow = target === thread ? headBytes({ ...thread, text, edited }) - this.heads.get(id)! : replyBytes({ ...(target as CommentReply), text, edited }) - replyBytes(target as CommentReply);
    if (grow > 0 && this.bytes + grow > this.maxBytes) return tooLarge();
    const was = { text: target.text, edited: target.edited, mentioned: thread.mentions.length };
    if (target !== thread) this.bytes += grow;
    target.text = text;
    target.edited = edited;
    this.mention(thread, mentions);
    this.recount(thread);
    const undo = () => {
      target.text = was.text;
      if (was.edited === undefined) delete target.edited;
      else target.edited = was.edited;
      if (target !== thread) this.bytes -= grow;
      thread.mentions.length = was.mentioned;
      this.recount(thread);
    };
    return this.commit([id], undo, NOT_SAVED) ?? thread;
  }

  // the thread, or its reply of id body.reply, deleted by its author. null when the thread is gone
  remove(id: string, person: string, body: Record<string, unknown>): Comment | null | Failure {
    const thread = this.threads.get(id);
    if (!thread) return fail(404, 'there is no such thread');
    const target = this.target(thread, body.reply);
    if (isFailure(target)) return target;
    if (target.author !== person) return fail(403, 'only the author may delete a comment');
    if (this.locked) return readOnly();
    const error = 'The host could not delete the comment';
    if (target === thread) {
      const threads = [...this.threads];
      const head = this.heads.get(id)!;
      const size = head + thread.replies.reduce((n, r) => n + replyBytes(r), 0);
      const check = this.checks.get(id);
      const reads = [...this.readBy].filter(([, read]) => read.has(id)).map(([p, read]) => [p, read.get(id)!] as const);
      this.threads.delete(id);
      this.bytes -= size;
      this.heads.delete(id);
      this.checks.delete(id);
      for (const [p, read] of this.readBy) if (read.delete(id) && !read.size) this.readBy.delete(p);
      const undo = () => {
        this.threads = new Map(threads);
        this.bytes += size;
        this.heads.set(id, head);
        if (check) this.checks.set(id, check);
        for (const [p, at] of reads) this.readBy.set(p, (this.readBy.get(p) ?? new Map()).set(id, at));
      };
      return this.commit([id], undo, error, true) ?? null;
    }
    const replies = thread.replies;
    thread.replies = replies.filter((r) => r !== target);
    this.bytes -= replyBytes(target as CommentReply);
    const undo = () => {
      thread.replies = replies;
      this.bytes += replyBytes(target as CommentReply);
    };
    return this.commit([id], undo, error) ?? thread;
  }

  resolve(id: string, person: string, resolved: boolean): Comment | Failure {
    const thread = this.threads.get(id);
    if (!thread) return fail(404, 'there is no such thread');
    if (resolved === !!thread.resolved) return thread;
    if (this.locked) return readOnly();
    const was = thread.resolved;
    if (resolved) thread.resolved = { by: person, time: this.now() };
    else delete thread.resolved;
    this.recount(thread);
    const undo = () => {
      if (was) thread.resolved = was;
      else delete thread.resolved;
      this.recount(thread);
    };
    return this.commit([id], undo, resolved ? 'The host could not resolve the thread' : 'The host could not reopen the thread') ?? thread;
  }

  // the time up to which person has read the comments, which only grows
  seen(person: string, time: unknown): number | Failure {
    if (!isNumber(time) || time < 0) return fail(400, 'time must be a time in ms');
    const seen = Math.max(this.seenBy.get(person) ?? 0, Math.min(time, this.now()));
    if (seen !== this.seenBy.get(person)) {
      this.seenBy.set(person, seen);
      const read = this.readBy.get(person);
      for (const [id, at] of read ?? []) if (at <= seen) read!.delete(id);
      if (read && !read.size) this.readBy.delete(person);
      this.readChanged(person);
    }
    return seen;
  }

  // the time up to which person has read the thread of id, which only grows
  seenThread(person: string, id: unknown, time: unknown): number | Failure {
    if (!isNumber(time) || time < 0) return fail(400, 'time must be a time in ms');
    if (typeof id !== 'string' || !this.threads.has(id)) return fail(404, 'there is no such thread');
    const read = this.readBy.get(person) ?? new Map<string, number>();
    const at = Math.min(time, this.now());
    if (at <= (this.seenBy.get(person) ?? 0) || at <= (read.get(id) ?? 0)) return read.get(id) ?? 0;
    read.set(id, at);
    this.readBy.set(person, read);
    this.readChanged(person);
    return at;
  }

  // the other pages of person are told the times, and the file is written
  private readChanged(person: string): void {
    this.readsBy.set(person, ++this.reads);
    this.dirty();
    for (const fn of this.listeners) fn();
  }

  // whether the file holds every change, where read only comments are not written by design
  stopSync(): boolean {
    if (!this.stopped) {
      this.stopped = true;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      if (this.saved !== this.edits && !this.locked) this.writeNow();
    }
    return this.saved === this.edits || this.locked;
  }

  // the file written at once, or false when it could not be. a change of a thread tries the rename 3
  // times, which holds the edit command for 30 ms at most, and a stop as often as other files
  private writeNow(tries?: number): boolean {
    const tmp = this.tmpName();
    try {
      writeFileSync(tmp, this.serialize());
      renameRetriedSync(tmp, this.file, tries);
      this.saved = this.edits;
      this.writesNow++;
      return true;
    } catch (e) {
      this.log(`could not write ${this.file}: ${(e as Error).message}`);
      try {
        unlinkSync(tmp);
      } catch {}
      return false;
    }
  }

  // a change of the threads written before it is told and answered, since a page drops a comment
  // that the host answered and then lost, or else taken back by undo and refused with error
  private commit(ids: string[], undo: () => void, error: string, gone = false): Failure | null {
    if (!this.writeNow(3)) {
      undo();
      return fail(503, error);
    }
    this.changed(ids, gone, true);
    return null;
  }

  // resolves once a write in progress is over
  async idle(): Promise<void> {
    while (this.writing) await this.writing;
  }

  private target(thread: Comment, reply: unknown): Comment | CommentReply | Failure {
    if (reply === undefined || reply === null) return thread;
    return thread.replies.find((r) => r.id === reply) ?? fail(404, 'there is no such reply');
  }

  private mention(thread: Comment, mentions: string[]): void {
    for (const m of mentions) if (!thread.mentions.includes(m) && thread.mentions.length < 4 * MENTIONS_MAX) thread.mentions.push(m);
  }

  // the anchors of a request, checked against the text at version n
  private anchorsAt(n: number, anchor: unknown, slide: unknown): Anchored | Failure {
    const text = this.authority.textAt(n)!;
    const range = (x: unknown) => (x === null || x === undefined ? null : x && typeof x === 'object' && isInt((x as Anchor).start) && isInt((x as Anchor).end) ? (x as { start: number; end: number }) : undefined);
    const a = range(anchor);
    const s = range(slide);
    if (a === undefined || s === undefined) return fail(400, 'anchor and slide must be ranges or null');
    const slides = slidesOf(text);
    let slideTag: Anchor | null = null;
    if (s) {
      slideTag = slideAnchorAt(slides, s.start);
      if (!slideTag || slideTag.start !== s.start || slideTag.end !== s.end) return fail(400, 'slide is not the start tag of a slide');
    }
    if (!a) return { anchor: slideTag, slide: slideTag };
    const tag = startTagAt(text, a.start);
    if (!tag || tag.end !== a.end) return fail(400, 'anchor is not a start tag');
    const holder = slideAnchorAt(slides, tag.start);
    if (s && (holder?.start !== slideTag!.start)) return fail(400, 'slide does not hold the anchor');
    return { anchor: tag, slide: holder };
  }

  // anchors of the text at version n moved to the current text
  private toCurrent(n: number, item: Anchored): Anchored {
    let text = this.authority.textAt(n)!;
    let slides: Slide[] | null = null;
    for (const op of this.authority.since(formatVersion(this.authority.epoch, n)) ?? []) {
      const after = apply(text, op.patches);
      const r = moveAnchors(text, op.patches, after, [item], slides);
      item = r.items[0];
      slides = r.slides;
      text = after;
    }
    return item;
  }

  // the threads read from the file, or null when there is none or it cannot be read
  private load(): { sum: string } | null {
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(this.file, 'utf8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      return this.unreadable();
    }
    const d = data as { sum?: unknown; comments?: unknown; seen?: unknown };
    if (!d || typeof d !== 'object' || typeof d.sum !== 'string' || !Array.isArray(d.comments) || d.comments.length > THREADS_MAX || !d.seen || typeof d.seen !== 'object') return this.unreadable();
    let bad = 0;
    for (const raw of d.comments) {
      const t = readThread(raw);
      if (!t) {
        bad++;
        continue;
      }
      this.threads.set(t.id, t);
      const check = readCheck(raw);
      if (check) this.checks.set(t.id, check);
      else this.checks.delete(t.id);
    }
    for (const t of this.threads.values()) {
      this.recount(t);
      for (const r of t.replies) this.bytes += replyBytes(r);
    }
    for (const [person, time] of Object.entries(d.seen as Record<string, unknown>)) if (isPersonId(person) && isNumber(time)) this.seenBy.set(person, time);
    // a file of an earlier edit command does not hold the times of the threads
    const read = (data as { read?: unknown }).read;
    for (const [person, times] of Object.entries(read && typeof read === 'object' ? read : {})) {
      if (!isPersonId(person) || !times || typeof times !== 'object') continue;
      const seen = this.seenBy.get(person) ?? 0;
      const kept = new Map(Object.entries(times as Record<string, unknown>).filter((e): e is [string, number] => this.threads.has(e[0]) && isNumber(e[1]) && e[1] > seen));
      if (kept.size) this.readBy.set(person, kept);
    }
    if (bad) this.setAside(false, `${bad} of the threads could not be read, hence they were left out`);
    return { sum: d.sum };
  }

  private unreadable(): null {
    this.setAside(true, 'the comments could not be read');
    return null;
  }

  // the file set aside before it is written again, or else kept and never written in this run
  private setAside(move: boolean, why: string): void {
    const aside = join(this.file, '..', `comments-unreadable-${Date.now()}.json`);
    if (setAsideSync(this.file, aside, move)) {
      this.log(`${why}, and the file was set aside as ${aside}`);
      this.dirty();
    } else {
      this.locked = true;
      this.log(`${why}, and the file could not be set aside, hence the comments are read only until the next start`);
    }
  }

  // the bytes of the head of t counted again, after a change of it
  private recount(t: Comment): void {
    const head = headBytes(t);
    this.bytes += head - (this.heads.get(t.id) ?? 0);
    this.heads.set(t.id, head);
  }

  // the anchors of the file placed on the text of this start
  private place(sum: string, found: { before: string; patches: Patch[] } | null): void {
    const threads = [...this.threads.values()];
    let items: Anchored[] = threads;
    let moved: boolean[] = threads.map(() => false);
    const movable = sum !== this.sum && !!found && found.patches.length > 0 && checksum(found.before) === sum;
    if (movable) {
      const r = moveAnchors(found!.before, found!.patches, this.text, items);
      items = r.items;
      moved = r.changed;
    }
    // the text that the anchors are of is not known, hence each is read by its check
    const checks = sum === this.sum || movable ? [] : threads.map((t) => this.checks.get(t.id));
    this.checks.clear();
    const checked = checkAnchors(this.text, items, undefined, checks);
    this.slides = checked.slides;
    threads.forEach((t, k) => this.setAnchors(t, checked.items[k]));
    const ids = threads.filter((_, k) => moved[k] || checked.changed[k]).map((t) => t.id);
    if (ids.length || sum !== this.sum) this.changed(ids);
  }

  private setAnchors(t: Comment, item: Anchored): void {
    t.anchor = item.anchor;
    t.slide = item.slide;
    if (item.removed === t.removed) return;
    if (item.removed) t.removed = copyRemoved(item.removed);
    else delete t.removed;
    this.recount(t);
    // a removed text is left out when it would pass the limit, since a deletion is never refused
    if (t.removed?.text && this.bytes > this.maxBytes) {
      t.removed = { text: null };
      this.recount(t);
    }
  }

  private operation(op: AppliedOp, after: string): void {
    const threads = [...this.threads.values()];
    let r: Moved;
    try {
      r = moveAnchors(this.text, op.patches, after, threads, this.slides);
    } catch (e) {
      // the operation is applied already, hence a fault here only costs the anchors their place
      this.log(`the anchors of the comments could not be moved, hence they were checked: ${(e as Error).message}`);
      r = checkAnchors(after, threads);
      this.checks.clear();
    }
    this.text = after;
    this.sum = op.sum;
    this.slides = r.slides;
    const ids: string[] = [];
    threads.forEach((t, k) => {
      if (r.changed[k] || this.near(t, op.patches)) this.checks.delete(t.id);
      this.setAnchors(t, r.items[k]);
      if (r.changed[k]) ids.push(t.id);
    });
    if (ids.length) this.changed(ids);
    else if (threads.length) this.dirty();
  }

  // written is true when the file holds the changes already
  private changed(ids: string[], gone = false, written = false): void {
    for (const id of ids) this.changes.push({ v: ++this.v, id, gone });
    if (this.changes.length > LOG_MAX) {
      const cut = this.changes.length - LOG_MAX;
      this.logStart = this.changes[cut - 1].v;
      this.changes = this.changes.slice(cut);
    }
    if (!written) this.dirty();
    if (ids.length) for (const fn of this.listeners) fn();
  }

  // true when a patch touches the element of the check of t, or ends or starts at it
  private near(t: Comment, patches: Patch[]): boolean {
    const c = this.checks.get(t.id);
    if (!c || !t.anchor) return false;
    const start = t.anchor.start;
    let lo = 0;
    let hi = patches.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (patches[mid].end < start) lo = mid + 1;
      else hi = mid;
    }
    return lo < patches.length && patches[lo].start <= start + parseInt(c.sum, 16);
  }

  private serialize(): string {
    const checked = (t: Comment) => {
      let c = this.checks.get(t.id);
      if (!c) this.checks.set(t.id, (c = checkOf(this.text, t.anchor!)));
      return c;
    };
    const comments = [...this.threads.values()].map((t) => (t.anchor ? { ...t, check: checked(t) } : t));
    const read = Object.fromEntries([...this.readBy].map(([person, times]) => [person, Object.fromEntries(times)]));
    return JSON.stringify({ sum: this.sum, comments, seen: Object.fromEntries(this.seenBy), read });
  }

  private tmpName(): string {
    return join(this.file, '..', `.comments.json.${randomBytes(6).toString('hex')}.tmp`);
  }

  private dirty(): void {
    this.edits++;
    this.schedule();
  }

  // a write at most once in every ms, one at a time
  private schedule(): void {
    if (this.stopped || this.locked || this.timer || this.writing) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.writing = this.write().finally(() => {
        this.writing = null;
        if (this.saved !== this.edits) this.schedule();
      });
    }, Math.max(0, this.lastWrite + this.every - Date.now()));
    this.timer.unref?.();
  }

  private async write(): Promise<void> {
    if (this.stopped) return;
    const edits = this.edits;
    const writesNow = this.writesNow;
    this.lastWrite = Date.now();
    const tmp = this.tmpName();
    try {
      await writeFile(tmp, this.serialize());
      // a stop or a change of a thread writes the file at once, hence this older text is not renamed
      // over it. the rename is made at once as well, so that such a write cannot come between, and
      // tried once, since a rename that fails is tried again at the next turn
      if (this.stopped || this.writesNow !== writesNow) {
        await unlink(tmp).catch(() => {});
        return;
      }
      renameRetriedSync(tmp, this.file, 1);
      this.saved = Math.max(this.saved, edits);
      if (this.failing) this.log(`wrote ${this.file} again`);
      this.failing = false;
    } catch (e) {
      if (!this.stopped && !this.failing) this.log(`could not write ${this.file}, trying again: ${(e as Error).message}`);
      this.failing = true;
      await unlink(tmp).catch(() => {});
    }
  }
}
