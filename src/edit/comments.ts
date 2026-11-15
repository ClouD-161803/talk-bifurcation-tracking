// the comments of a session, kept in .session/comments.json and never in index.html. a thread is
// anchored on an element, a slide, or the deck, and its anchors are moved with every operation of
// the authority. the file is written at most once a second and at a stop, with the checksum of the
// text that its anchors are of, so that a start finds them again after a change of index.html
// while the edit command was not running

import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkAnchors, moveAnchors, slideAnchorAt, startTagAt, type Anchored, type Moved } from '../session/anchor.ts';
import type { Authority } from '../session/authority.ts';
import { apply, checksum, type Patch } from '../session/patch.ts';
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
import { renameRetried, renameRetriedSync, setAsideSync } from './disk.ts';

export type CommentsOptions = {
  now?: () => number;
  log?: (message: string) => void;
  // the shortest time between two writes of the file, in ms
  every?: number;
  // the characters of every text of every thread together
  maxChars?: number;
};

export type Failure = { status: number; error: string };

const MENTIONS_MAX = 50;
// the changes kept for the events of the pages that are behind
const LOG_MAX = 4000;

export const isCommentId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(id);
const newId = () => randomBytes(9).toString('base64url');
const fail = (status: number, error: string): Failure => ({ status, error });
export const isFailure = (x: unknown): x is Failure => !!x && typeof (x as Failure).error === 'string' && typeof (x as Failure).status === 'number';
const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isInt = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0;
const charsOf = (t: Comment) => t.text.length + t.replies.reduce((n, r) => n + r.text.length, 0);
const readOnly = () => fail(503, 'the comments could not be read at the start, hence they are read only until the edit command is started again');

// a text of a comment, or a failure
function cleanText(raw: unknown): string | Failure {
  if (typeof raw !== 'string' || !raw.trim()) return fail(400, 'the text is empty');
  if (Array.from(raw).length > COMMENT_MAX) return fail(413, `the text is longer than ${COMMENT_MAX} characters`);
  return raw;
}

function cleanMentions(raw: unknown): string[] | Failure {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MENTIONS_MAX || !raw.every(isPersonId)) return fail(400, 'mentions must be person ids');
  return [...new Set(raw as string[])];
}

// any tag name, since the tokenizer gives one of any length and of any character but a few
const isAnchor = (a: unknown): a is Anchor =>
  !!a && isInt((a as Anchor).start) && isInt((a as Anchor).end) && (a as Anchor).start < (a as Anchor).end && typeof (a as Anchor).tag === 'string' && (a as Anchor).tag.length > 0;

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
  if (c.removed !== undefined && !(c.removed && (c.removed.text === null || typeof c.removed.text === 'string'))) return null;
  const out: Comment = { id: c.id, anchor: c.anchor, slide: c.slide, author: c.author, time: c.time, text: c.text, replies: c.replies.map((r) => ({ ...r })), mentions: [...c.mentions] };
  if (c.removed) out.removed = { text: c.removed.text };
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
  private readonly maxChars: number;
  private threads = new Map<string, Comment>();
  private seenBy = new Map<string, number>();
  private chars = 0;
  // true when the file could not be read nor set aside, hence it is neither written nor changed
  private locked = false;
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
  // the count of changes, and the count that the file holds
  private edits = 0;
  private saved = 0;
  private stopped = false;

  // dir is the .session folder of the talk, and found the patches from the text of the last version
  // of the history to index.html at this start
  constructor(dir: string, authority: Authority, found: { before: string; patches: Patch[] } | null, options: CommentsOptions = {}) {
    this.file = join(dir, 'comments.json');
    this.authority = authority;
    this.now = options.now ?? Date.now;
    this.log = options.log ?? (() => {});
    this.every = options.every ?? 1000;
    this.maxChars = options.maxChars ?? 16 * 1024 * 1024;
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
    return { v: this.v, at: this.authority.version, comments: [...this.threads.values()], seen: this.seenBy.get(person) ?? 0 };
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
    return { v: this.v, changed: [...changed].map((id) => this.threads.get(id)!), removed: [...removed] };
  }

  // a new thread of person. anchor and slide are of the text at version base
  add(person: string, body: Record<string, unknown>): Comment | Failure {
    const text = cleanText(body.text);
    if (isFailure(text)) return text;
    const mentions = cleanMentions(body.mentions);
    if (isFailure(mentions)) return mentions;
    if (this.locked) return readOnly();
    if (this.threads.size >= THREADS_MAX) return fail(409, `a deck holds at most ${THREADS_MAX} threads`);
    if (this.chars + text.length > this.maxChars) return fail(413, 'the comments of the deck are too large');
    const n = typeof body.base === 'string' ? this.authority.reach(body.base) : null;
    if (n === null) return fail(409, 'base is not in the log, read the deck again');
    const at = this.anchorsAt(n, body.anchor, body.slide);
    if (isFailure(at)) return at;
    const item = this.toCurrent(n, at);
    const thread: Comment = { id: newId(), anchor: item.anchor, slide: item.slide, author: person, time: this.now(), text, replies: [], mentions };
    if (item.removed) thread.removed = item.removed;
    this.threads.set(thread.id, thread);
    this.chars += text.length;
    this.changed([thread.id]);
    return thread;
  }

  reply(id: string, person: string, body: Record<string, unknown>): Comment | Failure {
    const thread = this.threads.get(id);
    if (!thread) return fail(404, 'there is no such thread');
    const text = cleanText(body.text);
    if (isFailure(text)) return text;
    const mentions = cleanMentions(body.mentions);
    if (isFailure(mentions)) return mentions;
    if (thread.replies.length >= REPLIES_MAX) return fail(409, `a thread holds at most ${REPLIES_MAX} replies`);
    if (this.locked) return readOnly();
    if (this.chars + text.length > this.maxChars) return fail(413, 'the comments of the deck are too large');
    thread.replies.push({ id: newId(), author: person, time: this.now(), text });
    this.chars += text.length;
    this.mention(thread, mentions);
    this.changed([id]);
    return thread;
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
    if (this.chars + text.length - target.text.length > this.maxChars) return fail(413, 'the comments of the deck are too large');
    this.chars += text.length - target.text.length;
    target.text = text;
    target.edited = this.now();
    this.mention(thread, mentions);
    this.changed([id]);
    return thread;
  }

  // the thread, or its reply of id body.reply, deleted by its author. null when the thread is gone
  remove(id: string, person: string, body: Record<string, unknown>): Comment | null | Failure {
    const thread = this.threads.get(id);
    if (!thread) return fail(404, 'there is no such thread');
    const target = this.target(thread, body.reply);
    if (isFailure(target)) return target;
    if (target.author !== person) return fail(403, 'only the author may delete a comment');
    if (this.locked) return readOnly();
    if (target === thread) {
      this.threads.delete(id);
      this.chars -= charsOf(thread);
      this.changed([id], true);
      return null;
    }
    thread.replies = thread.replies.filter((r) => r !== target);
    this.chars -= target.text.length;
    this.changed([id]);
    return thread;
  }

  resolve(id: string, person: string, resolved: boolean): Comment | Failure {
    const thread = this.threads.get(id);
    if (!thread) return fail(404, 'there is no such thread');
    if (resolved === !!thread.resolved) return thread;
    if (this.locked) return readOnly();
    if (resolved) thread.resolved = { by: person, time: this.now() };
    else delete thread.resolved;
    this.changed([id]);
    return thread;
  }

  // the time up to which person has read the comments, which only grows
  seen(person: string, time: unknown): number | Failure {
    if (!isNumber(time) || time < 0) return fail(400, 'time must be a time in ms');
    const seen = Math.max(this.seenBy.get(person) ?? 0, Math.min(time, this.now()));
    if (seen !== this.seenBy.get(person)) {
      this.seenBy.set(person, seen);
      this.dirty();
    }
    return seen;
  }

  stopSync(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.saved === this.edits || this.locked) return;
    const tmp = this.tmpName();
    try {
      writeFileSync(tmp, this.serialize());
      renameRetriedSync(tmp, this.file);
      this.saved = this.edits;
    } catch (e) {
      this.log(`could not write ${this.file}: ${(e as Error).message}`);
      try {
        unlinkSync(tmp);
      } catch {}
    }
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
      this.chars += charsOf(t);
    }
    for (const [person, time] of Object.entries(d.seen as Record<string, unknown>)) if (isPersonId(person) && isNumber(time)) this.seenBy.set(person, time);
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

  // the anchors of the file placed on the text of this start
  private place(sum: string, found: { before: string; patches: Patch[] } | null): void {
    const threads = [...this.threads.values()];
    let items: Anchored[] = threads;
    let moved: boolean[] = threads.map(() => false);
    if (sum !== this.sum && found && found.patches.length && checksum(found.before) === sum) {
      const r = moveAnchors(found.before, found.patches, this.text, items);
      items = r.items;
      moved = r.changed;
    }
    const checked = checkAnchors(this.text, items);
    this.slides = checked.slides;
    threads.forEach((t, k) => this.setAnchors(t, checked.items[k]));
    const ids = threads.filter((_, k) => moved[k] || checked.changed[k]).map((t) => t.id);
    if (ids.length || sum !== this.sum) this.changed(ids);
  }

  private setAnchors(t: Comment, item: Anchored): void {
    t.anchor = item.anchor;
    t.slide = item.slide;
    if (item.removed) t.removed = item.removed;
    else delete t.removed;
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
    }
    this.text = after;
    this.sum = op.sum;
    this.slides = r.slides;
    const ids: string[] = [];
    threads.forEach((t, k) => {
      this.setAnchors(t, r.items[k]);
      if (r.changed[k]) ids.push(t.id);
    });
    if (ids.length) this.changed(ids);
    else if (threads.length) this.dirty();
  }

  private changed(ids: string[], gone = false): void {
    for (const id of ids) this.changes.push({ v: ++this.v, id, gone });
    if (this.changes.length > LOG_MAX) {
      const cut = this.changes.length - LOG_MAX;
      this.logStart = this.changes[cut - 1].v;
      this.changes = this.changes.slice(cut);
    }
    this.dirty();
    if (ids.length) for (const fn of this.listeners) fn();
  }

  private serialize(): string {
    return JSON.stringify({ sum: this.sum, comments: [...this.threads.values()], seen: Object.fromEntries(this.seenBy) });
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
    this.lastWrite = Date.now();
    const tmp = this.tmpName();
    try {
      await writeFile(tmp, this.serialize());
      // a stop writes the file itself, hence this older text is not renamed over it
      if (this.stopped) {
        await unlink(tmp).catch(() => {});
        return;
      }
      await renameRetried(tmp, this.file);
      this.saved = Math.max(this.saved, edits);
    } catch (e) {
      await unlink(tmp).catch(() => {});
      this.log(`could not write ${this.file}, trying again: ${(e as Error).message}`);
    }
  }
}
