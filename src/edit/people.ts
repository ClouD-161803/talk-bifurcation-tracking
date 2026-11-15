// the people of a session, their presence, and the long polls of events. a poll is answered at
// once when there is news for its browser, and held for at most 25 s otherwise. a browser is
// answered at most ten times a second, hence the news of a burst of operations is batched. every
// person who ever joined is kept in .session/people.json, so that a name keeps its tone and its id

import { randomBytes } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import type { Authority } from '../session/authority.ts';
import { cleanPersonName, COLORS, isPersonId, isToken, nameKey, type Ended, type EventsAnswer, type KnownPerson, type Person, type Presence } from '../session/protocol.ts';
import { renameRetried, renameRetriedSync } from './disk.ts';

const HOLD = 25_000;
const GAP = 100;
const GONE = 40_000;
// a page that has not polled this long after its hello is dropped
const FIRST_POLL = 5000;
const MAX_PEOPLE = 64;
// the pages that come through the relay, hence MAX_PEOPLE - MAX_GUESTS places are kept for the pages
// of this computer
const MAX_GUESTS = 48;
// the pages of one person, beyond which the page that joined first is dropped
const MAX_PAGES = 8;
const MAX_CLIENTS = 1024;
const MAX_KNOWN = 1024;
const SAVE_GAP = 1000;
export const MAX_STATE = 8 * 1024;

// a person of people.json, with the times of the first and the last join in ms
export type PersonRecord = KnownPerson & { first: number; last: number };

type Member = Person & { state: unknown; lastSeen: number; joined: number; polled: boolean; seen: number; knownSeen: number; lastAnswer: number; polls: number };

type Poll = {
  client: string;
  since: string;
  done: (answer: EventsAnswer) => void;
  hold: ReturnType<typeof setTimeout>;
  gap: ReturnType<typeof setTimeout> | null;
};

export type Joined = { member: Member; token: string } | { taken: { name: string } } | { full: true } | { empty: true };

const newId = () => randomBytes(16).toString('base64url');

// the records of a people.json, without those that are malformed
function readPeople(file: string): PersonRecord[] {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(value)) return [];
    return value.filter(
      (r) => r && isPersonId(r.person) && cleanPersonName(r.name) && Number.isInteger(r.color) && r.color >= 0 && r.color < COLORS.length && Number.isFinite(r.first) && Number.isFinite(r.last),
    );
  } catch {
    return [];
  }
}

export class People {
  private authority: Authority;
  private file: string | null;
  private members = new Map<string, Member>();
  // the person, the kind, and the token of every page that said hello, so that a browser back
  // from a sleep keeps its person
  private clients = new Map<string, { person: string; host: boolean; token: string }>();
  // the client id of each token
  private tokens = new Map<string, string>();
  private records = new Map<string, PersonRecord>();
  // the pages whose session ended, answered with ended until they say hello again
  private ends = new Map<string, Ended>();
  private hostPerson: string | null = null;
  private polls = new Set<Poll>();
  private rev = 0;
  private knownRev = 0;
  private sweeper: ReturnType<typeof setInterval>;
  private ended: Ended | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private savedAt = 0;
  private dirty = false;
  private saving: Promise<void> | null = null;
  private log: (message: string) => void;

  // file is the people.json of the talk folder, or null to keep the people in memory alone
  constructor(authority: Authority, file: string | null = null, log: (message: string) => void = () => {}) {
    this.authority = authority;
    this.file = file;
    this.log = log;
    if (file) for (const r of readPeople(file)) this.records.set(r.person, r);
    authority.observe(() => this.wake());
    this.sweeper = setInterval(() => this.sweep(), 1000);
    this.sweeper.unref?.();
  }

  // a page joins as the person of the id, or as a new person. a name held by another person is
  // refused unless claim is true, and the page then continues as this person. the token of an
  // earlier hello keeps its client id
  hello(rawName: unknown, rawPerson: unknown, rawToken: unknown, host: boolean, claim = false): Joined {
    let person = isPersonId(rawPerson) ? rawPerson : newId();
    const name = cleanPersonName(rawName) || this.records.get(person)?.name || '';
    if (!name) return { empty: true };
    const holder = this.holderOf(name);
    if (holder && holder.person !== person) {
      if (!claim) return { taken: { name: holder.name } };
      person = holder.person;
    }
    const earlier = isToken(rawToken) ? this.tokens.get(rawToken) : undefined;
    const id = earlier ?? randomBytes(12).toString('base64url');
    const token = earlier ? (rawToken as string) : newId();
    if (!this.members.has(id)) {
      const pages = [...this.members.values()].filter((m) => m.person === person);
      if (pages.length >= MAX_PAGES) this.members.delete(pages[0].client);
      if (!this.hasPlace(host)) return { full: true };
    }
    const now = Date.now();
    let record = this.records.get(person);
    if (!record) {
      record = { person, name, color: this.freeColor(), first: now, last: now };
      this.records.set(person, record);
      this.trimRecords();
      this.knownRev++;
    } else {
      // a claim keeps the name as the person wrote it first
      if (record.name !== name && !claim) {
        record.name = name;
        this.knownRev++;
      }
      record.last = now;
    }
    this.save();
    if (host) this.hostPerson = person;
    this.ends.delete(id);
    this.clients.delete(id);
    this.clients.set(id, { person, host, token });
    this.tokens.set(token, id);
    if (this.clients.size > MAX_CLIENTS) {
      // the page used least lately that is not present, since revive moves a page to the end
      for (const [client, { token: old }] of this.clients) {
        if (this.members.has(client)) continue;
        this.clients.delete(client);
        this.tokens.delete(old);
        break;
      }
    }
    let member = this.members.get(id);
    const fields = { person, name: record.name, color: record.color, host, lastSeen: now, joined: now, seen: -1, knownSeen: this.knownRev };
    if (member) Object.assign(member, fields);
    else this.members.set(id, (member = { client: id, ...fields, polled: false, state: null, lastAnswer: 0, polls: 0 }));
    this.renamed(person);
    this.changed();
    return { member, token };
  }

  // a new name of the person of the page client, or null when the page did not say hello
  rename(client: string, rawName: unknown): { name: string } | { taken: { name: string } } | { empty: true } | null {
    const member = this.revive(client);
    if (!member) return null;
    const name = cleanPersonName(rawName);
    if (!name) return { empty: true };
    const holder = this.holderOf(name);
    if (holder && holder.person !== member.person) return { taken: { name: holder.name } };
    const record = this.records.get(member.person)!;
    if (record.name !== name) {
      record.name = name;
      this.knownRev++;
      this.save();
      this.renamed(member.person);
      this.changed();
    }
    return { name };
  }

  // the client id of the page of token, or null
  clientOf(token: unknown): string | null {
    return isToken(token) ? (this.tokens.get(token) ?? null) : null;
  }

  // the person id of a page that said hello, or null
  personOf(client: unknown): string | null {
    return typeof client === 'string' ? (this.clients.get(client)?.person ?? null) : null;
  }

  list(): Person[] {
    return [...this.members.values()].map(({ client, person, name, color, host }) => ({ client, person, name, color, host }));
  }

  known(): KnownPerson[] {
    return [...this.records.values()].map(({ person, name, color }) => ({ person, name, color }));
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
    const end = this.ends.get(client);
    if (end) return Promise.resolve({ ...this.state(since, null), ended: end });
    const member = this.revive(client);
    if (!member) return null;
    return new Promise((done) => {
      const poll: Poll = { client, since, done, hold: setTimeout(() => this.answer(poll), HOLD), gap: null };
      this.polls.add(poll);
      member.polls++;
      member.polled = true;
      if (this.ended || this.hasNews(poll)) this.soon(poll);
    });
  }

  // the waiting polls answered with ended, at a stop of the edit command, and people.json written
  end(): void {
    this.ended = this.endedBy();
    clearInterval(this.sweeper);
    for (const poll of [...this.polls]) this.answer(poll);
    this.saveSync();
  }

  // the session ended for every page that came through the relay. their waiting polls are
  // answered with ended, while the pages of the host go on
  endGuests(): void {
    const end = this.endedBy();
    for (const [client, { host }] of this.clients) if (!host) this.ends.set(client, end);
    for (const client of this.ends.keys()) if (this.ends.size > MAX_CLIENTS) this.ends.delete(client);
    for (const poll of [...this.polls]) if (this.ends.has(poll.client)) this.answer(poll);
    let gone = false;
    for (const [client, member] of this.members) {
      if (!member.host) {
        this.members.delete(client);
        gone = true;
      }
    }
    if (gone) this.changed();
  }

  private endedBy(): Ended {
    return { by: (this.hostPerson && this.records.get(this.hostPerson)?.name) || null };
  }

  private holderOf(name: string): PersonRecord | null {
    const key = nameKey(name);
    for (const r of this.records.values()) if (nameKey(r.name) === key) return r;
    return null;
  }

  // the tone that the fewest people now present hold, the lowest at a tie
  private freeColor(): number {
    const count = COLORS.map(() => 0);
    const present = new Set([...this.members.values()].map((m) => m.person));
    for (const person of present) {
      const color = this.records.get(person)?.color;
      if (color !== undefined) count[color]++;
    }
    return count.indexOf(Math.min(...count));
  }

  // the absent people who joined least lately dropped from a list over MAX_KNOWN
  private trimRecords(): void {
    if (this.records.size <= MAX_KNOWN) return;
    const present = new Set([...this.members.values()].map((m) => m.person));
    const absent = [...this.records.values()].filter((r) => !present.has(r.person)).sort((a, b) => a.last - b.last);
    for (const r of absent.slice(0, this.records.size - MAX_KNOWN)) this.records.delete(r.person);
  }

  private renamed(person: string): void {
    const record = this.records.get(person);
    if (record) for (const m of this.members.values()) if (m.person === person) m.name = record.name;
  }

  private revive(client: string): Member | null {
    let member = this.members.get(client);
    const known = this.clients.get(client);
    const record = known && this.records.get(known.person);
    const pages = known ? [...this.members.values()].filter((m) => m.person === known.person).length : 0;
    if (known) {
      this.clients.delete(client);
      this.clients.set(client, known);
    }
    if (!member && known && record && this.hasPlace(known.host) && pages < MAX_PAGES) {
      const { person, name, color } = record;
      const now = Date.now();
      member = { client, person, name, color, host: known.host, state: null, lastSeen: now, joined: now, polled: false, seen: -1, knownSeen: -1, lastAnswer: 0, polls: 0 };
      this.members.set(client, member);
      this.changed();
    }
    if (member) member.lastSeen = Date.now();
    return member ?? null;
  }

  private hasPlace(host: boolean): boolean {
    if (this.members.size >= MAX_PEOPLE) return false;
    return host || [...this.members.values()].filter((m) => !m.host).length < MAX_GUESTS;
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

  // known is left out when the page has had the list since its last change
  private state(since: string, member: Member | null): EventsAnswer {
    const presence: Presence[] = [...this.members.values()].map(({ client, name, color, state }) => ({ client, name, color, state }));
    const answer: EventsAnswer = { v: this.authority.version, ops: this.authority.since(since), presence, people: this.list() };
    if (!member || member.knownSeen < this.knownRev) answer.known = this.known();
    return answer;
  }

  private answer(poll: Poll): void {
    if (!this.polls.delete(poll)) return;
    clearTimeout(poll.hold);
    if (poll.gap) clearTimeout(poll.gap);
    const member = this.members.get(poll.client) ?? null;
    const answer = this.state(poll.since, member);
    if (member) {
      member.seen = this.rev;
      member.knownSeen = this.knownRev;
      member.lastAnswer = Date.now();
      member.lastSeen = Date.now();
      member.polls--;
    }
    const end = this.ended ?? this.ends.get(poll.client);
    if (end) answer.ended = end;
    poll.done(answer);
  }

  private sweep(): void {
    const now = Date.now();
    let gone = false;
    for (const [client, member] of this.members) {
      if (member.polls === 0 && (now - member.lastSeen > GONE || (!member.polled && now - member.joined > FIRST_POLL))) {
        this.members.delete(client);
        gone = true;
      }
    }
    if (gone) this.changed();
  }

  private json(): string {
    return `${JSON.stringify([...this.records.values()], null, 1)}\n`;
  }

  // people.json written by a temporary file and a rename, at most once a second
  private save(): void {
    if (!this.file) return;
    this.dirty = true;
    if (this.saveTimer || this.saving) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, Math.max(0, this.savedAt + SAVE_GAP - Date.now()));
    this.saveTimer.unref?.();
  }

  private async flush(): Promise<void> {
    if (!this.file || !this.dirty) return;
    this.dirty = false;
    this.savedAt = Date.now();
    const tmp = `${this.file}.${randomBytes(6).toString('hex')}.tmp`;
    this.saving = (async () => {
      try {
        await writeFile(tmp, this.json());
        await renameRetried(tmp, this.file!);
      } catch (e) {
        await unlink(tmp).catch(() => {});
        this.log(`could not write ${this.file}: ${(e as Error).message}`);
        this.dirty = true;
      }
    })();
    await this.saving;
    this.saving = null;
    if (this.dirty) this.save();
  }

  private saveSync(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    // a write in flight may not end before the exit, hence it is made again here
    if (!this.file || (!this.dirty && !this.saving)) return;
    this.dirty = false;
    const tmp = `${this.file}.${randomBytes(6).toString('hex')}.tmp`;
    try {
      writeFileSync(tmp, this.json());
      renameRetriedSync(tmp, this.file);
    } catch (e) {
      this.log(`could not write ${this.file}: ${(e as Error).message}`);
      try {
        unlinkSync(tmp);
      } catch {}
    }
  }
}
