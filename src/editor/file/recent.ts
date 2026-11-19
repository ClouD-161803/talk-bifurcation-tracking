export type Recent = { name: string; page: string; at: number; handle: FileSystemFileHandle };

const DB = 'beeson-editor';
const STORE = 'recent';
const KEY = 'decks';
export const MAX_RECENT = 10;

export const pageOf = (): string => location.href.split(/[?#]/)[0];

let list: Recent[] = [];
let changes = 0;
const watchers: (() => void)[] = [];

export const recents = (): readonly Recent[] => list;

export const recentsOfPage = (): Recent[] => list.filter((r) => r.page === pageOf());

export function watchRecents(fn: () => void): void {
  watchers.push(fn);
}

function base(): Promise<IDBDatabase> {
  return new Promise((done, fail) => {
    const ask = indexedDB.open(DB, 1);
    ask.onupgradeneeded = () => ask.result.createObjectStore(STORE);
    ask.onsuccess = () => done(ask.result);
    ask.onerror = () => fail(ask.error);
    ask.onblocked = () => fail(new Error('the database of the editor is blocked'));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await base();
  try {
    return await new Promise<T>((done, fail) => {
      const t = db.transaction(STORE, mode);
      const ask = fn(t.objectStore(STORE));
      t.oncomplete = () => done(ask.result);
      t.onerror = () => fail(t.error);
      t.onabort = () => fail(t.error);
    });
  } finally {
    db.close();
  }
}

const valid = (r: unknown): r is Recent => {
  const x = r as Partial<Recent> | null;
  return !!x && typeof x.name === 'string' && typeof x.page === 'string' && typeof x.at === 'number' && typeof x.handle?.getFile === 'function';
};

function changed(next: Recent[]): void {
  changes++;
  list = next;
  for (const fn of watchers) fn();
}

async function store(next: Recent[]): Promise<void> {
  changed(next);
  try {
    await run('readwrite', (s) => s.put(next, KEY));
  } catch {}
}

export async function loadRecents(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const at = changes;
  let next: Recent[] = [];
  try {
    const stored = await run<unknown>('readonly', (s) => s.get(KEY));
    if (Array.isArray(stored)) next = stored.filter(valid).slice(0, MAX_RECENT);
  } catch {}
  if (changes === at) changed(next);
}

const same = async (a: FileSystemFileHandle, b: FileSystemFileHandle): Promise<boolean> => {
  try {
    return a === b || (await a.isSameEntry(b));
  } catch {
    return false;
  }
};

const without = async (handle: FileSystemFileHandle): Promise<Recent[]> => {
  const rest: Recent[] = [];
  for (const r of list) if (!(await same(r.handle, handle))) rest.push(r);
  return rest;
};

export async function remember(handle: FileSystemFileHandle): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const rest = await without(handle);
  await store([{ name: handle.name, page: pageOf(), at: Date.now(), handle }, ...rest].slice(0, MAX_RECENT));
}

export async function forget(handle: FileSystemFileHandle): Promise<void> {
  await store(await without(handle));
}

export const clearRecents = (): Promise<void> => store([]);

export function recentLabel(r: Recent): string {
  if (list.filter((o) => o.name === r.name).length < 2) return r.name;
  const parts = decodeURIComponent(new URL(r.page).pathname).split('/').filter(Boolean);
  const folder = parts.at(-2);
  return folder ? `${r.name} — ${folder}` : r.name;
}
