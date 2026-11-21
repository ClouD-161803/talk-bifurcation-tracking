import type { AppliedOp, Patch, Version } from '../protocol.ts';
import { parseVersion } from '../protocol.ts';
import { apply, diff } from '../patch.ts';
import type { Caret } from '../../editor/session/presence.ts';
import type { Client } from './client.ts';

export type PresenceState = {
  v: Version;
  slide: number | null;
  selected: number[];
  caret: (Omit<Caret, 'el'> & { el: number }) | null;
  typing: boolean;
  active: boolean;
  following: string | null;
  mode: 'edit' | 'present' | 'history';
  away: boolean;
  sheet: 'preamble' | 'bibliography' | null;
};

export type Resolved = Omit<PresenceState, 'slide' | 'selected' | 'caret'> & {
  client: string;
  person: string;
  name: string;
  color: number;
  slide: Element | null;
  selected: Element[];
  caret: Caret | null;
};

const THROTTLE = 200;
const REST = 200;
const TYPING = 2000;
const HIDING = 1000;
const IDLE = 30000;
const LOG = 256;
const SLIDE = 4096;
const BEHIND = 64;
const MAX_SELECTED = 500;
const NEAR = 12;

type Carried = { lo: number; hi: number; delta: number };

function trim(a: string, p: Patch): Patch {
  let i = 0;
  while (p.start + i < p.end && i < p.text.length && a.charCodeAt(p.start + i) === p.text.charCodeAt(i)) i++;
  let j = 0;
  while (p.end - j > p.start + i && p.text.length - j > i && a.charCodeAt(p.end - 1 - j) === p.text.charCodeAt(p.text.length - 1 - j)) j++;
  return { start: p.start + i, end: p.end - j, text: p.text.slice(i, p.text.length - j) };
}

function slide(a: string, p: Patch): [number, number] {
  const t = p.start === p.end ? p.text : p.text ? '' : a.slice(p.start, p.end);
  if (!t) return [0, 0];
  let l = 0;
  while (l < SLIDE && p.start - 1 - l >= 0 && a.charCodeAt(p.start - 1 - l) === t.charCodeAt(t.length - 1 - (l % t.length))) l++;
  let r = 0;
  while (r < SLIDE && p.end + r < a.length && a.charCodeAt(p.end + r) === t.charCodeAt(r % t.length)) r++;
  return [l, r];
}

const NAME = /[\w-]/;

function renamed(a: string, p: Patch): number {
  if (!NAME.test(p.text[0] ?? '') && !(p.end > p.start && NAME.test(a[p.start]))) return -1;
  let i = p.start;
  while (i > 0 && p.start - i < 64 && NAME.test(a[i - 1])) i--;
  return a[i - 1] === '<' ? i - 1 : -1;
}

export function carried(a: string, patches: readonly Patch[]): Carried[] {
  const out: Carried[] = [];
  for (const raw of patches) {
    const p = trim(a, raw);
    if (p.start === p.end && !p.text) continue;
    const [l, r] = slide(a, p);
    const tag = renamed(a, p);
    out.push({ lo: tag < 0 ? p.start - l : Math.min(tag, p.start - l), hi: p.end + r, delta: p.text.length - (p.end - p.start) });
  }
  return out;
}

export function carry(o: number, changes: readonly Carried[]): number | null {
  let delta = 0;
  for (const c of changes) {
    if (o >= c.hi) delta += c.delta;
    else if (o >= c.lo) return null;
  }
  return o + delta;
}

class Log {
  private epoch = '';
  private n = -1;
  private text: string | null = null;
  private steps: { n: number; changes: Carried[] }[] = [];
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

  behind(v: Version): boolean {
    const at = parseVersion(v);
    return !!at && (at.epoch !== this.epoch || at.n > this.n);
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

type Other = {
  raw: string;
  key: string;
  state: PresenceState;
  activeAt: number;
  typedAt: number;
  resolved: Resolved | null;
  resolvedKey: string;
  ahead: boolean;
};

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

function parseState(raw: unknown): PresenceState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.v !== 'string' || !parseVersion(s.v)) return null;
  const caret = s.caret as { el?: unknown; at?: unknown; from?: unknown; pre?: unknown; post?: unknown } | null;
  const near = (t: unknown, end: boolean): string => (typeof t !== 'string' ? '' : end ? t.slice(Math.max(0, t.length - NEAR)) : t.slice(0, NEAR));
  const mode = s.mode === 'present' || s.mode === 'history' ? s.mode : 'edit';
  return {
    v: s.v,
    slide: isInt(s.slide) ? s.slide : null,
    selected: Array.isArray(s.selected) ? s.selected.filter(isInt).slice(0, MAX_SELECTED) : [],
    caret: caret && typeof caret === 'object' && isInt(caret.el) && isInt(caret.at) ? { el: caret.el, at: caret.at, from: isInt(caret.from) ? caret.from : caret.at, pre: near(caret.pre, true), post: near(caret.post, false) } : null,
    typing: s.typing === true,
    active: s.active === true,
    following: typeof s.following === 'string' ? s.following : null,
    mode,
    away: s.away === true,
    sheet: s.sheet === 'preamble' || s.sheet === 'bibliography' ? s.sheet : null,
  };
}

const keyOf = (s: PresenceState): string => JSON.stringify([s.v, s.slide, s.selected, s.caret?.el ?? null]);

export class Presence {
  readonly client: Client;
  skew = 0;
  private readonly log = new Log();
  private readonly changes = new Changes();
  private readonly others = new Map<string, Other>();
  private list: Resolved[] = [];

  private fields: { following: string | null; mode: PresenceState['mode'] } = { following: null, mode: 'edit' };
  private sentKey: string | null = null;
  private sentV: { epoch: string; n: number } | null = null;
  private sent: PresenceState | null = null;
  private sentAt = 0;
  private lastSelected: Element[] = [];
  private lastSlide: Element | null = null;
  private timer = 0;
  private restTimer = 0;
  private typingTimer = 0;
  private typedAt = -Infinity;
  private idleTimer = 0;
  private activeAt = -Infinity;
  private caretHost: Element | null = null;
  private selection: Omit<Caret, 'el'> = { at: 0, from: 0, pre: '', post: '' };
  private refreshed: { source: string | null; edits: number } | null = null;
  private edits = 0;
  private refreshing = false;
  private seen = new Set<string>();
  private arrived = false;

  constructor(client: Client) {
    this.client = client;
    const { app } = client;
    client.resolved = () => this.list;
    app.listen('sheet', () => this.due(true));
    client.on('ops', (ops) => {
      if (!this.log.seeded) this.seedLog();
      this.log.add(ops);
    });
    client.on('presence', () => this.hear());
    const based = () => {
      if (!this.log.seeded || (client.base && this.log.behind(client.base.v))) this.seedLog();
      this.reread();
      this.due(false);
    };
    client.on('applied', based);
    client.port.onChange(() => this.edits++);
    client.on('settled', (moved) => {
      if (moved) based();
      if (!this.arrived) return;
      this.arrived = false;
      this.sentKey = null;
      this.due(true);
    });
    client.on('people', () => {
      const ids = new Set(client.people.map((p) => p.client));
      if ([...ids].some((id) => id !== client.client && !this.seen.has(id))) this.arrived = true;
      this.seen = ids;
    });
    let online = false;
    let joined = false;
    client.on('state', () => {
      const was = online;
      online = client.connection === 'online';
      if (!online || was) return;
      if (joined) {
        this.sentKey = null;
        this.due(true);
      } else {
        if (!this.log.seeded) this.seedLog();
        this.due(true);
      }
      joined = true;
    });
    client.on('ended', () => {
      this.others.clear();
      this.caretHost = null;
      clearTimeout(this.timer);
      clearTimeout(this.restTimer);
      clearTimeout(this.typingTimer);
      clearTimeout(this.idleTimer);
      this.timer = this.restTimer = this.typingTimer = this.idleTimer = 0;
      this.publish();
    });
    app.selection.listen(() => queueMicrotask(() => this.moved()));
    app.listen('slide', () => this.due(true));
    document.addEventListener('selectionchange', () => this.moved());
    let hiding = 0;
    document.addEventListener('visibilitychange', () => {
      clearTimeout(hiding);
      if (document.visibilityState === 'hidden') hiding = window.setTimeout(() => this.due(true), HIDING);
      else this.due(true);
    });
    document.addEventListener('input', (ev) => {
      if (!app.hostOf(ev.target)) return;
      this.typed();
    }, true);
  }

  now(): number {
    return performance.now() + this.skew;
  }

  resolved(): Resolved[] {
    return this.list;
  }

  get holds(): ReadonlyMap<Element, Resolved> {
    const t = this.now();
    const holds = new Map<Element, Resolved>();
    for (const o of this.others.values()) {
      const el = o.resolved?.caret?.el;
      if (el?.isConnected && t - o.activeAt < IDLE && !holds.has(el)) holds.set(el, o.resolved!);
    }
    return holds;
  }

  holderOf(el: Element, containing = true): Resolved | null {
    for (const [at, by] of this.holds) if (at.contains(el) || (containing && el.contains(at))) return by;
    return null;
  }

  set(fields: Partial<{ following: string | null; mode: PresenceState['mode'] }>): void {
    Object.assign(this.fields, fields);
    this.moved();
    this.due(true);
  }

  private seedLog(): void {
    const base = this.client.base;
    if (base) this.log.seed(base.text, base.v);
  }

  private moved(): void {
    if (this.client.ended) return;
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
      if (host && host !== this.caretHost) this.active();
      this.caretHost = host;
      this.due(true);
    } else if (host) this.restTimer = window.setTimeout(() => this.due(true), REST);
  }

  private typed(): void {
    if (this.client.ended) return;
    const t = this.now();
    const was = t - this.typedAt < TYPING;
    this.typedAt = t;
    this.active();
    clearTimeout(this.typingTimer);
    this.typingTimer = window.setTimeout(() => this.due(true), TYPING);
    this.due(!was);
  }

  private active(): void {
    this.activeAt = this.now();
    clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => this.due(true), IDLE);
  }

  private due(now: boolean): void {
    if (this.client.ended) return;
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

  private send(): void {
    if (this.client.gone || this.client.connection !== 'online') return;
    const state = this.build();
    if (!state) return;
    const v = parseVersion(state.v)!;
    const key = JSON.stringify({ ...state, v: '' });
    const was = this.sentV;
    const carried = (o: number | null): boolean => o === null || (!!was && this.log.carry(o, was, v.n) === o);
    const last = this.sent;
    if (key === this.sentKey && was && was.epoch === v.epoch && v.n - was.n < BEHIND && last && [last.slide, ...last.selected, last.caret?.el ?? null].every(carried)) return;
    this.sentKey = key;
    this.sentV = v;
    this.sent = state;
    this.sentAt = this.now();
    this.client.sendPresence(state);
  }

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
    if (host) this.selection = shell.presence.selectionIn(host) ?? this.selection;
    const caretEl = offset(host);
    const typing = this.now() - this.typedAt < TYPING && !!host;
    return {
      v: base.v,
      slide: offset(app.current()),
      selected: this.selectedNow().map(offset).filter((o): o is number => o !== null),
      caret: caretEl === null ? null : { el: caretEl, ...this.selection },
      typing,
      active: this.now() - this.activeAt < IDLE,
      following: this.fields.following,
      mode: this.fields.mode,
      away: document.visibilityState === 'hidden',
      sheet: shell.presence.sheet()?.which ?? null,
    };
  }

  private refresh(): void {
    const { client } = this;
    const now = () => ({ source: client.shell.presence.source(), edits: this.edits });
    const at = now();
    if (this.refreshing || (this.refreshed?.source === at.source && this.refreshed.edits === at.edits)) return;
    this.refreshing = true;
    void client.port.rebase().catch(() => {}).then(() => {
      this.refreshing = false;
      this.refreshed = now();
      this.reread(true);
      this.due(true);
    });
  }

  private hear(): void {
    const { client } = this;
    if (client.ended) return;
    const t = this.now();
    const present = new Set<string>();
    let changed = false;
    let lost = false;
    const mine = new Set(client.people.filter((p) => p.person === client.person).map((p) => p.client));
    for (const p of client.presence) {
      if (p.client === client.client) {
        lost = p.state === null && !!this.sent;
        continue;
      }
      if (mine.has(p.client)) continue;
      const state = parseState(p.state);
      if (!state) continue;
      present.add(p.client);
      const raw = JSON.stringify(state);
      let o = this.others.get(p.client);
      if (o && o.raw === raw && o.resolved?.name === p.name && o.resolved?.color === p.color) continue;
      const known = !!o;
      if (!o) {
        o = { raw, key: '', state, activeAt: state.active || state.typing ? t : -Infinity, typedAt: -Infinity, resolved: null, resolvedKey: '', ahead: false };
        this.others.set(p.client, o);
      }
      if (state.typing || (o.state.typing && state.active)) o.typedAt = o.activeAt = t;
      const caretBefore = o.resolved?.caret?.el ?? null;
      o.raw = raw;
      o.state = state;
      this.resolve(o, p.client, p.name, p.color);
      if (known && (o.resolved?.caret?.el ?? null) !== caretBefore) o.activeAt = t;
      if (!state.active && !state.typing) o.activeAt = o.typedAt;
      changed = true;
    }
    for (const id of [...this.others.keys()]) {
      if (present.has(id)) continue;
      this.others.delete(id);
      changed = true;
    }
    if (changed) this.publish();
    if (!lost) return;
    this.sentKey = null;
    this.due(true);
  }

  private reread(all = false): void {
    let changed = false;
    for (const [id, o] of this.others) {
      const r = o.resolved;
      const gone = !!r && (r.selected.some((el) => !el.isConnected) || (r.slide && !r.slide.isConnected) || (r.caret && !r.caret.el.isConnected));
      if (!all && !gone && !o.ahead) continue;
      this.resolve(o, id, r?.name ?? '', r?.color ?? 0);
      if (!r?.caret && o.resolved?.caret && (o.state.active || o.state.typing)) o.activeAt = this.now();
      changed = true;
    }
    if (changed) this.publish();
  }

  private resolve(o: Other, id: string, name: string, color: number): void {
    const { client } = this;
    const s = o.state;
    const key = keyOf(s);
    o.key = key;
    const offsets = [s.slide, s.caret?.el ?? null, ...s.selected];
    const els = this.read(offsets, s.v);
    o.ahead = els === 'ahead';
    const prev = o.resolvedKey === key || o.ahead || els === null ? o.resolved : null;
    if (!o.ahead) o.resolvedKey = key;
    if (o.ahead && prev) {
      o.resolved = { ...prev, name, color, typing: s.typing, active: s.active, following: s.following, mode: s.mode, away: s.away, sheet: s.sheet };
      return;
    }
    const at = (i: number, before: Element | null | undefined): Element | null => {
      const el = els === 'ahead' || els === null ? null : els[i];
      if (el) return el;
      return before?.isConnected ? before : null;
    };
    const selected: Element[] = [];
    s.selected.forEach((_, i) => {
      const el = at(2 + i, prev?.selected[i]);
      if (el && !selected.includes(el)) selected.push(el);
    });
    const caretEl = at(1, prev?.caret?.el);
    o.resolved = {
      client: id,
      person: client.people.find((p) => p.client === id)?.person ?? '',
      name,
      color,
      v: s.v,
      slide: at(0, prev?.slide),
      selected,
      caret: caretEl && s.caret ? { ...s.caret, el: caretEl } : null,
      typing: s.typing,
      active: s.active,
      following: s.following,
      mode: s.mode,
      away: s.away,
      sheet: s.sheet,
    };
  }

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
    const ups = offsets.map((o) => (o === null ? null : this.log.carry(o, from, to.n) ?? null));
    const mapped = ups.map((up) => (up === null ? null : carry(up, changes)));
    const found = client.shell.presence.elementsAt(mapped.map((m) => m ?? -1));
    const els = found.map((el, i) => (mapped[i] === null ? null : el));
    if (source !== base.text && ups.some((up, i) => up !== null && !els[i])) this.refresh();
    return els;
  }

  private publish(): void {
    this.list = [...this.others.values()].map((o) => o.resolved).filter((r): r is Resolved => !!r);
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
