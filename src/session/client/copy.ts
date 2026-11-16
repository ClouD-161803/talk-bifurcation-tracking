// the copy in the browser of the edits of a page that the edit command has not acknowledged, kept
// in IndexedDB so that they outlive a closed page or a restart of the edit command, and merged into
// the deck at the next join of the same address as a reconnect merges them. each page writes one
// record under its own id, and a new page takes over only the records of pages that are gone, so
// that two tabs of one browser never write or send each other's copy

import { changes, merge } from '../../editor/merge.ts';
import { apply, diff, mergePatches } from '../patch.ts';
import { parseVersion, type Token, type Version } from '../protocol.ts';
import type { Side } from '../replica.ts';
import type { Client } from './client.ts';
import { arm, ask } from './conflicts.ts';
import { style } from './dom.ts';

const DB = 'beeson-session';
const STORE = 'copies';
// a copy is written once edits have waited this long in ms, and at most this often
const EVERY = 2000;
// a record is written again after this long in ms, as the heartbeat of its page
const BEAT = 10_000;
// without the Web Locks API, the page of a record not written for this long in ms is gone
const GONE = 60_000;
// the longest wait in ms for IndexedDB at a join, since a blocked database may never answer
const OPEN_WAIT = 3000;
// a copy whose edits are older than this in ms is deleted at a join, with its pictures
const OLD = 30 * 86_400_000;

type Kept = { path: string; blob: Blob };
// made is the time of the last change of mine, missing in a record of an older client. tokens are
// of the pages whose operations may hold the edits of the record, i.e. of its page once it joined,
// and before of the pages of the records that it took over
type Row = { id: string; key: string; base: string; v: Version; mine: string; files: Kept[]; beat: number; made?: number; tokens?: Token[] };
export type Copy = { base: string; v: Version; mine: string };

type State = {
  id: string;
  // IndexedDB is missing, blocked, or full, e.g. in a private window
  unavailable: boolean;
  // a record of this page may be in IndexedDB
  stored: boolean;
  // the copy with edits that wait that IndexedDB holds, or this copy with the operations of others
  // merged since, whose slides the save state names
  kept: Copy | null;
  last: Copy | null;
  wroteAt: number;
  // the time since which edits wait for their acknowledgment, or null
  since: number | null;
  timer: number;
  // a write waits for the client to read the deck
  soon: boolean;
  slides: { base: string; mine: string; numbers: number[] } | null;
  // the slides of a copy taken over at the join, named in the save state once they are sent
  restored: number[] | null;
  note: string | null;
  // the copy of the page before its join, which the join sets until the first answer of hello
  early: (() => Copy | null) | null;
  // the files and the time of the copy taken over, given to the store of media once the join accepts it
  taken: { files: Kept[]; made: number } | null;
  // records of pages that are gone conflicted with the copy taken over, and are merged once it is sent
  left: boolean;
  merging: boolean;
  // the time of the last change of mine in a record, and this mine
  made: number;
  madeOf: string | null;
  // the tokens of the records taken over at the join, which the first hello retires
  retire: Token[];
};

const states = new WeakMap<Client, State>();

// getRandomValues, since randomUUID is missing outside a secure context
function pageId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// the origin and the path, which holds the key of the session
const key = (): string => location.origin + location.pathname;
const lockOf = (id: string): string => `beeson-session-copy:${id}`;

type Locks = { request(name: string, fn: () => Promise<void>): Promise<void>; query(): Promise<{ held?: { name?: string }[] }> };
const locks = (): Locks | undefined => (navigator as { locks?: Locks }).locks;

let opened: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  return (opened ??= new Promise((done, fail) => {
    setTimeout(() => fail(new Error('IndexedDB did not answer')), OPEN_WAIT);
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' }).createIndex('key', 'key');
    r.onsuccess = () => done(r.result);
    r.onerror = () => fail(r.error);
  }));
}

// one transaction on the store, which resolves with the result of the request of fn once it commits
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const t = (await db()).transaction(STORE, mode);
  const r = fn(t.objectStore(STORE));
  return new Promise((done, fail) => {
    t.oncomplete = () => done(r ? r.result : undefined);
    t.onerror = t.onabort = () => fail(t.error ?? new Error('the transaction was aborted'));
  });
}

// whether the page of a record is gone, with the locks read once
async function goneOf(): Promise<(row: Row) => boolean> {
  const l = locks();
  if (l) {
    try {
      const held = new Set(((await l.query()).held ?? []).map((h) => h.name));
      return (row) => !held.has(lockOf(row.id));
    } catch {
      // the heartbeat is read instead
    }
  }
  return (row) => Date.now() - row.beat > GONE;
}

// the records of pages of this address that are gone
async function deadRows(st: State): Promise<Row[]> {
  const rows = ((await run('readonly', (s) => s.index('key').getAll(key()))) ?? []) as Row[];
  const gone = await goneOf();
  return rows.filter((r) => r.id !== st.id && gone(r));
}

// the edits of each other row written into the text of the oldest row with merge.ts. a row whose
// texts are too far apart for merge.ts, or whose edits conflict with the copy, is not taken, and is
// merged after this copy is sent, with the dialog of the conflicts
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
    st = { id: pageId(), unavailable: false, stored: false, kept: null, last: null, wroteAt: 0, since: null, timer: 0, soon: false, slides: null, restored: null, note: null, early: null, taken: null, left: false, merging: false, made: 0, madeOf: null, retire: [] };
    states.set(client, st);
  }
  return st;
}

// the tokens of the closed pages whose records this page took over, which its first hello names, so
// that an operation of such a page that arrives later is not applied on top of the copy
export const retiring = (client: Client): Token[] => stateOf(client).retire;

const tokensOf = (client: Client, st: State): Token[] => (client.snapshot() ? [client.token] : st.retire);

// the copy of the page before the first answer of hello, or null once the session has begun
export function beforeJoin(client: Client, fn: (() => Copy | null) | null): void {
  stateOf(client).early = fn;
}

// the copy for a record: the state of the replica, or before the join the copy of early
const current = (client: Client, st: State): Copy | null => client.snapshot() ?? st.early?.() ?? null;

const CSS = `dialog.beeson-session-earlier .row button { min-height: 32px; }`;

// the dialog of a copy of an earlier session, whose deck has changed since. true to add the changes
async function askEarlier(client: Client, copy: Copy, made: number): Promise<boolean> {
  style('earlier', CSS);
  const day = new Date(made).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const dialog = client.shell.dialog({
    title: 'Changes from an earlier session',
    text: `This browser kept your changes${client.shell.onSlides(client.shell.changedSlides(copy.base, copy.mine))} from ${day}, which were not sent. The deck has changed since then.`,
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
  // a close by the browser keeps the changes
  return value !== 'discard';
}

// the copies of the pages of this address that are gone, merged into one and taken over by this
// page, whose own record holds them from now on. the copies of every address of the origin whose
// edits are older than OLD are deleted
export async function restore(client: Client): Promise<Copy | null> {
  const st = stateOf(client);
  let all: Row[];
  try {
    all = ((await run('readonly', (s) => s.getAll())) ?? []) as Row[];
  } catch {
    st.unavailable = true;
    return null;
  }
  const gone = await goneOf();
  const dead = all.filter((r) => r.id !== st.id && gone(r));
  const old = dead.filter((r) => Date.now() - (r.made ?? r.beat) > OLD);
  const here = dead.filter((r) => r.key === key() && !old.includes(r));
  const { copy, taken, made } = here.length ? combine(here) : { copy: null, taken: [], made: 0 };
  st.left = here.length > taken.length;
  // also of the records left, which rest() merges after the join
  st.retire = here.flatMap((r) => r.tokens ?? []);
  if (!old.length && !copy) return null;
  const files = taken.flatMap((r) => r.files ?? []);
  if (copy) st.stored = true;
  try {
    await run('readwrite', (s) => {
      for (const r of [...old, ...taken]) s.delete(r.id);
      if (copy) s.put({ id: st.id, key: key(), ...copy, files, beat: Date.now(), made, tokens: st.retire } satisfies Row);
    });
    st.kept = copy;
  } catch {
    st.unavailable = true;
  }
  if (!copy) return null;
  st.last = copy;
  st.made = made;
  st.madeOf = copy.mine;
  st.taken = { files, made };
  st.restored = client.shell.changedSlides(copy.base, copy.mine);
  return copy;
}

// the copy taken over by restore() for a join at version v of text, or null when the person
// discards it. a copy of an earlier session, i.e. of another epoch, whose deck has changed since is
// added only when the person says so. its files are given to the store of media
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

// the records left by restore(), merged into the deck as a reconnect merges, with the dialog of the
// conflicts, once the copy taken over is sent. update is called once the record of the page holds them
async function rest(client: Client, st: State, update: () => void): Promise<void> {
  st.left = false;
  st.merging = true;
  try {
    // a record of a page closed after the join waits for the next join, which retires its tokens
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
    // the edits of the copy merged into now, the text of the deck, as Replica.resync merges
    const ours = diff(copy.base, copy.mine);
    const into = (now: string, side: Side) => {
      const theirs = diff(copy.base, now).filter((t) => !ours.some((o) => o.start === t.start && o.end === t.end && o.text === t.text));
      const m = mergePatches(theirs, ours, side);
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
  } catch {
    // the records are kept for a later join
  } finally {
    st.merging = false;
  }
}

// the numbers of the slides with edits of a copy, found again only for another copy, since a parse
// of the deck is slow on a slow machine
function waiting(client: Client, st: State, s: Copy): number[] {
  const c = st.slides;
  if (c && c.base === s.base && c.mine === s.mine) return c.numbers;
  const numbers = client.shell.changedSlides(s.base, s.mine);
  st.slides = { base: s.base, mine: s.mine, numbers };
  return numbers;
}

// the save state while the page is offline with edits that wait, or null. the edits are said to be
// kept once a record with them is written, with the slides of this record
export function keptLine(client: Client): string | null {
  const st = states.get(client);
  if (!st || client.acked() || !current(client, st)) return null;
  if (st.unavailable) return 'Offline. Keep this page open, since your changes cannot be kept in this browser';
  if (!st.kept) return null;
  const numbers = waiting(client, st, st.kept);
  return `Offline. ${numbers.length ? `Changes${client.shell.onSlides(numbers)}` : 'Your changes'} are kept in this browser`;
}

// whether this browser keeps the edits of the page that are not acknowledged, for its next visit.
// while it cannot, or until a record with the newest of them is written, the browser asks before
// the page unloads, since the write that hide() starts at pagehide is aborted with the page. kept
// is set only by a write that succeeded, and never by a write of a record without edits, which
// cannot undo an edit that the edit command may hold
export const keeps = (client: Client): boolean => {
  const st = stateOf(client);
  const s = current(client, st);
  return !s || st.kept?.mine === s.mine;
};

// the save state once the edits of a copy taken over at the join are sent, until the next edit
export function restoredLine(client: Client): string | null {
  return states.get(client)?.note ?? null;
}

export function install(client: Client): void {
  const st = stateOf(client);
  // the lock is held while the page lives, and a new page reads it to tell that this one is not gone
  void locks()?.request(lockOf(st.id), () => new Promise<void>(() => {})).catch(() => {});

  const write = (now: boolean): void => {
    const s = current(client, st);
    if (!s || (!st.stored && s.mine === s.base)) return;
    const t = Date.now();
    const l = st.last;
    if (l && l.base === s.base && l.v === s.v && l.mine === s.mine && t - st.wroteAt < BEAT) return;
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
        // the writes commit in order, hence an older record is replaced by this one
        const kept = st.last === s && s.mine !== s.base ? s : null;
        if (!st.unavailable && kept === st.kept) return;
        st.unavailable = false;
        st.kept = kept;
        client.refresh();
      },
      () => {
        if (st.unavailable) return;
        st.unavailable = true;
        client.refresh();
      },
    );
  };

  // a write once the client has read the deck, after its next frame, or after its timer in a tab
  // that is hidden
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
    st.stored = false;
    st.kept = null;
    st.last = null;
    void run('readwrite', (s) => s.delete(st.id)).catch(() => {});
  };

  const stop = (): void => {
    clearInterval(st.timer);
    st.timer = 0;
  };

  const update = (): void => {
    // after the end, the record is kept for the next session of the same address
    if (client.ended) return stop();
    if (!client.acked()) {
      st.since ??= Date.now();
      if (!st.timer) st.timer = window.setInterval(tick, EVERY / 2);
      // offline, the first record is written at once, since the save state waits for it
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
  // operations of others move mine, and the record of the mine before them keeps the same edits
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
    if (!client.ended && !client.acked() && current(client, st)) write(true);
  };
  window.addEventListener('pagehide', hide);
  // on window, hence after the client has read and sent the keys at the same event on document
  window.addEventListener('visibilitychange', () => {
    if (document.hidden) hide();
  });
}
