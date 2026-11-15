// the replica of a session in a browser. base is the text of the authority at the version that
// the browser has applied, and mine is the text that the deck reads as in this browser. the
// client calls edit() with each render() of the editor, sends what outgoing() returns, passes
// every broadcast operation to receive(), and makes the deck read as the text that receive()
// returns when it is not null. one operation is in flight at most

import type { AppliedOp, OpAnswer, OpRequest, Patch, Version } from './protocol.ts';
import { formatVersion, parseVersion } from './protocol.ts';
import { apply, checksum, diff, mergePatches, shift, valid } from './patch.ts';

export type Side = 'ours' | 'theirs';

type Flight = {
  seq: number;
  // the patches of the operation moved onto base, or null once an operation of another browser
  // conflicts with them, since the authority then refuses the operation
  patches: Patch[] | null;
};

export class Replica {
  readonly client: string;
  base: string;
  mine: string;
  epoch: string;
  n: number;
  // true after a checksum mismatch, a gap in the operations, or a refusal that a new operation does
  // not repair. the client then says hello without v and passes the answer to resync()
  needsResync = false;
  private seq: number;
  private flight: Flight | null = null;
  // after a refusal for a conflict, nothing is sent until base reaches the version of the refusal,
  // since the operation that won may not have been received yet
  private waitFor = -1;

  // text is the text at version v that the editor read. seq is the last sequence number used by
  // this client, 0 for a new client
  constructor(client: string, text: string, v: Version, seq = 0) {
    const parsed = parseVersion(v);
    if (!parsed) throw new Error(`${v} is not a version`);
    this.client = client;
    this.base = text;
    this.mine = text;
    this.epoch = parsed.epoch;
    this.n = parsed.n;
    this.seq = seq;
  }

  get version(): Version {
    return formatVersion(this.epoch, this.n);
  }

  // true while an operation of this browser waits for its broadcast
  get inFlight(): boolean {
    return this.flight !== null;
  }

  // the text that the deck reads as after a change of the deck in this browser
  edit(text: string): void {
    this.mine = text;
  }

  // the operation to send now, or null when one is in flight, a resync is needed, or base is mine
  outgoing(): OpRequest | null {
    if (this.flight || this.needsResync || this.n < this.waitFor || this.mine === this.base) return null;
    const patches = diff(this.base, this.mine);
    if (patches.length === 0) return null;
    this.flight = { seq: ++this.seq, patches };
    return { client: this.client, seq: this.seq, base: this.version, patches };
  }

  // the answer of the edit command to a request of outgoing(). an accepted operation is applied at
  // its broadcast, and a refused one is carried again by the next diff of base and mine
  answer(request: OpRequest, answer: OpAnswer): void {
    if (answer.ok || this.flight?.seq !== request.seq) return;
    this.flight = null;
    const at = parseVersion(answer.v);
    if (answer.reason === 'conflict' || (answer.reason === 'stale' && request.base !== this.version)) {
      this.waitFor = at && at.epoch === this.epoch ? at.n : this.n;
    } else {
      this.needsResync = true;
    }
  }

  // a broadcast operation. returns the text that the deck must read as, or null when the deck stays
  receive(op: AppliedOp): string | null {
    const before = this.mine;
    this.take(op, 'ours', [], true, false);
    return this.mine === before ? null : this.mine;
  }

  // the operations of one answer of events, with the checksum tested after the last one
  receiveAll(ops: AppliedOp[]): string | null {
    const before = this.mine;
    ops.forEach((op, i) => this.take(op, 'ours', [], i === ops.length - 1, false));
    return this.mine === before ? null : this.mine;
  }

  // the patches of mine that conflict with the operations missed while the browser was away, which
  // the client shows the person before it calls catchUp() with the side that wins
  conflictsOf(ops: AppliedOp[]): Patch[] {
    const copy = Object.assign(Object.create(Replica.prototype), this, { flight: this.flight && { ...this.flight } }) as Replica;
    return copy.catchUp(ops, 'ours').conflicts;
  }

  // the operations missed while the browser was away, merged with mine, where the side wins at a
  // conflict. conflicts are the patches of mine that conflicted
  catchUp(ops: AppliedOp[], wins: Side): { text: string | null; conflicts: Patch[] } {
    const before = this.mine;
    const conflicts: Patch[] = [];
    ops.forEach((op, i) => this.take(op, wins, conflicts, i === ops.length - 1, true));
    return { text: this.mine === before ? null : this.mine, conflicts };
  }

  // the whole text of the authority at version v, read again after needsResync. the edits of this
  // browser are merged into it and win at a conflict
  resync(text: string, v: Version): string | null {
    const parsed = parseVersion(v);
    if (!parsed) throw new Error(`${v} is not a version`);
    const before = this.mine;
    const theirs = diff(this.base, text);
    const ours = diff(this.base, this.mine);
    const kept = theirs.filter((t) => !ours.some((o) => o.start === t.start && o.end === t.end && o.text === t.text));
    const merged = apply(this.base, mergePatches(kept, ours, 'ours').patches);
    this.base = text;
    this.mine = merged;
    this.epoch = parsed.epoch;
    this.n = parsed.n;
    this.flight = null;
    this.waitFor = -1;
    this.needsResync = false;
    return merged === before ? null : merged;
  }

  private take(op: AppliedOp, wins: Side, conflicts: Patch[], check: boolean, dedupe: boolean): void {
    if (this.needsResync) return;
    const at = parseVersion(op.v);
    if (at && at.epoch === this.epoch && at.n <= this.n) return;
    if (!at || at.epoch !== this.epoch || at.n !== this.n + 1 || !valid(op.patches, this.base.length)) {
      this.needsResync = true;
      return;
    }
    const next = apply(this.base, op.patches);
    if (op.client === this.client && this.flight?.seq === op.seq) {
      // the broadcast of the operation of this browser, which the deck already reads as
      this.flight = null;
    } else if (this.mine === this.base && !this.flight) {
      this.mine = next;
    } else {
      const theirs = op.patches;
      const flown = this.flight?.patches ? shift(this.flight.patches, theirs, true) : null;
      let merged: string;
      if (this.flight?.patches && flown) {
        // mine was built on base with the operation in flight, mid, hence theirs is moved onto mid
        // with theirs ordered first, which gives the text that the authority will hold
        const mid = apply(this.base, this.flight.patches);
        const onMid = shift(theirs, this.flight.patches, false) ?? [];
        merged = this.merge(mid, onMid, wins, conflicts, dedupe);
        this.flight.patches = flown;
      } else {
        if (this.flight) this.flight.patches = null;
        merged = this.merge(this.base, theirs, wins, conflicts, dedupe);
      }
      this.mine = merged;
    }
    this.base = next;
    this.n = at.n;
    if (check && checksum(this.base) !== op.sum) this.needsResync = true;
  }

  // the text with theirs and the patches that turn it into mine
  private merge(text: string, theirs: Patch[], wins: Side, conflicts: Patch[], dedupe: boolean): string {
    const ours = diff(text, this.mine);
    const kept = dedupe ? theirs.filter((t) => !ours.some((o) => o.start === t.start && o.end === t.end && o.text === t.text)) : theirs;
    const merged = mergePatches(kept, ours, wins);
    conflicts.push(...merged.conflicts);
    return apply(text, merged.patches);
  }
}
