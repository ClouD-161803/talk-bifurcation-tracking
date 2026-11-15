// the copy in the browser of the edits of a page that the edit command has not acknowledged, kept
// in IndexedDB so that they outlive a closed page or a restart of the edit command, and merged into
// the deck at the next join of the same address as a reconnect merges them. each page writes one
// record under its own id, and a new page takes over only the records of pages that are gone, so
// that two tabs of one browser never write or send each other's copy

import { changes, merge } from '../../editor/merge.ts';
import type { Version } from '../protocol.ts';
import type { Client } from './client.ts';
import { arm } from './conflicts.ts';

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

type Kept = { path: string; blob: Blob };
type Row = { id: string; key: string; base: string; v: Version; mine: string; files: Kept[]; beat: number };
export type Copy = { base: string; v: Version; mine: string };

type State = {
  id: string;
  // IndexedDB is missing, blocked, or full, e.g. in a private window
  unavailable: boolean;
  // a record of this page may be in IndexedDB
  stored: boolean;
  last: Copy | null;
  wroteAt: number;
  // the time since which edits wait for their acknowledgment, or null
  since: number | null;
  timer: number;
  slides: { base: string; mine: string; numbers: number[]; at: number } | null;
  // the slides of a copy taken over at the join, named in the save state once they are sent
  restored: number[] | null;
  note: string | null;
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

async function gone(row: Row): Promise<boolean> {
  const l = locks();
  if (l) {
    try {
      return !(await l.query()).held?.some((h) => h.name === lockOf(row.id));
    } catch {
      // the heartbeat is read instead
    }
  }
  return Date.now() - row.beat > GONE;
}

// the edits of each other row written into the text of the oldest row with merge.ts. a row whose
// texts are too far apart for merge.ts is not taken, and a later join finds it again
function combine(rows: Row[]): { copy: Copy; taken: Row[] } {
  const [first, ...rest] = [...rows].sort((a, b) => a.beat - b.beat);
  const copy: Copy = { base: first.base, v: first.v, mine: first.mine };
  const taken = [first];
  for (const r of rest) {
    const edits = changes(r.base, r.mine);
    const merged = edits && merge(r.base, edits, copy.mine, 'ours');
    if (!merged) continue;
    copy.mine = merged.text;
    taken.push(r);
  }
  return { copy, taken };
}

function stateOf(client: Client): State {
  let st = states.get(client);
  if (!st) {
    st = { id: pageId(), unavailable: false, stored: false, last: null, wroteAt: 0, since: null, timer: 0, slides: null, restored: null, note: null };
    states.set(client, st);
  }
  return st;
}

// the copies of the pages of this address that are gone, merged into one and taken over by this
// page, whose own record holds them from now on. their files are given back to the store of media
export async function restore(client: Client): Promise<Copy | null> {
  const st = stateOf(client);
  let rows: Row[];
  try {
    rows = ((await run('readonly', (s) => s.index('key').getAll(key()))) ?? []) as Row[];
  } catch {
    st.unavailable = true;
    return null;
  }
  const dead: Row[] = [];
  for (const r of rows) if (r.id !== st.id && (await gone(r))) dead.push(r);
  if (!dead.length) return null;
  const { copy, taken } = combine(dead);
  const files = taken.flatMap((r) => r.files ?? []);
  for (const f of files) client.shell.media.adopt(f.path, f.blob);
  st.stored = true;
  try {
    await run('readwrite', (s) => {
      for (const r of taken) s.delete(r.id);
      s.put({ id: st.id, key: key(), ...copy, files, beat: Date.now() } satisfies Row);
    });
  } catch {
    st.unavailable = true;
  }
  st.restored = client.shell.changedSlides(copy.base, copy.mine);
  arm(client);
  return copy;
}

// the numbers of the slides with edits that wait for their acknowledgment, found again at most
// every EVERY ms while the texts change, since a parse of the deck is slow on a slow machine
function waiting(client: Client, st: State): number[] {
  const s = client.snapshot();
  if (!s) return [];
  const c = st.slides;
  if (c && ((c.base === s.base && c.mine === s.mine) || Date.now() - c.at < EVERY)) return c.numbers;
  const numbers = client.shell.changedSlides(s.base, s.mine);
  st.slides = { base: s.base, mine: s.mine, numbers, at: Date.now() };
  return numbers;
}

// the save state while the page is offline with edits that wait, or null
export function keptLine(client: Client): string | null {
  const st = states.get(client);
  if (!st || client.acked()) return null;
  if (st.unavailable) return 'Offline. Keep this page open, since your changes cannot be kept in this browser';
  const numbers = waiting(client, st);
  return `Offline. ${numbers.length ? `Changes${client.shell.onSlides(numbers)}` : 'Your changes'} are kept in this browser`;
}

// the save state once the edits of a copy taken over at the join are sent, until the next edit
export function restoredLine(client: Client): string | null {
  return states.get(client)?.note ?? null;
}

export function install(client: Client): void {
  const st = stateOf(client);
  // the lock is held while the page lives, and a new page reads it to tell that this one is not gone
  void locks()?.request(lockOf(st.id), () => new Promise<void>(() => {})).catch(() => {});

  const write = (now: boolean): void => {
    const s = client.snapshot();
    if (!s) return;
    const t = Date.now();
    const l = st.last;
    if (l && l.base === s.base && l.v === s.v && l.mine === s.mine && t - st.wroteAt < BEAT) return;
    if (!now && t - st.wroteAt < EVERY) return;
    st.last = s;
    st.wroteAt = t;
    st.stored = true;
    const files = client.shell.media.unsaved(s.mine).map((f) => ({ path: f.path, blob: f.blob }));
    run('readwrite', (store) => store.put({ id: st.id, key: key(), ...s, files, beat: t } satisfies Row)).then(
      () => {
        if (!st.unavailable) return;
        st.unavailable = false;
        client.refresh();
      },
      () => {
        if (st.unavailable) return;
        st.unavailable = true;
        client.refresh();
      },
    );
  };

  const drop = (): void => {
    st.stored = false;
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
  };

  const tick = (): void => {
    if (client.acked() || client.ended) return update();
    if (st.since !== null && Date.now() - st.since >= EVERY) write(false);
  };

  client.on('state', update);
  client.port.onChange(() => {
    if (st.note) {
      st.note = null;
      client.refresh();
    }
    update();
  });
  const hide = (): void => {
    if (!client.ended && client.snapshot() && !client.acked()) write(true);
  };
  window.addEventListener('pagehide', hide);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hide();
  });
}
