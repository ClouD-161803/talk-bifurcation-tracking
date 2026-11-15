// the people of a session, their presence, and the long polls of events. a poll is answered at
// once when there is news for its browser, and held for at most 25 s otherwise. a browser is
// answered at most ten times a second, hence the news of a burst of operations is batched

import { randomBytes } from 'node:crypto';
import type { Authority } from '../session/authority.ts';
import { COLORS, type EventsAnswer, type Person, type Presence } from '../session/protocol.ts';

const HOLD = 25_000;
const GAP = 100;
const GONE = 40_000;
const MAX_PEOPLE = 64;
const MAX_KNOWN = 1024;
export const MAX_STATE = 8 * 1024;

type Member = Person & { state: unknown; lastSeen: number; seen: number; lastAnswer: number; polls: number };

type Poll = {
  client: string;
  since: string;
  done: (answer: EventsAnswer) => void;
  hold: ReturnType<typeof setTimeout>;
  gap: ReturnType<typeof setTimeout> | null;
};

export const isClientId = (c: unknown): c is string => typeof c === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(c);

export class People {
  private authority: Authority;
  private members = new Map<string, Member>();
  // every client that said hello, so that a browser back from a sleep keeps its name and color
  private known = new Map<string, { name: string; color: number; host: boolean }>();
  private polls = new Set<Poll>();
  private rev = 0;
  private arrivals = 0;
  private sweeper: ReturnType<typeof setInterval>;
  private ended = false;

  constructor(authority: Authority) {
    this.authority = authority;
    authority.observe(() => this.wake());
    this.sweeper = setInterval(() => this.sweep(), 5000);
    this.sweeper.unref?.();
  }

  hello(name: string, client: string | undefined, host: boolean): Member | null {
    const id = isClientId(client) ? client : randomBytes(12).toString('base64url');
    const before = this.known.get(id);
    if (!this.members.has(id) && this.members.size >= MAX_PEOPLE) return null;
    const color = before?.color ?? this.arrivals++ % COLORS.length;
    this.known.set(id, { name, color, host });
    if (this.known.size > MAX_KNOWN) this.known.delete(this.known.keys().next().value!);
    let member = this.members.get(id);
    if (member) Object.assign(member, { name, host, lastSeen: Date.now(), seen: -1 });
    else this.members.set(id, (member = { client: id, name, color, host, state: null, lastSeen: Date.now(), seen: -1, lastAnswer: 0, polls: 0 }));
    this.changed();
    return member;
  }

  // the name of a client that said hello, or null
  nameOf(client: unknown): string | null {
    return typeof client === 'string' ? (this.known.get(client)?.name ?? null) : null;
  }

  list(): Person[] {
    return [...this.members.values()].map(({ client, name, color, host }) => ({ client, name, color, host }));
  }

  presence(client: string, state: unknown): boolean {
    const member = this.revive(client);
    if (!member) return false;
    member.state = state;
    this.changed();
    return true;
  }

  bye(client: string): void {
    if (this.members.delete(client)) this.changed();
  }

  // a long poll of client for the news after the version since
  events(client: string, since: string): Promise<EventsAnswer> | null {
    const member = this.revive(client);
    if (!member) return null;
    return new Promise((done) => {
      const poll: Poll = { client, since, done, hold: setTimeout(() => this.answer(poll), HOLD), gap: null };
      this.polls.add(poll);
      member.polls++;
      if (this.ended || this.hasNews(poll)) this.soon(poll);
    });
  }

  // the waiting polls answered with ended, at a stop of the edit command
  end(): void {
    this.ended = true;
    clearInterval(this.sweeper);
    for (const poll of [...this.polls]) this.answer(poll);
  }

  private revive(client: string): Member | null {
    let member = this.members.get(client);
    const known = this.known.get(client);
    if (!member && known && this.members.size < MAX_PEOPLE) {
      member = { client, ...known, state: null, lastSeen: Date.now(), seen: -1, lastAnswer: 0, polls: 0 };
      this.members.set(client, member);
      this.changed();
    }
    if (member) member.lastSeen = Date.now();
    return member ?? null;
  }

  private changed(): void {
    this.rev++;
    this.wake();
  }

  private hasNews(poll: Poll): boolean {
    const member = this.members.get(poll.client);
    const at = this.authority.reach(poll.since);
    return at === null || at < this.authority.n || !member || member.seen < this.rev;
  }

  private wake(): void {
    for (const poll of this.polls) if (this.hasNews(poll)) this.soon(poll);
  }

  // the poll answered now, or once GAP ms have passed since the last answer to its browser
  private soon(poll: Poll): void {
    if (poll.gap) return;
    const member = this.members.get(poll.client);
    const wait = this.ended || !member ? 0 : Math.max(0, member.lastAnswer + GAP - Date.now());
    poll.gap = setTimeout(() => this.answer(poll), wait);
  }

  private answer(poll: Poll): void {
    if (!this.polls.delete(poll)) return;
    clearTimeout(poll.hold);
    if (poll.gap) clearTimeout(poll.gap);
    const member = this.members.get(poll.client);
    if (member) {
      member.seen = this.rev;
      member.lastAnswer = Date.now();
      member.lastSeen = Date.now();
      member.polls--;
    }
    const presence: Presence[] = [...this.members.values()].map(({ client, name, color, state }) => ({ client, name, color, state }));
    const answer: EventsAnswer = { v: this.authority.version, ops: this.authority.since(poll.since), presence, people: this.list() };
    if (this.ended) answer.ended = true;
    poll.done(answer);
  }

  private sweep(): void {
    const now = Date.now();
    let gone = false;
    for (const [client, member] of this.members) {
      if (member.polls === 0 && now - member.lastSeen > GONE) {
        this.members.delete(client);
        gone = true;
      }
    }
    if (gone) this.changed();
  }
}
