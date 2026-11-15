// the authority of a session, kept by the edit command: it alone orders the operations, and it
// holds the text, the version, and the log of the operations applied lately. an operation of an
// older version is moved over each logged operation after its base, and refused whole when one of
// its patches conflicts with one of them

import type { AppliedOp, OpAnswer, OpRequest, Patch, RefusalReason, Version } from './protocol.ts';
import { formatVersion, parseVersion } from './protocol.ts';
import { apply, checksum, invert, shift, valid } from './patch.ts';

type Entry = {
  op: AppliedOp;
  // the patches that turn the text after op back into the text before it
  inverse: Patch[];
  lengthBefore: number;
  bytes: number;
};

export type Submission = { answer: OpAnswer; op?: AppliedOp };
export type Observer = (op: AppliedOp, text: string) => void;

export type AuthorityOptions = {
  epoch?: string;
  // the log keeps at most maxOps operations, and at most about maxBytes of patch text
  maxOps?: number;
  maxBytes?: number;
  now?: () => number;
};

// the answers kept per client, against which a repeated (client, seq) is answered again, for the
// clients seen last
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
  private answers = new Map<string, Map<number, OpAnswer>>();
  private observers = new Set<Observer>();
  private seqOf = new Map<string, number>();

  constructor(text: string, options: AuthorityOptions = {}) {
    this.text = text;
    this.epoch = options.epoch ?? randomEpoch();
    this.maxOps = options.maxOps ?? 1000;
    this.maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
    this.now = options.now ?? Date.now;
  }

  get version(): Version {
    return formatVersion(this.epoch, this.n);
  }

  // the oldest version whose text can be rebuilt and whose later operations are in the log
  get oldest(): number {
    return this.n - this.log.length;
  }

  // the n of a version of this epoch that the log reaches, or null
  reach(v: Version): number | null {
    const at = parseVersion(v);
    return at && at.epoch === this.epoch && at.n >= this.oldest && at.n <= this.n ? at.n : null;
  }

  // the operations applied after version v, or null when v is not reached by the log
  since(v: Version): AppliedOp[] | null {
    const n = this.reach(v);
    return n === null ? null : this.log.slice(this.log.length - (this.n - n)).map((e) => e.op);
  }

  // the text at version n of this epoch, rebuilt from the inverses of the log, or null
  textAt(n: number): string | null {
    if (n === this.n) return this.text;
    if (!Number.isInteger(n) || n < this.oldest || n > this.n) return null;
    let text = this.text;
    for (let i = this.log.length - 1; i >= this.log.length - (this.n - n); i--) text = apply(text, this.log[i].inverse);
    return text;
  }

  // calls fn with each applied operation and the text after it, until the returned function is called
  observe(fn: Observer): () => void {
    this.observers.add(fn);
    return () => this.observers.delete(fn);
  }

  // an operation of a browser, of the person author
  submit(request: OpRequest, author: string): Submission {
    const { client, seq } = request ?? ({} as OpRequest);
    if (typeof client !== 'string' || !Number.isSafeInteger(seq) || seq < 1) return { answer: this.refuse('invalid') };
    const earlier = this.answers.get(client)?.get(seq);
    if (earlier) return { answer: earlier };
    const known = this.answers.get(client);
    if (known && known.size >= ANSWERS_PER_CLIENT && seq < Math.min(...known.keys())) return { answer: this.refuse('stale') };
    const submission = this.order(request);
    let answers = this.answers.get(client);
    if (!answers) {
      this.answers.set(client, (answers = new Map()));
      if (this.answers.size > CLIENTS) this.answers.delete(this.answers.keys().next().value!);
    }
    answers.set(seq, submission.answer);
    if (answers.size > ANSWERS_PER_CLIENT) answers.delete(Math.min(...answers.keys()));
    if (submission.op) {
      submission.op.author = author;
      this.notify(submission.op);
    }
    return submission;
  }

  // patches of the current text, entered as an operation of author, e.g. a change of the file
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
    let patches: Patch[] | null = request.patches.map((p) => ({ start: p.start, end: p.end, text: p.text }));
    for (let i = first; i < this.log.length && patches; i++) patches = shift(patches, this.log[i].op.patches, true);
    if (!patches) return { answer: this.refuse('conflict') };
    // a cut between the two halves of a surrogate pair is found on the text that it is applied to
    if (!valid(patches, this.text.length, this.text)) return { answer: this.refuse('invalid') };
    patches = patches.filter((p) => p.start !== p.end || p.text !== '');
    const inverse = invert(this.text, patches);
    const lengthBefore = this.text.length;
    this.text = apply(this.text, patches);
    this.n += 1;
    const op: AppliedOp = { v: this.version, client: request.client, seq: request.seq, author: '', time: this.now(), patches, sum: checksum(this.text) };
    const bytes = 64 + patches.reduce((s, p) => s + p.text.length, 0) + inverse.reduce((s, p) => s + p.text.length, 0);
    this.log.push({ op, inverse, lengthBefore, bytes });
    this.logBytes += bytes;
    while (this.log.length > 1 && (this.log.length > this.maxOps || this.logBytes > this.maxBytes)) this.logBytes -= this.log.shift()!.bytes;
    return { answer: { ok: true, v: this.version }, op };
  }

  private notify(op: AppliedOp): void {
    for (const fn of this.observers) fn(op, this.text);
  }
}
