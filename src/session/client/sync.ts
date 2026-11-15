// the Replica of src/session/replica.ts behind the few calls that the client makes, so that a change
// of its signatures stays in this file. the client never transforms an operation itself

import type { AppliedOp, OpAnswer, OpPost, Patch, Token, Version } from '../protocol.ts';
import { Replica, type Side } from '../replica.ts';

// the whole text of an answer of hello, at version v
export type Whole = { text: string; v: Version };

export class Sync {
  private replica: Replica;
  // a whole text is needed, e.g. after a poll whose since left the log or a new client id
  private lost = false;

  constructor(client: string, text: string, v: Version) {
    this.replica = new Replica(client, text, v);
  }

  get client(): string {
    return this.replica.client;
  }

  get version(): Version {
    return this.replica.version;
  }

  // the text of the authority at version, which every edit of this page is made on
  get base(): string {
    return this.replica.base;
  }

  // the text that the deck reads as, with every edit of this page
  get mine(): string {
    return this.replica.mine;
  }

  // every edit of this page is applied by the authority, and its broadcast is received
  get acked(): boolean {
    return !this.replica.inFlight && this.replica.mine === this.replica.base;
  }

  // an operation waits for its answer, which tells whether the text of a resync holds it
  get unanswered(): boolean {
    return this.replica.unanswered;
  }

  get needsResync(): boolean {
    return this.lost || this.replica.needsResync;
  }

  // an operation was refused as invalid after a resync, and nothing is sent any more
  get blocked(): boolean {
    return this.replica.blocked;
  }

  // the text of the deck after a change by the person. returns the text that the deck must read as
  // when the replica repaired it, i.e. a lone surrogate, and null otherwise
  edit(text: string): string | null {
    return this.replica.edit(text);
  }

  outgoing(token: Token): OpPost | null {
    const op = this.replica.outgoing();
    return op && { ...op, token };
  }

  answer(post: OpPost, answer: OpAnswer): void {
    this.replica.answer(post, answer);
  }

  // the operations of a poll or of hello. returns the text that the deck must read as, or null
  receive(ops: AppliedOp[]): string | null {
    return this.replica.receiveAll(ops);
  }

  // the whole text of the authority at v, into which the edits of this page are merged
  resync(text: string, v: Version, wins: Side = 'ours'): string | null {
    this.lost = false;
    return this.replica.resync(text, v, wins);
  }

  // the patches of mine that conflict with the whole text and the operations, and the text of the
  // authority after them, found on a clone of the replica
  conflicts(whole: Whole | null, ops: AppliedOp[]): { conflicts: Patch[]; theirs: string } {
    const r = this.replica.clone();
    const conflicts: Patch[] = [];
    if (whole) r.resync(whole.text, whole.v, 'ours', conflicts);
    if (ops.length) conflicts.push(...r.catchUp(ops, 'ours').conflicts);
    return { conflicts, theirs: r.base };
  }

  // the whole text and the operations merged with mine, where the side wins at a conflict, and a
  // patch of the operations equal to one of mine is taken once. returns the text that the deck
  // must read as, or null
  settle(whole: Whole | null, ops: AppliedOp[], wins: Side): string | null {
    const before = this.replica.mine;
    if (whole) this.resync(whole.text, whole.v, wins);
    if (ops.length) this.replica.catchUp(ops, wins);
    return this.replica.mine === before ? null : this.replica.mine;
  }

  lose(): void {
    this.lost = true;
  }

  // the page goes on under a new client id, e.g. after a restart of the edit command. its edits
  // and the operation in flight are kept, and they are merged into the whole text of the next
  // resync
  move(client: string): void {
    if (client === this.replica.client) return;
    this.replica.rebind(client);
    this.lost = true;
  }
}
