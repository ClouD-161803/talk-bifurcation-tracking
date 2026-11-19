// the people of a session, their presence, and the long polls of events. a poll is answered at
// once when there is news for its browser, and held for at most 25 s otherwise. a browser is
// answered at most ten times a second, hence the news of a burst of operations is batched. every
// person who ever joined is kept in .session/people.json, so that a name keeps its tone and its id

import { randomBytes } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import type { Authority } from '../session/authority.ts';
import { cleanPersonName, COLORS, isPersonId, isToken, nameKey, type Ended, type EventsAnswer, type KnownPerson, type Person, type Presence, type WriteError } from '../session/protocol.ts';
import { renameRetried, renameRetriedSync } from './disk.ts';

// the hold of a poll, and the time after the last request of a page at which it is dropped, both
// in ms and shorter in the tests
const HOLD = Number(process.env.SLIDES_POLL_HOLD_MS) || 25_000;
const GAP = 100;
const GONE = Number(process.env.SLIDES_GONE_MS) || 40_000;
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

// the revs of the feeds that a page has had, in the order of the feeds, or -1 when it may have
// missed news, e.g. after it was dropped for a silence
type Member = Person & { state: unknown; lastSeen: number; joined: number; polled: boolean; seen: number; knownSeen: number; writeSeen: number; feeds: number[]; lastAnswer: number; polls: number };

// a source of news for the answers of events beside the operations and the people, e.g. the
// version history. rev grows with each change, and write adds to an answer the news after the rev
// that the page has had, which is -1 when it may have missed news, or after the version since of
// its poll. of is the rev of a feed that differs between people, given instead of rev for the pages
// of person
export type Feed = { rev: () => number; of?: (person: string) => number; write: (answer: EventsAnswer, seen: number, since: string, person: string) => void };
const revOf = (f: Feed, person: string) => (f.of ? f.of(person) : f.rev());

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
  // from a sleep keeps its person, and whether the page said bye since
  private clients = new Map<string, { person: string; host: boolean; token: string; left?: true }>();
  // the client id of each token
  private tokens = new Map<string, string>();
  private records = new Map<string, PersonRecord>();
  // the pages whose session ended, answered with ended until they say hello again
  private ends = new Map<string, Ended>();
  // the guests present at the last end of sharing that have not been answered with ended yet, and
  // the callers that wait until none is left
  private untold = new Set<string>();
  private toldWaiters: (() => void)[] = [];
  private hostPerson: string | null = null;
  private polls = new Set<Poll>();
  private feedList: Feed[] = [];
  private rev = 0;
  private knownRev = 0;
  // the write of index.html that failed last, or null once a write succeeded, and its revision
  private writeError: WriteError | null = null;
  private writeRev = 0;
  // the message of the write of tex.js that failed last, or null once a write succeeded
  private texError: string | null = null;
  // the changes of tex.js on disk, by the edit command or by another program, counted from the time
  // of the start in ms, which a later run does not repeat
  private texRev = Date.now();
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
      // the page dropped for a new one is of the same kind, and a page of the host is dropped only
      // for another page of the host, since person ids are public
      const pages = [...this.members.values()].filter((m) => m.person === person);
      const dropped = pages.length < MAX_PAGES ? undefined : (pages.find((m) => m.host === host) ?? (host ? pages[0] : undefined));
      if (pages.length >= MAX_PAGES && !dropped) return { full: true };
      if (!this.hasPlace(host, dropped)) return { full: true };
      if (dropped) this.members.delete(dropped.client);
    }
    const now = Date.now();
    let record = this.records.get(person);
    if (!record) {
      record = { person, name, color: this.freeColor(), first: now, last: now };
      this.records.set(person, record);
      this.trimRecords();
      this.knownRev++;
    } else {
      // a claim keeps the name as the person wrote it first, and so does a page that only knows the
      // public person id, i.e. a page through the relay without a token of a page of this person
      const own = host || (earlier !== undefined && this.clients.get(earlier)?.person === person);
      if (record.name !== name && !claim && own) {
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
    // a page reads the feeds again after a hello, hence it is sent only what changes later
    const fields = { person, name: record.name, color: record.color, host, lastSeen: now, joined: now, seen: -1, knownSeen: this.knownRev, writeSeen: 0, feeds: this.feedList.map((f) => revOf(f, person)) };
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

  // whether the page client is in the session, i.e. said hello and neither left nor was dropped
  present(client: string): boolean {
    return this.members.has(client);
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

  // the token of a closed page forgotten, hence a later request of it is one of an unknown token
  retire(token: string): void {
    this.tokens.delete(token);
  }

  // the page left, and a request of it that arrives later does not bring it back, only a hello
  bye(client: string): void {
    const known = this.clients.get(client);
    if (known) known.left = true;
    if (this.members.delete(client)) this.changed();
  }

  // a source of news for every page from now on
  feed(f: Feed): void {
    this.feedList.push(f);
    for (const m of this.members.values()) m.feeds.push(revOf(f, m.person));
  }

  // the waiting polls woken after a change of a feed
  news(): void {
    this.wake();
  }

  // a long poll of client for the news after the version since
  events(client: string, since: string): Promise<EventsAnswer> | null {
    const end = this.ends.get(client);
    if (end) {
      this.told(client);
      return Promise.resolve({ ...this.state(since, null), ended: end });
    }
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

  // a write of index.html that failed, or null at the first write that succeeds after it, told to
  // every page when it changed
  writeFailed(error: WriteError | null): void {
    if (JSON.stringify(error) === JSON.stringify(this.writeError)) return;
    this.writeError = error && { message: error.message, unwritten: error.unwritten };
    this.writeRev++;
    this.changed();
  }

  // a write of tex.js that failed, or null once a derivation does not fail, told to every page as a
  // write of index.html that failed is, when no write of index.html failed
  texFailed(message: string | null): void {
    if (message === this.texError) return;
    this.texError = message;
    this.writeRev++;
    this.changed();
  }

  // tex.js changed on disk, told to every page, which draws the deck again with it
  texChanged(): void {
    this.texRev++;
    this.changed();
  }

  // the number of changes of tex.js on disk, for the answer of hello
  tex(): number {
    return this.texRev;
  }

  // the waiting polls answered with ended, at a stop of the edit command, and people.json written.
  // resolves once every page of the host present has been answered with ended, by a waiting poll or
  // by a poll that arrives later. a guest is told by the record of the end at the relay
  end(): Promise<void> {
    this.ended = this.endedBy();
    clearInterval(this.sweeper);
    for (const m of this.members.values()) if (m.host) this.untold.add(m.client);
    const told = new Promise<void>((done) => this.toldWaiters.push(done));
    for (const poll of [...this.polls]) this.answer(poll);
    this.told(null);
    this.saveSync();
    return told;
  }

  // the session ended for every page that came through the relay. their waiting polls are
  // answered with ended, while the pages of the host go on. resolves once every guest present has
  // been answered with ended, by a waiting poll or by a poll that arrives later
  endGuests(): Promise<void> {
    const end = this.endedBy();
    this.untold = new Set([...this.members.values()].filter((m) => !m.host).map((m) => m.client));
    const told = new Promise<void>((done) => this.toldWaiters.push(done));
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
    this.told(null);
    return told;
  }

  private told(client: string | null): void {
    if (client !== null) this.untold.delete(client);
    if (!this.untold.size) for (const done of this.toldWaiters.splice(0)) done();
  }

  endedBy(): Ended {
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
    if (!member && known && !known.left && record && this.hasPlace(known.host) && pages < MAX_PAGES) {
      const { person, name, color } = record;
      const now = Date.now();
      member = { client, person, name, color, host: known.host, state: null, lastSeen: now, joined: now, polled: false, seen: -1, knownSeen: -1, writeSeen: 0, feeds: this.feedList.map(() => -1), lastAnswer: 0, polls: 0 };
      this.members.set(client, member);
      this.changed();
    }
    if (member) member.lastSeen = Date.now();
    return member ?? null;
  }

  // whether a page of the kind of host has a place, once the page leaving is dropped
  private hasPlace(host: boolean, leaving?: Member): boolean {
    if (this.members.size - (leaving ? 1 : 0) >= MAX_PEOPLE) return false;
    return host || [...this.members.values()].filter((m) => !m.host && m !== leaving).length < MAX_GUESTS;
  }

  private changed(): void {
    this.rev++;
    this.wake();
  }

  private hasNews(poll: Poll): boolean {
    const member = this.members.get(poll.client);
    const at = this.authority.reach(poll.since);
    return at === null || at < this.authority.n || !member || member.seen < this.rev || this.feedList.some((f, i) => member.feeds[i] < revOf(f, member.person));
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
    const answer: EventsAnswer = { v: this.authority.version, ops: this.authority.since(since), presence, people: this.list(), tex: this.texRev };
    if (!member || member.knownSeen < this.knownRev) answer.known = this.known();
    if (this.writeRev && (!member || member.writeSeen < this.writeRev)) answer.writeError = this.writeError ?? (this.texError === null ? null : { message: this.texError, unwritten: 0, file: 'tex.js' });
    if (member) this.feedList.forEach((f, i) => member.feeds[i] < revOf(f, member.person) && f.write(answer, member.feeds[i], since, member.person));
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
      member.writeSeen = this.writeRev;
      member.feeds = this.feedList.map((f) => revOf(f, member.person));
      member.lastAnswer = Date.now();
      member.polls--;
    }
    const end = this.ended ?? this.ends.get(poll.client);
    if (end) {
      answer.ended = end;
      this.told(poll.client);
    }
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
