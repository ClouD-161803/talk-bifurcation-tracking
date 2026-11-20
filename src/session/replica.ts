// the replica of a session in a browser. base is the text of the authority at the version that
// the browser has applied, and mine is the text that the deck reads as in this browser. the
// client calls edit() with each render() of the editor, sends what outgoing() returns, passes
// every broadcast operation to receive(), and makes the deck read as the text that receive()
// returns when it is not null. one operation is in flight at most

import type { AppliedOp, OpAnswer, OpRequest, Patch, Version } from './protocol.ts';
import { formatVersion, parseVersion } from './protocol.ts';
import { alignTo, apply, checksum, coreOf, diff, mergePatches, moveOffsets, placed, shift, valid, wellFormed } from './patch.ts';

export type Side = 'ours' | 'theirs';

type Flight = {
  // the client id under which the operation was sent, which rebind() does not change
  client: string;
  seq: number;
  // the patches of the operation moved onto base, or null once an operation of another browser
  // conflicts with them, since the authority then refuses the operation
  patches: Patch[] | null;
  answered: boolean;
  // the n of the version at which the authority applied the operation, once the answer says so
  accepted: number | null;
};

export class Replica {
  private id: string;
  base: string;
  mine: string;
  epoch: string;
  n: number;
  // true after a checksum mismatch, a gap in the operations, or a refusal that a new operation does
  // not repair. the client then says hello without v and passes the answer to resync()
  needsResync = false;
  // true when an operation was refused as invalid again after the resync that followed the first
  // refusal. nothing is sent any more, and the client asks the person to load the page again
  blocked = false;
  private seq: number;
  private invalids = 0;
  private flight: Flight | null = null;
  // after a refusal for a conflict, nothing is sent until base reaches the version of the refusal,
  // since the operation that won may not have been received yet
  private waitFor = -1;
  // the offsets of mine at which the editor put or removed an element, which place the patches of
  // every diff of mine, see placed(). they are kept until base is mine
  private places: number[] = [];
  private others: number[] = [];

  // text is the text at version v that the editor read. seq is the last sequence number used by
  // this client, 0 for a new client
  constructor(client: string, text: string, v: Version, seq = 0) {
    const parsed = parseVersion(v);
    if (!parsed) throw new Error(`${v} is not a version`);
    this.id = client;
    this.base = text;
    this.mine = text;
    this.epoch = parsed.epoch;
    this.n = parsed.n;
    this.seq = seq;
  }

  get version(): Version {
    return formatVersion(this.epoch, this.n);
  }

  get client(): string {
    return this.id;
  }

  // the client id under which the operation in flight was sent, or client. a hello passes it as
  // was, and its answer tells by applied whether the text holds the operation
  get sender(): string {
    return this.flight?.client ?? this.id;
  }

  // the page goes on under a new client id, e.g. after a restart of the edit command. base, mine,
  // and the operation in flight are kept, and the next resync decides whether the text holds it
  rebind(client: string): void {
    this.id = client;
  }

  // true while an operation of this browser waits for its broadcast
  get inFlight(): boolean {
    return this.flight !== null;
  }

  // true while an operation of this browser waits for its answer. the client holds a resync back
  // until the answer arrives or the request fails, since only the answer tells whether the text of
  // the authority holds the operation
  get unanswered(): boolean {
    return this.flight !== null && !this.flight.answered;
  }

  // the text that the deck reads as after a change of the deck in this browser, and the offsets of
  // text at which the editor put or removed an element. returns the text with each lone surrogate
  // replaced by U+FFFD, which the deck must then read as, or null when text is taken as it is
  edit(text: string, places: readonly number[] = []): string | null {
    const was = this.mine;
    this.mine = wellFormed(text);
    const moved = moveOffsets(this.places, was, this.mine);
    this.places = [...moved, ...places.filter((h) => !moved.includes(h))];
    this.others = moveOffsets(this.others, was, this.mine);
    this.settle();
    return this.mine === text ? null : this.mine;
  }

  // the patches that turn text into mine, at the places of the editor
  private ours(text: string): Patch[] {
    return placed(text, diff(text, this.mine), this.places, this.mine);
  }

  // mine becomes text with patches, the merge of ours with the patches of others. the places become
  // the starts of the removals and insertions of ours in it, which the order of patches tells also
  // where the others insert at one of them
  private remine(text: string, patches: Patch[], ours: Patch[]): number[] {
    this.mine = apply(text, patches);
    const own = new Set(ours);
    this.places = this.places.length ? starts(text, patches, own) : [];
    return starts(text, patches, new Set(patches.filter((p) => !own.has(p))));
  }

  takeOthers(): number[] {
    const out = this.others;
    this.others = [];
    return out;
  }

  private settle(): void {
    if (!this.flight && this.mine === this.base) this.places = [];
  }

  // the operation to send now, or null when one is in flight, a resync is needed, or base is mine.
  // held gives the paths of the files that a text names and that wait for their upload, and the
  // patches that name none of them are sent when the text they give names none either
  outgoing(held?: (text: string) => string[]): OpRequest | null {
    if (this.flight || this.needsResync || this.blocked || this.n < this.waitFor || this.mine === this.base) return null;
    let patches = this.ours(this.base);
    if (held) {
      const paths = held(this.mine);
      patches = patches.filter((p) => !paths.some((path) => p.text.includes(path)));
      if (patches.length && held(apply(this.base, patches)).length) return null;
    }
    if (patches.length === 0) return null;
    this.flight = { client: this.id, seq: ++this.seq, patches, answered: false, accepted: null };
    return { client: this.id, seq: this.seq, base: this.version, patches };
  }

  // the answer of the edit command to a request of outgoing(). an accepted operation is applied at
  // its broadcast, and a refused one is carried again by the next diff of base and mine
  answer(request: OpRequest, answer: OpAnswer): void {
    if (this.flight?.seq !== request.seq) return;
    this.flight.answered = true;
    if (answer.ok) {
      this.invalids = 0;
      const at = parseVersion(answer.v);
      this.flight.accepted = at && at.epoch === this.epoch ? at.n : null;
      return;
    }
    const at = parseVersion(answer.v);
    // the edit command does not know the page, or it restarted since the base, and the text may hold
    // the operation all the same, applied before an answer that was lost. the operation is kept
    // for the resync, which decides by the applied of hello
    if (answer.reason === 'unknown' || (answer.reason === 'stale' && at && at.epoch !== parseVersion(request.base)?.epoch)) {
      this.needsResync = true;
      return;
    }
    this.flight = null;
    if (answer.reason === 'conflict' || (answer.reason === 'stale' && request.base !== this.version)) {
      this.waitFor = at && at.epoch === this.epoch ? at.n : this.n;
    } else if (answer.reason === 'invalid' && ++this.invalids > 1) {
      // a resync did not repair the operation, which would be refused at every send
      this.blocked = true;
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
    return this.clone().catchUp(ops, 'ours').conflicts;
  }

  // a replica in the same state that can be changed apart, e.g. to find the conflicts of a merge
  clone(): Replica {
    return Object.assign(Object.create(Replica.prototype), this, { flight: this.flight && { ...this.flight } }) as Replica;
  }

  // the operations missed while the browser was away, merged with mine, where the side wins at a
  // conflict. conflicts are the patches of mine that conflicted
  catchUp(ops: AppliedOp[], wins: Side): { text: string | null; conflicts: Patch[] } {
    const before = this.mine;
    const conflicts: Patch[] = [];
    ops.forEach((op, i) => this.take(op, wins, conflicts, i === ops.length - 1, true));
    return { text: this.mine === before ? null : this.mine, conflicts };
  }

  // the whole text of the authority at version v, read again after needsResync. applied is the seq
  // of the last operation of sender that the text holds, as hello answers it. the edits of this
  // browser are merged into it, where the side wins at a conflict. conflicts gets the patches of
  // mine that conflicted
  resync(text: string, v: Version, applied?: number, wins?: Side, conflicts: Patch[] = []): string | null {
    const parsed = parseVersion(v);
    if (!parsed) throw new Error(`${v} is not a version`);
    const before = this.mine;
    const from = this.resyncBase(parsed, applied);
    const ours = this.ours(from);
    const theirs = alignTo(from, diff(from, text), ours);
    const kept = theirs.filter((t) => !ours.some((o) => o.start === t.start && o.end === t.end && o.text === t.text));
    // a side is given by the dialog after a break, which decides, and mine wins without one
    const both = mergePatches(kept, ours, wins, from, false, wins);
    conflicts.push(...both.conflicts);
    const added = this.remine(from, both.patches, ours);
    this.others = [...moveOffsets(this.others, before, this.mine), ...added];
    const merged = this.mine;
    this.base = text;
    this.epoch = parsed.epoch;
    this.n = parsed.n;
    this.flight = null;
    this.waitFor = -1;
    this.needsResync = false;
    this.settle();
    return merged === before ? null : merged;
  }

  // the text that a resync merges from: base, or base with the operation in flight when the text
  // of the authority holds it, since its patches would otherwise be on both sides of the merge. the
  // text holds an operation accepted at or before its version of the same epoch, or one whose seq is
  // at most applied. when this is not known, the merge is from base, since a duplicate can be seen
  // and repaired while a lost edit cannot
  private resyncBase(at: { epoch: string; n: number }, applied?: number): string {
    const f = this.flight;
    if (!f?.patches) return this.base;
    const accepted = f.accepted !== null && at.epoch === this.epoch && at.n >= f.accepted;
    return accepted || (applied !== undefined && f.seq <= applied) ? apply(this.base, f.patches) : this.base;
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
    if (op.client === this.flight?.client && op.seq === this.flight.seq) {
      // the broadcast of the operation of this browser, which the deck already reads as
      this.flight = null;
    } else if (this.mine === this.base && !this.flight) {
      this.others = [...moveOffsets(this.others, this.mine, next), ...starts(this.base, op.patches)];
      this.mine = next;
      this.places = [];
    } else {
      const theirs = op.patches;
      const flown = this.flight?.patches ? shift(this.flight.patches, theirs, true) : null;
      if (this.flight?.patches && flown) {
        // mine was built on base with the operation in flight, mid, hence theirs is moved onto mid
        // with theirs ordered first, which gives the text that the authority will hold
        const mid = apply(this.base, this.flight.patches);
        const onMid = shift(theirs, this.flight.patches, false) ?? [];
        const places = this.places.length ? starts(next, flown) : [];
        this.merge(mid, onMid, wins, conflicts, dedupe);
        this.flight.patches = flown;
        // the places of the operation in flight, at its starts in the text that the authority will hold
        this.places.push(...moveOffsets(places, apply(next, flown), this.mine));
      } else {
        if (this.flight) this.flight.patches = null;
        this.merge(this.base, theirs, wins, conflicts, dedupe);
      }
    }
    this.base = next;
    this.n = at.n;
    this.settle();
    if (check && checksum(this.base) !== op.sum) this.needsResync = true;
  }

  // mine becomes the text with theirs and the patches that turn it into mine. a broadcast operation
  // is merged with the text, hence a format and the keys of the other side inside its run are both
  // kept, while the operations missed during a break are shown to the person as conflicts
  private merge(text: string, theirs: Patch[], wins: Side, conflicts: Patch[], dedupe: boolean): void {
    const was = this.mine;
    const ours = this.ours(text);
    const kept = dedupe ? theirs.filter((t) => !ours.some((o) => o.start === t.start && o.end === t.end && o.text === t.text)) : theirs;
    // a catch-up is decided
    const merged = mergePatches(kept, ours, wins, text, !dedupe, dedupe && wins);
    conflicts.push(...merged.conflicts);
    const added = this.remine(text, merged.patches, ours);
    this.others = [...moveOffsets(this.others, was, this.mine), ...added];
  }
}

// the starts in text with patches of the removals and insertions of the patches of own, or of every
// patch without own
function starts(text: string, patches: Patch[], own?: Set<Patch>): number[] {
  const out: number[] = [];
  let delta = 0;
  for (const p of patches) {
    const c = !own || own.has(p) ? coreOf(text, p) : null;
    if (c) out.push(c.start + delta);
    delta += p.text.length - (p.end - p.start);
  }
  return out;
}
