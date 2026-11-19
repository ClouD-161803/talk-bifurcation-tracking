import type { AppliedOp, OpAnswer, OpRequest, Patch, RefusalReason, Version } from './protocol.ts';
import { formatVersion, parseVersion } from './protocol.ts';
import { apply, applyEach, checksum, copy, invert, shift, valid } from './patch.ts';

type Entry = {
  op: AppliedOp;
  inverse: Patch[];
  lengthBefore: number;
  bytes: number;
};

export type Submission = { answer: OpAnswer; op?: AppliedOp };
type Kept = { answer: OpAnswer; base: unknown; patches: string };
export type Observer = (op: AppliedOp, text: string) => void;

export type AuthorityOptions = {
  epoch?: string;
  maxOps?: number;
  maxBytes?: number;
  now?: () => number;
  applied?: [string, number][];
};

const ANSWERS_PER_CLIENT = 32;
const CLIENTS = 1024;

const randomEpoch = () => {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export class Authority {
  readonly epoch: string;
  text: string;
  n = 0;
  private log: Entry[] = [];
  private logBytes = 0;
  private readonly maxOps: number;
  private readonly maxBytes: number;
  private readonly now: () => number;
  private answers = new Map<string, Map<number, Kept>>();
  private observers = new Set<Observer>();
  private seqOf = new Map<string, number>();
  private kept: Map<string, number>;
  private unwritten = new Map<string, { seq: number; n: number }>();

  constructor(text: string, options: AuthorityOptions = {}) {
    this.text = text;
    this.epoch = options.epoch ?? randomEpoch();
    this.maxOps = options.maxOps ?? 1000;
    this.maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
    this.now = options.now ?? Date.now;
    this.kept = new Map(options.applied ?? []);
    while (this.kept.size > CLIENTS) this.kept.delete(this.kept.keys().next().value!);
  }

  get version(): Version {
    return formatVersion(this.epoch, this.n);
  }

  get oldest(): number {
    return this.n - this.log.length;
  }

  reach(v: Version): number | null {
    const at = parseVersion(v);
    return at && at.epoch === this.epoch && at.n >= this.oldest && at.n <= this.n ? at.n : null;
  }

  since(v: Version): AppliedOp[] | null {
    const n = this.reach(v);
    return n === null ? null : this.log.slice(this.log.length - (this.n - n)).map((e) => e.op);
  }

  textAt(n: number): string | null {
    if (n === this.n) return this.text;
    if (!Number.isInteger(n) || n < this.oldest || n > this.n) return null;
    const inverses: Patch[][] = [];
    for (let i = this.log.length - 1; i >= this.log.length - (this.n - n); i--) inverses.push(this.log[i].inverse);
    return applyEach(this.text, inverses);
  }

  applied(client: string): number | undefined {
    return this.unwritten.get(client)?.seq ?? this.kept.get(client);
  }

  written(n: number): boolean {
    let changed = false;
    for (const [client, last] of this.unwritten) {
      if (last.n > n) continue;
      this.unwritten.delete(client);
      this.kept.delete(client);
      this.kept.set(client, last.seq);
      changed = true;
    }
    while (this.kept.size > CLIENTS) this.kept.delete(this.kept.keys().next().value!);
    return changed;
  }

  table(): [string, number][] {
    return [...this.kept];
  }

  observe(fn: Observer): () => void {
    this.observers.add(fn);
    return () => this.observers.delete(fn);
  }

  submit(request: OpRequest, author: string): Submission {
    const { client, seq } = request ?? ({} as OpRequest);
    if (typeof client !== 'string' || !Number.isSafeInteger(seq) || seq < 1) return { answer: this.refuse('invalid') };
    const patches = checksum(JSON.stringify(request.patches) ?? '');
    const earlier = this.answers.get(client)?.get(seq);
    if (earlier) return { answer: earlier.base === request.base && earlier.patches === patches ? earlier.answer : this.refuse('invalid') };
    const known = this.answers.get(client);
    if (known && known.size >= ANSWERS_PER_CLIENT && seq < Math.min(...known.keys())) return { answer: this.refuse('stale') };
    const submission = this.order(request);
    let answers = this.answers.get(client);
    if (!answers) {
      this.answers.set(client, (answers = new Map()));
      if (this.answers.size > CLIENTS) this.answers.delete(this.answers.keys().next().value!);
    }
    answers.set(seq, { answer: submission.answer, base: request.base, patches });
    if (answers.size > ANSWERS_PER_CLIENT) answers.delete(Math.min(...answers.keys()));
    if (submission.op) {
      submission.op.author = author;
      this.notify(submission.op);
    }
    return submission;
  }

  enter(patches: Patch[], author: string): Submission {
    const seq = (this.seqOf.get(author) ?? 0) + 1;
    this.seqOf.set(author, seq);
    return this.submit({ client: author, seq, base: this.version, patches }, author);
  }

  private refuse(reason: RefusalReason): OpAnswer {
    return { ok: false, reason, v: this.version };
  }

  private order(request: OpRequest): Submission {
    const at = parseVersion(request.base);
    if (!at || at.epoch !== this.epoch || at.n < this.oldest) return { answer: this.refuse('stale') };
    if (at.n > this.n) return { answer: this.refuse('invalid') };
    const first = this.log.length - (this.n - at.n);
    const length = at.n === this.n ? this.text.length : this.log[first].lengthBefore;
    if (!valid(request.patches, length)) return { answer: this.refuse('invalid') };
    let patches: Patch[] | null = request.patches.map((p) => ({ start: p.start, end: p.end, text: copy(p.text) }));
    for (let i = first; i < this.log.length && patches; i++) patches = shift(patches, this.log[i].op.patches, true);
    if (!patches) return { answer: this.refuse('conflict') };
    if (!valid(patches, this.text.length, this.text)) return { answer: this.refuse('invalid') };
    patches = patches.filter((p) => p.start !== p.end || p.text !== '');
    const inverse = invert(this.text, patches);
    const lengthBefore = this.text.length;
    this.text = apply(this.text, patches);
    this.n += 1;
    const op: AppliedOp = { v: this.version, client: request.client, seq: request.seq, author: '', time: this.now(), patches, sum: checksum(this.text) };
    const bytes = 64 + patches.reduce((s, p) => s + p.text.length, 0) + inverse.reduce((s, p) => s + p.text.length, 0);
    this.log.push({ op, inverse, lengthBefore, bytes });
    this.unwritten.delete(request.client);
    this.unwritten.set(request.client, { seq: request.seq, n: this.n });
    if (this.unwritten.size > CLIENTS) this.unwritten.delete(this.unwritten.keys().next().value!);
    this.logBytes += bytes;
    while (this.log.length > 1 && (this.log.length > this.maxOps || this.logBytes > this.maxBytes)) this.logBytes -= this.log.shift()!.bytes;
    return { answer: { ok: true, v: this.version }, op };
  }

  private notify(op: AppliedOp): void {
    for (const fn of this.observers) fn(op, this.text);
  }
}
