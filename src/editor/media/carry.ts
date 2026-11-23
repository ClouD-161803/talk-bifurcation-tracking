import type { App } from '../app.ts';
import { deckAddress, type Arrival } from '../commands/origin.ts';
import { tokenize } from '../tokens.ts';
import { Dialog, host } from '../ui/dialog.ts';
import { injectStyle, make, touchOnly } from '../ui/dom.ts';
import { taken } from './actions.ts';
import { FOLDER, media, safeName } from './store.ts';

type Ref = { start: number; end: number; name: string; path: string };
type Read = Blob | 'refused' | 'missing' | 'other';

function refsIn(text: string): Ref[] {
  const out: Ref[] = [];
  for (const t of tokenize(text)) {
    if (t.type !== 'start') continue;
    const isMedia = /^(img|video|source)$/.test(t.name);
    for (const a of t.attrs) {
      if (a.value === null || !(a.name === 'data-trajectories' || (isMedia && (a.name === 'src' || a.name === 'poster')) || (t.name === 'img' && a.name === 'data-pdf'))) continue;
      const path = a.value.trim().replace(/&amp;/g, '&');
      if (path && !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(path)) out.push({ start: a.start, end: a.end, name: a.name, path });
    }
  }
  return out;
}

async function fetched(url: string, size = -1): Promise<Read> {
  try {
    const r = await fetch(url, { signal: stop.signal });
    const page = /^text\/html\b/i.test(r.headers.get('content-type') ?? '') && !/\.html?$/i.test(new URL(url).pathname);
    const length = r.headers.get('content-length');
    if (r.ok && !page && size >= 0 && length && !r.headers.has('content-encoding') && +length !== size) {
      void r.body?.cancel();
      return 'other';
    }
    return r.ok && !page ? await r.blob() : 'missing';
  } catch {
    return stop.signal.aborted ? 'missing' : 'refused';
  }
}

async function here(path: string, size: number): Promise<Blob | 'other' | null> {
  const own = media.get(path);
  if (own) return own.blob;
  const r = await fetched(new URL(path, location.href).href, size);
  return r instanceof Blob || r === 'other' ? r : null;
}

async function same(a: Blob, b: Blob | 'other' | null): Promise<boolean> {
  if (!(b instanceof Blob) || a.size !== b.size) return false;
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]).then((v) => v.map((buf) => new Uint8Array(buf)));
  return x.every((v, i) => v === y[i]);
}

async function pathFor(blob: Blob, name: string, isTaken: (path: string) => boolean): Promise<{ path: string; fresh: boolean }> {
  const clean = safeName(name, 'file');
  const dot = clean.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ''];
  for (let i = 1; ; i++) {
    if (i > 100) return { path: `${FOLDER}/${stem}-${Date.now().toString(36)}${ext}`, fresh: true };
    const path = `${FOLDER}/${i === 1 ? clean : `${stem}-${i}${ext}`}`;
    const there = await here(path, blob.size);
    if (await same(blob, there)) return { path, fresh: false };
    if (!there && !isTaken(path)) return { path, fresh: true };
  }
}

type Folder = (path: string) => Promise<Blob | null>;
type DirectoryPicker = (o: { id: string; mode: 'read' }) => Promise<FileSystemDirectoryHandle>;
const picker = (): DirectoryPicker | undefined => (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
const canPick = (): boolean => !!picker() || ('webkitdirectory' in HTMLInputElement.prototype && !touchOnly());

const folders = new Map<string, Folder>();
let dialog: Dialog | null = null;
let busy: Dialog | null = null;
let stop = new AbortController();
let opened = Infinity;
const DELAY = 400;
const BUSY = `dialog.beeson-edit-dialog.paste-busy[open], dialog.beeson-edit-dialog.paste-busy[open]::backdrop { animation: beeson-busy ${DELAY}ms step-end; }
@keyframes beeson-busy { from { opacity: 0; } }`;
function showBusy(): void {
  opened = Infinity;
  void busy?.open();
  requestAnimationFrame((at) => (opened = at));
}
let picked: Promise<Folder | null> = Promise.resolve(null);

const decoded = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
const parts = (path: string): string[] => path.split(/[?#]/)[0].split('/').filter((p) => p && p !== '.').map(decoded);

async function inHandle(dir: FileSystemDirectoryHandle, path: string): Promise<Blob | null> {
  try {
    const p = parts(path);
    let d = dir;
    for (const name of p.slice(0, -1)) d = await d.getDirectoryHandle(name);
    return await (await d.getFileHandle(p.at(-1)!)).getFile();
  } catch {
    return null;
  }
}

function pick(): Promise<Folder | null> {
  const show = picker();
  if (show) return show({ id: 'beeson-paste', mode: 'read' }).then((dir) => (path: string) => inHandle(dir, path), () => null);
  return new Promise((done) => {
    const input = make('input') as HTMLInputElement;
    input.type = 'file';
    input.webkitdirectory = true;
    input.style.display = 'none';
    const finish = (files: File[]) => {
      input.remove();
      const byPath = new Map(files.map((f) => [f.webkitRelativePath.split('/').slice(1).join('/'), f]));
      done(files.length ? async (path) => byPath.get(parts(path).join('/')) ?? null : null);
    };
    input.addEventListener('change', () => finish([...(input.files ?? [])]));
    input.addEventListener('cancel', () => finish([]));
    host().append(input);
    input.click();
  });
}

async function folderOf(address: string, where: string): Promise<Folder | null> {
  const kept = folders.get(address);
  if (kept) return kept;
  picked = Promise.resolve(null);
  dialog ??= new Dialog({
    title: 'Choose the folder of the copied deck',
    text: '',
    buttons: [
      { label: 'Choose Folder…', value: 'choose', primary: true },
      { label: 'Paste Without Files', value: 'cancel' },
    ],
    className: 'deck-folder',
    onButton: (v) => {
      if (v === 'choose') picked = pick();
    },
  });
  dialog.text.textContent = `The images, videos, and backdrops that you pasted are files in ${where}. You have to choose this folder before they can be read.`;
  busy?.close(null);
  const v = await dialog.open('choose');
  showBusy();
  if (v !== 'choose') return null;
  const stopped = new Promise<null>((done) => stop.signal.addEventListener('abort', () => done(null)));
  return Promise.race([picked, stopped]);
}

export const listed = (n: string[]) => (n.length < 3 ? n.join(' and ') : `${n.slice(0, -1).join(', ')}, and ${n.at(-1)}`);

export async function carryFiles(app: App, arrival: Arrival): Promise<void> {
  const refs = arrival.texts.map(refsIn);
  const paths = [...new Set(refs.flat().map((r) => r.path))];
  if (!paths.length || (arrival.origin.session && new URL('.', arrival.origin.deck).href === new URL('.', deckAddress()).href)) return;
  stop = new AbortController();
  injectStyle('paste-busy', BUSY);
  busy ??= new Dialog({ title: 'Copying the files of the paste…', buttons: [{ label: 'Stop', value: 'stop' }], className: 'paste-busy', dismissable: false, stay: ['stop'], onButton: () => performance.now() - opened >= DELAY && stop.abort() });
  showBusy();
  try {
    await carry(app, arrival, refs, paths);
  } finally {
    busy.close(null);
  }
}

async function carry(app: App, arrival: Arrival, refs: Ref[][], paths: string[]): Promise<void> {
  const read = new Map<string, Read>();
  const session = !!arrival.origin.session;
  for (const p of paths) read.set(p, session || [...read.values()].includes('refused') ? 'refused' : await fetched(new URL(p, arrival.origin.deck).href));
  const name = session ? '' : decoded(new URL('.', arrival.origin.deck).pathname.split('/').filter(Boolean).pop() ?? '');
  const from = session ? 'the talk folder of the session that you copied from' : name ? `the folder ${name}` : arrival.origin.deck;
  const refused = paths.filter((p) => read.get(p) === 'refused');
  const folder = refused.length && canPick() ? await folderOf(arrival.origin.deck, session ? from : `the folder ${name ? `${name} ` : ''}of ${arrival.origin.deck}`) : null;
  if (folder) {
    for (const p of refused) read.set(p, stop.signal.aborted ? 'missing' : ((await folder(p)) ?? 'missing'));
    if (refused.some((p) => read.get(p) instanceof Blob)) folders.set(arrival.origin.deck, folder);
  }
  const isTaken = taken(app);
  const to = new Map<string, string>();
  const lost: string[] = [];
  for (const p of paths) {
    const blob = read.get(p);
    if (!(blob instanceof Blob) || stop.signal.aborted) {
      lost.push(p);
      continue;
    }
    if (await same(blob, await here(p, blob.size))) continue;
    const { path, fresh } = await pathFor(blob, decoded(p.split(/[?#]/)[0].split('/').pop() ?? ''), isTaken);
    if (stop.signal.aborted) {
      lost.push(p);
      continue;
    }
    const why = fresh ? media.refuse?.(new File([blob], path.slice(FOLDER.length + 1), { type: blob.type })) : null;
    if (why) {
      arrival.notes.push(`${p} was not copied: ${why}${why.endsWith('.') ? '' : '.'}`);
      continue;
    }
    to.set(p, fresh ? media.add(blob, path.slice(FOLDER.length + 1), isTaken).path : path);
  }
  arrival.texts = arrival.texts.map((text, i) => {
    let out = text;
    for (const r of [...refs[i]].reverse()) if (to.has(r.path)) out = `${out.slice(0, r.start)}${r.name}="${to.get(r.path)}"${out.slice(r.end)}`;
    return out;
  });
  const why = refused.length && !canPick() ? ', since your browser cannot open folders' : '';
  if (lost.length) arrival.notes.push(`${listed(lost)} ${lost.length > 1 ? 'were' : 'was'} not copied from ${from}${why}.`);
  const drawn = [...new Set(refs.flat().filter((r) => r.name === 'data-trajectories' && to.has(r.path)).map((r) => to.get(r.path)!))];
  if (drawn.length) arrival.notes.push(`The ${drawn.length > 1 ? 'backdrops' : 'backdrop'} of ${listed(drawn)} ${drawn.length > 1 ? 'are' : 'is'} drawn once the deck is saved and opened again.`);
}
