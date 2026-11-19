import type { AppliedOp, OpAnswer, OpPost, Patch, Token, Version } from '../protocol.ts';
import { Replica, type Side } from '../replica.ts';

export type Whole = { text: string; v: Version };

export class Sync {
  private replica: Replica;
  private lost = false;
  private applied: number | undefined;

  constructor(client: string, text: string, v: Version) {
    this.replica = new Replica(client, text, v);
  }

  get client(): string {
    return this.replica.client;
  }

  get sender(): string {
    return this.replica.sender;
  }

  get version(): Version {
    return this.replica.version;
  }

  get base(): string {
    return this.replica.base;
  }

  get mine(): string {
    return this.replica.mine;
  }

  get acked(): boolean {
    return !this.replica.inFlight && this.replica.mine === this.replica.base;
  }

  get needsResync(): boolean {
    return this.lost || this.replica.needsResync;
  }

  get blocked(): boolean {
    return this.replica.blocked;
  }

  edit(text: string, places?: readonly number[]): string | null {
    return this.replica.edit(text, places);
  }

  outgoing(token: Token, held?: (text: string) => string[]): OpPost | null {
    const op = this.replica.outgoing(held);
    return op && { ...op, token };
  }

  answer(post: OpPost, answer: OpAnswer): void {
    this.replica.answer(post, answer);
  }

  receive(ops: AppliedOp[]): string | null {
    return this.replica.receiveAll(ops);
  }

  resync(text: string, v: Version, wins?: Side): string | null {
    this.lost = false;
    const applied = this.applied;
    this.applied = undefined;
    return this.replica.resync(text, v, applied, wins);
  }

  conflicts(whole: Whole | null, ops: AppliedOp[]): { conflicts: Patch[]; theirs: string } {
    const r = this.replica.clone();
    const conflicts: Patch[] = [];
    if (whole) r.resync(whole.text, whole.v, this.applied, 'ours', conflicts);
    if (ops.length) conflicts.push(...r.catchUp(ops, 'ours').conflicts);
    return { conflicts, theirs: r.base };
  }

  settle(whole: Whole | null, ops: AppliedOp[], wins: Side): string | null {
    const before = this.replica.mine;
    if (whole) this.resync(whole.text, whole.v, wins);
    if (ops.length) this.replica.catchUp(ops, wins);
    return this.replica.mine === before ? null : this.replica.mine;
  }

  lose(): void {
    this.lost = true;
  }

  move(client: string, applied?: number): void {
    this.applied = applied;
    if (client === this.replica.client) return;
    this.replica.rebind(client);
    this.lost = true;
  }
}
