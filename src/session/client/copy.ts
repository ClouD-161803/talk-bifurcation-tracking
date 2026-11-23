import { changes, merge } from '../../editor/merge.ts';
import { apply, diff, mergePatches } from '../patch.ts';
import { parseVersion, type Token, type Version } from '../protocol.ts';
import type { Side } from '../replica.ts';
import type { Client } from './client.ts';
import { arm, ask } from './conflicts.ts';
import { style } from './dom.ts';

const DB = 'beeson-session';
const STORE = 'copies';
const EVERY = 2000;
const BEAT = 10_000;
const GONE = 60_000;
const OPEN_WAIT = 3000;
const OLD = 30 * 86_400_000;
const STASH = 'beeson-session-stash:';

type Kept = { path: string; blob: Blob };
type Row = { id: string; key: string; base: string; v: Version; mine: string; files: Kept[]; beat: number; made?: number; tokens?: Token[] };
export type Copy = { base: string; v: Version; mine: string };

type State = {
  id: string;
  unavailable: boolean;
  stored: boolean;
  kept: Copy | null;
  last: Copy | null;
  wroteAt: number;
  since: number | null;
  timer: number;
  soon: boolean;
  slides: { base: string; mine: string; numbers: number[] } | null;
  restored: number[] | null;
  note: string | null;
  early: (() => Copy | null) | null;
  taken: { files: Kept[]; made: number } | null;
  left: boolean;
  merging: boolean;
  made: number;
  madeOf: string | null;
  retire: Token[];
  dropping: Promise<unknown> | null;
  stashedAt: number;
};

const states = new WeakMap<Client, State>();

function pageId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const key = (): string => location.origin + location.pathname;
const lockOf = (id: string): string => `beeson-session-copy:${id}`;

type Locks = { request(name: string, fn: () => Promise<void>): Promise<void>; query(): Promise<{ held?: { name?: string }[] }> };
const locks = (): Locks | undefined => (navigator as { locks?: Locks }).locks;

let opened: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  opened ??= new Promise((done, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' }).createIndex('key', 'key');
    r.onsuccess = () => {
      r.result.onclose = () => (opened = null);
      done(r.result);
    };
    r.onerror = () => {
      opened = null;
      fail(r.error);
    };
  });
  return Promise.race([opened, new Promise<never>((_, fail) => setTimeout(() => fail(new Error('IndexedDB did not answer')), OPEN_WAIT))]);
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const t = (await db()).transaction(STORE, mode);
  const r = fn(t.objectStore(STORE));
  return new Promise((done, fail) => {
    t.oncomplete = () => done(r ? r.result : undefined);
    t.onerror = t.onabort = () => fail(t.error ?? new Error('the transaction was aborted'));
  });
}

type Stash = Omit<Row, 'mine' | 'files'> & { from: number; to: number; text: string };

function stashOf(row: Omit<Row, 'files'>): Stash {
  const { mine, ...rest } = row;
  const n = Math.min(row.base.length, mine.length);
  let from = 0;
  while (from < n && row.base.charCodeAt(from) === mine.charCodeAt(from)) from++;
  let end = 0;
  while (end < n - from && row.base.charCodeAt(row.base.length - 1 - end) === mine.charCodeAt(mine.length - 1 - end)) end++;
  return { ...rest, from, to: row.base.length - end, text: mine.slice(from, mine.length - end) };
}

function stashes(): Row[] {
  const rows: Row[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(STASH)) continue;
      const { from, to, text, ...row } = JSON.parse(localStorage.getItem(k) as string) as Stash;
      rows.push({ ...row, mine: row.base.slice(0, from) + text + row.base.slice(to), files: [] });
    }
  } catch {}
  return rows;
}

function unstash(id: string): void {
  try {
    localStorage.removeItem(STASH + id);
  } catch {}
}

async function goneOf(): Promise<(row: Row) => boolean> {
  const l = locks();
  if (l) {
    try {
      const held = new Set(((await l.query()).held ?? []).map((h) => h.name));
      return (row) => !held.has(lockOf(row.id));
    } catch {}
  }
  return (row) => Date.now() - row.beat > GONE;
}

async function deadRows(st: State): Promise<Row[]> {
  const rows = ((await run('readonly', (s) => s.index('key').getAll(key()))) ?? []) as Row[];
  const gone = await goneOf();
  return rows.filter((r) => r.id !== st.id && gone(r));
}

function combine(rows: Row[]): { copy: Copy; taken: Row[]; made: number } {
  const [first, ...rest] = [...rows].sort((a, b) => a.beat - b.beat);
  const copy: Copy = { base: first.base, v: first.v, mine: first.mine };
  const taken = [first];
  for (const r of rest) {
    const edits = changes(r.base, r.mine);
    const merged = edits && merge(r.base, edits, copy.mine, 'ours');
    if (!merged || merged.conflicts.length) continue;
    copy.mine = merged.text;
    taken.push(r);
  }
  return { copy, taken, made: Math.max(...taken.map((r) => r.made ?? r.beat)) };
}

function stateOf(client: Client): State {
  let st = states.get(client);
  if (!st) {
    st = { id: pageId(), unavailable: false, stored: false, kept: null, last: null, wroteAt: 0, since: null, timer: 0, soon: false, slides: null, restored: null, note: null, early: null, taken: null, left: false, merging: false, made: 0, madeOf: null, retire: [], dropping: null, stashedAt: 0 };
    states.set(client, st);
  }
  return st;
}

export const retiring = (client: Client): Token[] => stateOf(client).retire;

export function joined(client: Client): void {
  const st = stateOf(client);
  void run('readwrite', (s) => {
    const r = s.get(st.id);
    r.onsuccess = () => r.result && s.put({ ...r.result, tokens: [client.token] });
  }).catch(() => {});
}

const tokensOf = (client: Client, st: State): Token[] => (client.snapshot() ? [client.token] : st.retire);

export function beforeJoin(client: Client, fn: (() => Copy | null) | null): void {
  stateOf(client).early = fn;
}

export const early = (client: Client): boolean => !!states.get(client)?.early;

const current = (client: Client, st: State): Copy | null => client.snapshot() ?? st.early?.() ?? null;

const CSS = `dialog.beeson-session-earlier .row button { min-height: 32px; }`;

async function askEarlier(client: Client, copy: Copy, made: number): Promise<boolean> {
  style('earlier', CSS);
  const day = new Date(made).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const dialog = client.shell.dialog({
    title: 'Changes from an earlier session',
    text: `This browser kept your changes${client.shell.onSlides(client.shell.changedSlides(copy.base, copy.mine))} from ${day}, which were not sent. The deck was modified since then.`,
    className: 'beeson-session-earlier',
    dismissable: false,
    stay: ['download'],
    buttons: [
      { label: 'Download my version', title: 'Download the deck as it was with your changes', value: 'download' },
      { label: 'Discard them', title: 'Delete the changes kept in this browser', value: 'discard' },
      { label: 'Add my changes', title: 'Add your changes to the deck as it is now', value: 'add', primary: true },
    ],
    onButton: (value) => {
      if (value === 'download') client.shell.download(copy.mine);
    },
  });
  const value = await dialog.open('add');
  dialog.el.remove();
  return value !== 'discard';
}

export async function restore(client: Client): Promise<Copy | null> {
  const st = stateOf(client);
  const at = Date.now();
  const gone = await goneOf();
  let copy = null as Copy | null;
  let files: Kept[] = [];
  let made = 0;
  try {
    const stashed = stashes().filter((r) => r.id !== st.id && r.beat < at && gone(r));
    await run('readwrite', (s) => {
      const q = s.getAll();
      q.onsuccess = () => {
        const all = q.result as Row[];
        for (const r of stashed) {
          const i = all.findIndex((x) => x.id === r.id);
          if (i >= 0 && all[i].beat >= r.beat) continue;
          const row = { ...r, files: all[i]?.files ?? [] };
          if (i >= 0) all[i] = row;
          else all.push(row);
          s.put(row);
        }
        const dead = all.filter((r) => r.id !== st.id && r.beat < at && gone(r));
        const old = dead.filter((r) => Date.now() - (r.made ?? r.beat) > OLD);
        let named = new Set<Token>();
        const here = dead.filter((r) => {
          const more = new Set([...named, ...(r.tokens ?? [])]);
          if (r.key !== key() || old.includes(r) || more.size > 16) return false;
          named = more;
          return true;
        });
        let taken: Row[];
        ({ copy, taken, made } = here.length ? combine(here) : { copy: null, taken: [], made: 0 });
        st.left = here.length > taken.length;
        st.retire = [...named];
        files = taken.flatMap((r) => r.files ?? []);
        for (const r of [...old, ...taken]) s.delete(r.id);
        if (copy) s.put({ id: st.id, key: key(), ...copy, files, beat: Date.now(), made, tokens: st.retire } satisfies Row);
      };
    });
    st.kept = copy;
    for (const r of stashed) unstash(r.id);
  } catch {
    st.unavailable = true;
  }
  if (copy) st.stored = true;
  if (!copy) return null;
  st.last = copy;
  st.made = made;
  st.madeOf = copy.mine;
  st.taken = { files, made };
  st.restored = client.shell.changedSlides(copy.base, copy.mine);
  return copy;
}

export async function accept(client: Client, copy: Copy, text: string, v: Version): Promise<Copy | null> {
  const st = stateOf(client);
  const made = st.taken?.made ?? Date.now();
  if (parseVersion(copy.v)?.epoch !== parseVersion(v)?.epoch && text !== copy.base && !(await askEarlier(client, copy, made))) {
    st.taken = null;
    st.restored = null;
    st.stored = false;
    st.kept = null;
    st.last = null;
    void run('readwrite', (s) => s.delete(st.id)).catch(() => {});
    return null;
  }
  for (const f of st.taken?.files ?? []) client.shell.media.adopt(f.path, f.blob);
  st.taken = null;
  arm(client);
  return copy;
}

async function rest(client: Client, st: State, update: () => void): Promise<void> {
  st.left = false;
  st.merging = true;
  try {
    const dead = (await deadRows(st)).filter((r) => (r.tokens ?? []).every((t) => st.retire.includes(t)));
    if (!dead.length) return;
    const { copy, taken, made } = combine(dead);
    st.left = dead.length > taken.length;
    const s = client.snapshot();
    if (!s || client.ended || changes(copy.base, s.mine) === null) return;
    const files = taken.flatMap((r) => r.files ?? []);
    if (parseVersion(copy.v)?.epoch !== parseVersion(s.v)?.epoch && s.base !== copy.base && !(await askEarlier(client, copy, made))) {
      await run('readwrite', (store) => {
        for (const r of taken) store.delete(r.id);
      });
      return;
    }
    const ours = diff(copy.base, copy.mine);
    const into = (now: string, side: Side) => {
      const theirs = diff(copy.base, now).filter((t) => !ours.some((o) => o.start === t.start && o.end === t.end && o.text === t.text));
      const m = mergePatches(theirs, ours, side, copy.base, false, side);
      return { text: apply(copy.base, m.patches), conflicts: m.conflicts };
    };
    const side: Side = into(s.mine, 'ours').conflicts.length ? await ask(client, copy.base, copy.mine, s.mine) : 'ours';
    if (client.ended) return;
    for (const f of files) client.shell.media.adopt(f.path, f.blob);
    st.restored = client.shell.changedSlides(copy.base, copy.mine);
    const now = client.snapshot() ?? s;
    const mine = into(now.mine, side).text;
    client.rewrite((text) => into(text, side).text);
    st.stored = true;
    await run('readwrite', (store) => {
      for (const r of taken) store.delete(r.id);
      store.put({ id: st.id, key: key(), base: now.base, v: now.v, mine, files: client.shell.media.unsaved(mine).map((f) => ({ path: f.path, blob: f.blob })), beat: Date.now(), made, tokens: tokensOf(client, st) } satisfies Row);
    });
    update();
  } catch {} finally {
    st.merging = false;
  }
}

function waiting(client: Client, st: State, s: Copy): number[] {
  const c = st.slides;
  if (c && c.base === s.base && c.mine === s.mine) return c.numbers;
  const numbers = client.shell.changedSlides(s.base, s.mine);
  st.slides = { base: s.base, mine: s.mine, numbers };
  return numbers;
}

export function keptLine(client: Client): string | null {
  const st = states.get(client);
  if (!st || client.acked() || !current(client, st)) return null;
  if (st.unavailable) return 'Offline. Keep this page open, since your changes cannot be kept in this browser';
  if (!st.kept) return null;
  const numbers = waiting(client, st, st.kept);
  return `Offline. ${numbers.length ? `Changes${client.shell.onSlides(numbers)}` : 'Your changes'} are kept in this browser`;
}

export const keeps = (client: Client): boolean => {
  const st = stateOf(client);
  const s = current(client, st);
  return !s || (!st.unavailable && st.kept?.mine === s.mine && st.kept.v === s.v);
};

export function dropped(client: Client): Promise<unknown> {
  const d = states.get(client)?.dropping;
  return d ? Promise.race([d, new Promise((done) => setTimeout(done, OPEN_WAIT))]) : Promise.resolve();
}

export function restoredLine(client: Client): string | null {
  return states.get(client)?.note ?? null;
}

export function install(client: Client): void {
  const st = stateOf(client);
  let release = (): void => {};
  void locks()?.request(lockOf(st.id), () => new Promise<void>((done) => (release = done))).catch(() => {});

  let locked = false;
  void locks()?.query().then(() => (locked = true), () => {});

  const write = (now: boolean): void => {
    const s = current(client, st);
    if (!s || (!st.stored && s.mine === s.base)) return;
    const t = Date.now();
    const l = st.last;
    const same = !!l && l.base === s.base && l.v === s.v && l.mine === s.mine;
    if (same && t - st.wroteAt < BEAT) return;
    if (same && locked) {
      st.wroteAt = t;
      const again = (): void => {
        if (st.last !== l) return;
        st.last = null;
        write(true);
      };
      void run('readonly', (store) => store.getKey(st.id)).then((k) => k === undefined && again(), again);
      return;
    }
    if (!now && t - st.wroteAt < EVERY) return;
    if (s.mine !== st.madeOf) {
      st.madeOf = s.mine;
      st.made = t;
    }
    st.last = s;
    st.wroteAt = t;
    st.stored = true;
    const files = client.shell.media.unsaved(s.mine).map((f) => ({ path: f.path, blob: f.blob }));
    run('readwrite', (store) => store.put({ id: st.id, key: key(), ...s, files, beat: t, made: st.made, tokens: tokensOf(client, st) } satisfies Row)).then(
      () => {
        if (st.stashedAt && t > st.stashedAt) {
          st.stashedAt = 0;
          unstash(st.id);
        }
        const kept = st.last === s && s.mine !== s.base ? s : null;
        if (!st.unavailable && kept === st.kept) return;
        st.unavailable = false;
        st.kept = kept;
        client.refresh();
      },
      () => {
        st.wroteAt = 0;
        if (st.last === s) st.last = null;
        if (st.unavailable) return;
        st.unavailable = true;
        client.refresh();
      },
    );
  };

  const soon = (): void => {
    if (st.soon) return;
    st.soon = true;
    const go = (): void => {
      if (!st.soon) return;
      st.soon = false;
      write(true);
    };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 150);
  };

  const drop = (): void => {
    if (st.stashedAt) unstash(st.id);
    st.stashedAt = 0;
    st.stored = false;
    st.kept = null;
    st.last = null;
    const d = (st.dropping = run('readwrite', (s) => s.delete(st.id))
      .catch(() => {})
      .finally(() => {
        if (st.dropping === d) st.dropping = null;
      }));
  };

  const stop = (): void => {
    clearInterval(st.timer);
    st.timer = 0;
  };

  const update = (): void => {
    if (client.ended) return stop();
    if (!client.acked()) {
      st.since ??= Date.now();
      if (!st.timer) st.timer = window.setInterval(tick, EVERY / 2);
      if (!st.kept && client.connection !== 'online') soon();
      return;
    }
    st.since = null;
    stop();
    if (st.stored) drop();
    if (st.restored) {
      const numbers = st.restored;
      st.restored = null;
      st.note = `Sent your changes${client.shell.onSlides(numbers)} from before the page was closed`;
      client.refresh();
    }
    if (st.left && !st.merging) void rest(client, st, update);
  };

  const tick = (): void => {
    if (client.acked() || client.ended) return update();
    if (!st.kept && client.connection !== 'online') write(true);
    else if (st.since !== null && Date.now() - st.since >= EVERY) write(false);
  };

  client.on('state', update);
  client.on('rebased', (before) => {
    if (st.kept?.mine === before) st.kept = client.snapshot();
  });
  client.port.onChange(() => {
    if (st.note) {
      st.note = null;
      client.refresh();
    }
    update();
  });
  const hide = (): void => {
    const s = current(client, st);
    if (client.ended || client.acked() || !s || keeps(client)) return;
    const t = Date.now();
    try {
      localStorage.setItem(STASH + st.id, JSON.stringify(stashOf({ id: st.id, key: key(), ...s, beat: t, made: s.mine === st.madeOf ? st.made : t, tokens: tokensOf(client, st) })));
      st.stashedAt = t;
    } catch {}
  };
  window.addEventListener('pagehide', () => {
    hide();
    release();
  });
  window.addEventListener('visibilitychange', () => {
    if (document.hidden) hide();
  });
}
