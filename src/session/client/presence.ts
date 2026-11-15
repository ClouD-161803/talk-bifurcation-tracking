// the presence of each page of a session: its slide, its selected elements, its caret, and the
// text element that it holds, sent as offsets of the text of the authority at a version, and read
// back by every other page as its own elements, for layer.ts, the avatars, and the navigator. the
// floor rule, which lets one person at a time type in a text element, is decided here, and
// floor.ts refuses the actions on a held element.
//
// an offset is carried twice. the sender carries it from the source of its port, which offsetOf
// refers to, to the text of the authority at v. the receiver carries it through the operations
// after v that it received, and from the text of the authority to the source of its own port. an
// offset is in doubt when a change touches it, or when the change could slide onto it and leave
// the same text, e.g. a copy of an element put next to it. an offset in doubt is not read as an
// element, and the element read before is kept while it is in the page

import type { AppliedOp, Patch, Version } from '../protocol.ts';
import { parseVersion } from '../protocol.ts';
import { apply, diff } from '../patch.ts';
import type { Client } from './client.ts';

export type PresenceState = {
  v: Version;
  slide: number | null;
  selected: number[];
  caret: { el: number; at: number } | null;
  typing: boolean;
  following: string | null;
  mode: 'edit' | 'present' | 'history';
  held: number | null;
  // the page is hidden, e.g. in a tab behind another
  away: boolean;
  // counts the heartbeats of a hold, since the edit command relays a state without a time, and a
  // state sent again unchanged cannot be told from the last one
  beat: number;
};

export type Resolved = Omit<PresenceState, 'slide' | 'selected' | 'caret' | 'held'> & {
  client: string;
  person: string;
  name: string;
  color: number;
  slide: Element | null;
  selected: Element[];
  caret: { el: Element; at: number } | null;
  held: Element | null;
};

// in ms: the shortest gap between two states sent for a change of offsets alone, the rest of the
// caret before its offset is sent, and the time that typing stays true after a key
const THROTTLE = 200;
const REST = 200;
const TYPING = 2000;
// in ms, the time after which a hidden page is sent as away, since a page that closes is hidden
// just before or just after its bye, and a state that reaches the edit command after the bye
// brings the page back
const HIDING = 1000;
// in ms, the floor rule of UI.md section 3: the heartbeat of a hold, the silence after which a hold
// is lost, the time without typing after which another person may take the element, and the gap
// within which two claims count as made at the same time
const BEAT = 5000;
const STALE = 15000;
const IDLE = 30000;
const TIE = 3000;
// the operations kept for carrying an offset, and the farthest that a change is slid
const LOG = 256;
const SLIDE = 4096;
// a state is sent again with the newest version when the one sent is this many operations behind
const BEHIND = 64;
const MAX_SELECTED = 500;

// a change of the text, as it moves an offset: an offset at hi or after it moves by delta, an
// offset in lo to hi is in doubt, and one before lo stays
type Carried = { lo: number; hi: number; delta: number };

// patch with the characters that it keeps at its ends taken off, since diff widens to tokens
function trim(a: string, p: Patch): Patch {
  let i = 0;
  while (p.start + i < p.end && i < p.text.length && a.charCodeAt(p.start + i) === p.text.charCodeAt(i)) i++;
  let j = 0;
  while (p.end - j > p.start + i && p.text.length - j > i && a.charCodeAt(p.end - 1 - j) === p.text.charCodeAt(p.text.length - 1 - j)) j++;
  return { start: p.start + i, end: p.end - j, text: p.text.slice(i, p.text.length - j) };
}

// how far an insertion or a deletion can slide left and right in a with the same result
function slide(a: string, p: Patch): [number, number] {
  const t = p.start === p.end ? p.text : p.text ? '' : a.slice(p.start, p.end);
  if (!t) return [0, 0];
  let l = 0;
  while (l < SLIDE && p.start - 1 - l >= 0 && a.charCodeAt(p.start - 1 - l) === t.charCodeAt(t.length - 1 - (l % t.length))) l++;
  let r = 0;
  while (r < SLIDE && p.end + r < a.length && a.charCodeAt(p.end + r) === t.charCodeAt(r % t.length)) r++;
  return [l, r];
}

// patches of the text a, sorted, as they move offsets of a
export function carried(a: string, patches: readonly Patch[]): Carried[] {
  const out: Carried[] = [];
  for (const raw of patches) {
    const p = trim(a, raw);
    if (p.start === p.end && !p.text) continue;
    const [l, r] = slide(a, p);
    out.push({ lo: p.start - l, hi: p.end + r, delta: p.text.length - (p.end - p.start) });
  }
  return out;
}

// o carried through changes, or null when it is in doubt
export function carry(o: number, changes: readonly Carried[]): number | null {
  let delta = 0;
  for (const c of changes) {
    if (o >= c.hi) delta += c.delta;
    else if (o >= c.lo) return null;
  }
  return o + delta;
}

// the operations received since the log was seeded with the text of the authority at a version,
// each kept as it moves offsets. an operation that cannot follow the last one, e.g. after the
// whole text was read again, empties the log until it is seeded again
class Log {
  private epoch = '';
  private n = -1;
  private text: string | null = null;
  private steps: { n: number; changes: Carried[] }[] = [];
  // the operations received while the log could not take them, replayed at the next seed
  private waiting: AppliedOp[] = [];

  seed(text: string, v: Version): void {
    const at = parseVersion(v);
    if (!at) return;
    this.epoch = at.epoch;
    this.n = at.n;
    this.text = text;
    this.steps = [];
    const waiting = this.waiting.splice(0);
    this.add(waiting.filter((op) => {
      const o = parseVersion(op.v);
      return !!o && o.epoch === at.epoch && o.n > at.n;
    }));
  }

  get seeded(): boolean {
    return this.text !== null;
  }

  add(ops: AppliedOp[]): void {
    for (const op of ops) {
      const at = parseVersion(op.v);
      if (!at) continue;
      if (this.text === null || at.epoch !== this.epoch || at.n !== this.n + 1) {
        if (this.text !== null && at.epoch === this.epoch && at.n <= this.n) continue;
        this.text = null;
        this.waiting.push(op);
        if (this.waiting.length > LOG) this.waiting.splice(0, this.waiting.length - LOG);
        continue;
      }
      this.steps.push({ n: at.n, changes: carried(this.text, op.patches) });
      if (this.steps.length > LOG) this.steps.shift();
      this.text = apply(this.text, op.patches);
      this.n = at.n;
    }
  }

  // o of the text at version from carried to the text at n of the same epoch. null when o is in
  // doubt, and undefined when the log does not hold every operation between them
  carry(o: number, from: { epoch: string; n: number }, n: number): number | null | undefined {
    if (from.n === n) return o;
    if (from.epoch !== this.epoch || !this.steps.length) return undefined;
    const first = this.steps[0].n;
    if (from.n + 1 < first || n > this.steps[this.steps.length - 1].n) return undefined;
    let at: number | null = o;
    for (let i = from.n + 1 - first; i <= n - first && at !== null; i++) at = carry(at, this.steps[i].changes);
    return at;
  }
}

// the changes from one text to another, kept for the last pairs of texts asked for
class Changes {
  private cache: { a: string; b: string; changes: Carried[] }[] = [];

  of(a: string, b: string): Carried[] {
    if (a === b) return [];
    const hit = this.cache.find((c) => c.a === a && c.b === b);
    if (hit) return hit.changes;
    const changes = carried(a, diff(a, b));
    this.cache.unshift({ a, b, changes });
    this.cache.length = Math.min(this.cache.length, 4);
    return changes;
  }
}

// the state of another page as this page last heard it, with the times of this page at which it
// was heard, at which the page was last seen typing or began its hold, and at which it began it
type Other = {
  raw: string;
  // the offsets and their version, whose change reads the elements again
  key: string;
  state: PresenceState;
  heardAt: number;
  activeAt: number;
  holdAt: number;
  resolved: Resolved | null;
  // the key under which the elements of resolved were read, which an offset in doubt keeps
  resolvedKey: string;
  // the state is of a version that this page has not reached yet
  ahead: boolean;
};

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

function parseState(raw: unknown): PresenceState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.v !== 'string' || !parseVersion(s.v)) return null;
  const caret = s.caret as { el?: unknown; at?: unknown } | null;
  const mode = s.mode === 'present' || s.mode === 'history' ? s.mode : 'edit';
  return {
    v: s.v,
    slide: isInt(s.slide) ? s.slide : null,
    selected: Array.isArray(s.selected) ? s.selected.filter(isInt).slice(0, MAX_SELECTED) : [],
    caret: caret && typeof caret === 'object' && isInt(caret.el) && isInt(caret.at) ? { el: caret.el, at: caret.at } : null,
    typing: s.typing === true,
    following: typeof s.following === 'string' ? s.following : null,
    mode,
    held: isInt(s.held) ? s.held : null,
    beat: isInt(s.beat) ? s.beat : 0,
    away: s.away === true,
  };
}

const keyOf = (s: PresenceState): string => JSON.stringify([s.v, s.slide, s.selected, s.caret?.el ?? null, s.held]);

export class Presence {
  readonly client: Client;
  // added to Date.now(), e.g. by a test that moves the clock of the floor rule
  skew = 0;
  private readonly log = new Log();
  private readonly changes = new Changes();
  private readonly others = new Map<string, Other>();
  private list: Resolved[] = [];
  private locked = new Map<Element, Resolved>();
  private readonly lockListeners = new Set<(why: { yielded: Resolved | null; refused: Resolved | null }) => void>();

  // what this page sends
  private fields: { following: string | null; mode: PresenceState['mode'] } = { following: null, mode: 'edit' };
  private sentKey: string | null = null;
  private sentV: { epoch: string; n: number } | null = null;
  private sent: PresenceState | null = null;
  // back online, before an answer with the token of this page, which an edit command started again
  // does not know
  private unconfirmed = false;
  private sentAt = 0;
  private lastSelected: Element[] = [];
  private lastSlide: Element | null = null;
  private timer = 0;
  // set at pagehide, when the page says bye, after which it sends no state
  private left = false;
  private restTimer = 0;
  private typingTimer = 0;
  private typedAt = -Infinity;
  private caretHost: Element | null = null;
  private at = 0;
  private holding: Element | null = null;
  private holdAt = 0;
  private beat = 0;
  private beatAt = 0;
  private ticker = 0;
  // the source and the version of the base after the last time that the port read the deck into
  // its source for an offset, and whether it reads it now
  private refreshed: { source: string | null; v: Version | undefined } | null = null;
  private refreshing = false;
  private seen = new Set<string>();
  // a page joined since the end of the last drive
  private arrived = false;

  constructor(client: Client) {
    this.client = client;
    const { app } = client;
    client.resolved = () => this.list;
    client.on('ops', (ops) => {
      if (!this.log.seeded) this.seedLog();
      this.log.add(ops);
    });
    // an answer of a poll or of hello is made with a token that the edit command knows
    client.on('presence', () => {
      this.confirm();
      this.hear();
    });
    client.on('me', () => this.confirm());
    const based = () => {
      if (!this.log.seeded) this.seedLog();
      this.reread();
      this.due(false);
    };
    client.on('applied', based);
    // the base moved without an apply, e.g. at the broadcast of an operation of this page, which
    // can carry an offset that this operation put in doubt, or reach a state of another page
    client.on('settled', (moved) => {
      if (moved) based();
      if (!this.arrived) return;
      this.arrived = false;
      this.sentKey = null;
      this.due(true);
    });
    client.on('people', () => {
      // a page that joined cannot carry a state of a version before it, hence it is sent again
      // after the drive that takes the operations of the same answer
      const ids = new Set(client.people.map((p) => p.client));
      if ([...ids].some((id) => id !== client.client && !this.seen.has(id))) this.arrived = true;
      this.seen = ids;
    });
    // a page that is not online sends nothing. a page back online sends its state again after the
    // next answer with its token, since an edit command started again knows neither
    let online = false;
    let joined = false;
    client.on('state', () => {
      const was = online;
      online = client.connection === 'online';
      if (!online || was) return;
      if (joined) this.unconfirmed = true;
      else {
        // the log begins at the text of the join, since a state of another page may be of it, and
        // the answer of an operation of this page may move the base on before the poll that holds it
        if (!this.log.seeded) this.seedLog();
        this.due(true);
      }
      joined = true;
    });
    app.selection.listen(() => this.moved());
    app.listen('slide', () => this.due(true));
    document.addEventListener('selectionchange', () => this.moved());
    let hiding = 0;
    document.addEventListener('visibilitychange', () => {
      clearTimeout(hiding);
      if (document.visibilityState === 'hidden') hiding = window.setTimeout(() => this.due(true), HIDING);
      else this.due(true);
    });
    window.addEventListener('pagehide', () => (this.left = true));
    document.addEventListener('input', (ev) => {
      if (!app.hostOf(ev.target)) return;
      this.typed();
    }, true);
  }

  now(): number {
    return Date.now() + this.skew;
  }

  resolved(): Resolved[] {
    return this.list;
  }

  // the page that holds el against this page, while el is locked
  holder(el: Element): Resolved | null {
    return this.locked.get(el) ?? null;
  }

  // the page that holds a locked element that el is or lies in, or with containing, that el holds
  lockOf(el: Element, containing = true): Resolved | null {
    for (const [held, by] of this.locked) if (held.contains(el) || (containing && el.contains(held))) return by;
    return null;
  }

  get locks(): ReadonlyMap<Element, Resolved> {
    return this.locked;
  }

  // the text element that this page holds
  get held(): Element | null {
    return this.holding;
  }

  // called after the locks changed, with the page that this page yielded a text element to, or
  // that it lost a tie to
  onLocks(fn: (why: { yielded: Resolved | null; refused: Resolved | null }) => void): void {
    this.lockListeners.add(fn);
  }

  // e.g. by the part that follows a person
  set(fields: Partial<{ following: string | null; mode: PresenceState['mode'] }>): void {
    Object.assign(this.fields, fields);
    this.due(true);
  }

  // the deadlines of the floor rule taken now, e.g. by a test after it moved skew
  check(): void {
    const t = this.now();
    if (this.holding && t - this.beatAt >= BEAT) {
      this.beat++;
      this.beatAt = t;
      this.due(true);
    }
    this.floor();
  }

  private seedLog(): void {
    const base = this.client.base;
    if (base) this.log.seed(base.text, base.v);
  }

  // the caret or the selection of this page moved. a new caret element, selection, or slide is sent
  // at once, and the offset of the caret alone after it rests
  private moved(): void {
    const { app } = this.client;
    const node = getSelection()?.focusNode ?? null;
    const host = app.hostOf(node instanceof Element ? node : (node?.parentElement ?? null));
    const selected = this.selectedNow();
    const slide = app.current();
    const same = host === this.caretHost && slide === this.lastSlide && selected.length === this.lastSelected.length && selected.every((el, i) => el === this.lastSelected[i]);
    this.lastSelected = selected;
    this.lastSlide = slide;
    clearTimeout(this.restTimer);
    this.restTimer = 0;
    if (!same) {
      this.caretHost = host;
      this.hold(host);
      this.due(true);
    } else if (host) this.restTimer = window.setTimeout(() => this.due(true), REST);
  }

  private typed(): void {
    const t = this.now();
    const was = t - this.typedAt < TYPING;
    this.typedAt = t;
    clearTimeout(this.typingTimer);
    this.typingTimer = window.setTimeout(() => this.due(true), TYPING);
    this.due(!was);
  }

  // the hold of host begins, or the hold ends when host is null. a locked host is not held, since
  // floor.ts takes the caret out of it
  private hold(host: Element | null): void {
    if (host && this.locked.has(host)) host = null;
    if (host === this.holding) return;
    this.holding = host;
    const t = this.now();
    this.holdAt = t;
    this.beatAt = t;
    this.tick();
  }

  // a state is sent now, or for a change of offsets alone at most every THROTTLE ms
  private due(now: boolean): void {
    if (now) {
      clearTimeout(this.timer);
      this.timer = 0;
      this.send();
      return;
    }
    if (this.timer) return;
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      this.send();
    }, Math.max(0, THROTTLE - (this.now() - this.sentAt)));
  }

  private selectedNow(): Element[] {
    const sel = this.client.app.selection;
    return sel.kind === 'elements' || sel.kind === 'text' ? [...sel.items] : [];
  }

  // the state sent again at the first answer with the token of this page after it is back online
  private confirm(): void {
    if (!this.unconfirmed) return;
    this.unconfirmed = false;
    this.sentKey = null;
    this.due(true);
  }

  // a change of the version alone is not sent until the state is BEHIND operations behind, since
  // every other page carries the offsets through the operations after v. it is sent at once when
  // the log of this page puts an offset of the last state in doubt or does not reach v, since
  // another page could then not carry it either, e.g. in the copy of a duplicated slide
  private send(): void {
    if (this.left || this.client.connection !== 'online' || this.unconfirmed) return;
    const state = this.build();
    if (!state) return;
    const v = parseVersion(state.v)!;
    const key = JSON.stringify({ ...state, v: '' });
    const was = this.sentV;
    const carried = (o: number | null): boolean => o === null || (!!was && this.log.carry(o, was, v.n) === o);
    const last = this.sent;
    if (key === this.sentKey && was && was.epoch === v.epoch && v.n - was.n < BEHIND && last && [last.slide, ...last.selected, last.caret?.el ?? null, last.held].every(carried)) return;
    this.sentKey = key;
    this.sentV = v;
    this.sent = state;
    this.sentAt = this.now();
    this.client.sendPresence(state);
  }

  // the state of this page now, or null before the session began. an element made since the last
  // apply has no offset yet, and an edit of this page that is not in the source can put an offset
  // in doubt, e.g. a deletion before it. the port then reads the deck into its source
  private build(): PresenceState | null {
    const { client } = this;
    const { app, port, shell } = client;
    const base = client.base;
    const source = shell.presence.source();
    if (!base || source === null) return null;
    const changes = this.changes.of(source, base.text);
    const offset = (el: Element | null): number | null => {
      if (!el) return null;
      const o = port.offsetOf(el);
      const c = o === null ? null : carry(o, changes);
      if (c === null && el.isConnected && (o === null || source !== base.text)) this.refresh();
      return c;
    };
    const host = this.caretHost?.isConnected ? this.caretHost : null;
    if (host) this.at = shell.presence.caretIn(host) ?? this.at;
    const caretEl = offset(host);
    const typing = this.now() - this.typedAt < TYPING && !!host;
    return {
      v: base.v,
      slide: offset(app.current()),
      selected: this.selectedNow().map(offset).filter((o): o is number => o !== null),
      caret: caretEl === null ? null : { el: caretEl, at: this.at },
      typing,
      following: this.fields.following,
      mode: this.fields.mode,
      held: this.holding && this.holding === host ? caretEl : null,
      beat: this.beat,
      away: document.visibilityState === 'hidden',
    };
  }

  // the deck read into the source of the port, once for a source and a version of the base
  private refresh(): void {
    const { client } = this;
    const now = () => ({ source: client.shell.presence.source(), v: client.base?.v });
    const at = now();
    if (this.refreshing || (this.refreshed?.source === at.source && this.refreshed.v === at.v)) return;
    this.refreshing = true;
    void client.port.rebase().catch(() => {}).then(() => {
      this.refreshing = false;
      this.refreshed = now();
      this.due(true);
    });
  }

  // the states of the other pages after an answer of events
  private hear(): void {
    const { client } = this;
    const t = this.now();
    const present = new Set<string>();
    let changed = false;
    for (const p of client.presence) {
      if (p.client === client.client) continue;
      const state = parseState(p.state);
      if (!state) continue;
      present.add(p.client);
      const raw = JSON.stringify(state);
      let o = this.others.get(p.client);
      if (o && o.raw === raw && o.resolved?.name === p.name && o.resolved?.color === p.color) continue;
      if (!o) {
        o = { raw, key: '', state, heardAt: t, activeAt: t, holdAt: t, resolved: null, resolvedKey: '', ahead: false };
        this.others.set(p.client, o);
      }
      if (o.raw !== raw) o.heardAt = t;
      if (state.typing || o.state.typing) o.activeAt = t;
      const heldBefore = o.resolved?.held ?? null;
      o.raw = raw;
      o.state = state;
      this.resolve(o, p.client, p.name, p.color);
      // a hold begins when the page holds another element, or one after none
      if ((o.resolved?.held ?? null) !== heldBefore) {
        o.holdAt = t;
        o.activeAt = t;
      }
      changed = true;
    }
    for (const id of [...this.others.keys()]) {
      if (present.has(id)) continue;
      this.others.delete(id);
      changed = true;
    }
    if (changed) this.publish();
  }

  // the elements of every state read again after an apply: an element that left the page is read
  // from the offsets again, and a state of a version that this page had not reached is read now
  private reread(): void {
    let changed = false;
    for (const [id, o] of this.others) {
      const r = o.resolved;
      const gone = !!r && (r.selected.some((el) => !el.isConnected) || (r.slide && !r.slide.isConnected) || (r.caret && !r.caret.el.isConnected) || (r.held && !r.held.isConnected));
      if (!gone && !o.ahead) continue;
      this.resolve(o, id, r?.name ?? '', r?.color ?? 0);
      changed = true;
    }
    if (changed) this.publish();
  }

  // the elements of the state of o read, or kept from the last read under the same offsets for an
  // offset in doubt. a state of a version ahead of this page keeps the elements read before
  private resolve(o: Other, id: string, name: string, color: number): void {
    const { client } = this;
    const s = o.state;
    const key = keyOf(s);
    o.key = key;
    const offsets = [s.slide, s.held, s.caret?.el ?? null, ...s.selected];
    const els = this.read(offsets, s.v);
    o.ahead = els === 'ahead';
    const prev = o.resolvedKey === key || o.ahead ? o.resolved : null;
    if (!o.ahead) o.resolvedKey = key;
    if (o.ahead && prev) {
      o.resolved = { ...prev, name, color, typing: s.typing, following: s.following, mode: s.mode, beat: s.beat, away: s.away };
      return;
    }
    const at = (i: number, before: Element | null | undefined): Element | null => {
      const el = els === 'ahead' || els === null ? null : els[i];
      if (el) return el;
      return before?.isConnected ? before : null;
    };
    const selected: Element[] = [];
    s.selected.forEach((_, i) => {
      const el = at(3 + i, prev?.selected[i]);
      if (el && !selected.includes(el)) selected.push(el);
    });
    const caretEl = at(2, prev?.caret?.el);
    o.resolved = {
      client: id,
      person: client.people.find((p) => p.client === id)?.person ?? '',
      name,
      color,
      v: s.v,
      slide: at(0, prev?.slide),
      selected,
      caret: caretEl && s.caret ? { el: caretEl, at: s.caret.at } : null,
      typing: s.typing,
      following: s.following,
      mode: s.mode,
      held: at(1, prev?.held),
      beat: s.beat,
      away: s.away,
    };
  }

  // the elements of this page at offsets of the text of the authority at v, null for an offset in
  // doubt. 'ahead' when v is a version that this page has not reached, and null when the log does
  // not reach back to v
  private read(offsets: (number | null)[], v: Version): (Element | null)[] | 'ahead' | null {
    const { client } = this;
    const base = client.base;
    const source = client.shell.presence.source();
    const from = parseVersion(v);
    const to = base && parseVersion(base.v);
    if (!base || !from || !to || source === null || from.epoch !== to.epoch) return null;
    if (from.n > to.n) return 'ahead';
    if (from.n !== to.n && this.log.carry(0, from, to.n) === undefined) return null;
    const changes = this.changes.of(base.text, source);
    const mapped = offsets.map((o) => {
      if (o === null) return null;
      const up = this.log.carry(o, from, to.n);
      return up === null || up === undefined ? null : carry(up, changes);
    });
    const found = client.shell.presence.elementsAt(mapped.map((m) => m ?? -1));
    return found.map((el, i) => (mapped[i] === null ? null : el));
  }

  // the floor rule: the locks of this page, and whether it yields the text element that it holds
  private floor(): void {
    const t = this.now();
    const locked = new Map<Element, Resolved>();
    let yielded: Resolved | null = null;
    let refused: Resolved | null = null;
    const ids = [...this.others.keys()].sort();
    for (const id of ids) {
      const o = this.others.get(id)!;
      const r = o.resolved;
      if (!r?.held || !r.held.isConnected || t - o.heardAt >= STALE) continue;
      const theirIdle = t - o.activeAt >= IDLE;
      if (this.holding === r.held) {
        if (theirIdle) continue;
        const mine = Math.max(this.holdAt, this.typedAt);
        if (t - mine >= IDLE) yielded = r;
        else if (Math.abs(this.holdAt - o.holdAt) < TIE ? id < this.client.client : o.holdAt < this.holdAt) refused = r;
        else continue;
        locked.set(r.held, r);
      } else if (!theirIdle && !locked.has(r.held)) locked.set(r.held, r);
    }
    const before = this.locked;
    this.locked = locked;
    for (const el of before.keys()) if (!locked.has(el)) el.classList.remove('beeson-locked');
    for (const el of locked.keys()) el.classList.add('beeson-locked');
    if (yielded || refused) this.hold(null);
    const same = before.size === locked.size && [...locked].every(([el, r]) => before.get(el) === r);
    if (!same || yielded || refused) for (const fn of [...this.lockListeners]) fn({ yielded, refused });
    this.tick();
  }

  // the heartbeat and the deadlines run while a hold or a claim of another page is known
  private tick(): void {
    const needed = !!this.holding || [...this.others.values()].some((o) => o.resolved?.held);
    if (needed && !this.ticker) this.ticker = window.setInterval(() => this.check(), 1000);
    else if (!needed && this.ticker) {
      clearInterval(this.ticker);
      this.ticker = 0;
    }
  }

  private publish(): void {
    this.list = [...this.others.values()].map((o) => o.resolved).filter((r): r is Resolved => !!r);
    this.floor();
    this.client.emit('resolved');
  }
}

const controllers = new WeakMap<Client, Presence>();

export function presenceOf(client: Client): Presence | undefined {
  return controllers.get(client);
}

export function install(client: Client): void {
  controllers.set(client, new Presence(client));
}
