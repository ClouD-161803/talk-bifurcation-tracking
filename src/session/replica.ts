import type { AppliedOp, OpAnswer, OpRequest, Patch, Version } from './protocol.ts';
import { formatVersion, parseVersion } from './protocol.ts';
import { alignTo, apply, checksum, coreOf, diff, mergePatches, moveOffsets, placed, shift, valid, wellFormed } from './patch.ts';

export type Side = 'ours' | 'theirs';

type Flight = {
  client: string;
  seq: number;
  patches: Patch[] | null;
  answered: boolean;
  accepted: number | null;
};

export class Replica {
  private id: string;
  base: string;
  mine: string;
  epoch: string;
  n: number;
  needsResync = false;
  blocked = false;
  private seq: number;
  private invalids = 0;
  private flight: Flight | null = null;
  private waitFor = -1;
  private places: number[] = [];
  private others: number[] = [];

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

  get sender(): string {
    return this.flight?.client ?? this.id;
  }

  rebind(client: string): void {
    this.id = client;
  }

  get inFlight(): boolean {
    return this.flight !== null;
  }

  get unanswered(): boolean {
    return this.flight !== null && !this.flight.answered;
  }

  edit(text: string, places: readonly number[] = []): string | null {
    const was = this.mine;
    this.mine = wellFormed(text);
    const moved = moveOffsets(this.places, was, this.mine);
    this.places = [...moved, ...places.filter((h) => !moved.includes(h))];
    this.others = moveOffsets(this.others, was, this.mine);
    this.settle();
    return this.mine === text ? null : this.mine;
  }

  private ours(text: string): Patch[] {
    return placed(text, diff(text, this.mine), this.places, this.mine);
  }

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
    if (answer.reason === 'unknown' || (answer.reason === 'stale' && at && at.epoch !== parseVersion(request.base)?.epoch)) {
      this.needsResync = true;
      return;
    }
    this.flight = null;
    if (answer.reason === 'conflict' || (answer.reason === 'stale' && request.base !== this.version)) {
      this.waitFor = at && at.epoch === this.epoch ? at.n : this.n;
    } else if (answer.reason === 'invalid' && ++this.invalids > 1) {
      this.blocked = true;
    } else {
      this.needsResync = true;
    }
  }

  receive(op: AppliedOp): string | null {
    const before = this.mine;
    this.take(op, 'ours', [], true, false);
    return this.mine === before ? null : this.mine;
  }

  receiveAll(ops: AppliedOp[], dropped: Patch[] = []): string | null {
    const before = this.mine;
    ops.forEach((op, i) => this.take(op, 'ours', dropped, i === ops.length - 1, false));
    return this.mine === before ? null : this.mine;
  }

  conflictsOf(ops: AppliedOp[]): Patch[] {
    return this.clone().catchUp(ops, 'ours').conflicts;
  }

  clone(): Replica {
    return Object.assign(Object.create(Replica.prototype), this, { flight: this.flight && { ...this.flight } }) as Replica;
  }

  catchUp(ops: AppliedOp[], wins: Side): { text: string | null; conflicts: Patch[] } {
    const before = this.mine;
    const conflicts: Patch[] = [];
    ops.forEach((op, i) => this.take(op, wins, conflicts, i === ops.length - 1, true));
    return { text: this.mine === before ? null : this.mine, conflicts };
  }

  resync(text: string, v: Version, applied?: number, wins?: Side, conflicts: Patch[] = []): string | null {
    const parsed = parseVersion(v);
    if (!parsed) throw new Error(`${v} is not a version`);
    const before = this.mine;
    const from = this.resyncBase(parsed, applied);
    const ours = this.ours(from);
    const theirs = alignTo(from, diff(from, text), ours);
    const kept = theirs.filter((t) => !ours.some((o) => o.start === t.start && o.end === t.end && o.text === t.text));
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
      this.flight = null;
    } else if (this.mine === this.base && !this.flight) {
      this.others = [...moveOffsets(this.others, this.mine, next), ...starts(this.base, op.patches)];
      this.mine = next;
      this.places = [];
    } else {
      const theirs = op.patches;
      const flown = this.flight?.patches ? shift(this.flight.patches, theirs, true) : null;
      if (this.flight?.patches && flown) {
        const mid = apply(this.base, this.flight.patches);
        const onMid = shift(theirs, this.flight.patches, false) ?? [];
        const places = this.places.length ? starts(next, flown) : [];
        this.merge(mid, onMid, wins, conflicts, dedupe);
        this.flight.patches = flown;
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

  private merge(text: string, theirs: Patch[], wins: Side, conflicts: Patch[], dedupe: boolean): void {
    const was = this.mine;
    const ours = this.ours(text);
    const kept = dedupe ? theirs.filter((t) => !ours.some((o) => o.start === t.start && o.end === t.end && o.text === t.text)) : theirs;
    const merged = mergePatches(kept, ours, wins, text, !dedupe, dedupe && wins);
    conflicts.push(...((dedupe ? merged.conflicts : merged.dropped) ?? []));
    const added = this.remine(text, merged.patches, ours);
    this.others = [...moveOffsets(this.others, was, this.mine), ...added];
  }
}

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
