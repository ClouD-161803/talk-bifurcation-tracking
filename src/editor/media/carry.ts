// the files of slides or elements pasted from another deck, kept as new media of this deck. each
// relative src or poster of an img, a video, or a source, and each data-trajectories, is read from
// the address of the first deck, and the pasted text names its new path under media/. a file that
// this deck has at the same path with the same bytes keeps its path, and a file of this deck is
// never replaced. where the browser refuses the read, e.g. from file:// or from another port, a
// dialog asks for the folder of the first deck, which is kept for its address while the page lives

import type { App } from '../app.ts';
import type { Arrival } from '../commands/origin.ts';
import { tokenize } from '../tokens.ts';
import { Dialog, host } from '../ui/dialog.ts';
import { make } from '../ui/dom.ts';
import { taken } from './actions.ts';
import { FOLDER, media, safeName } from './store.ts';

type Ref = { start: number; end: number; name: string; path: string };
// a file of the first deck, or why it was not read: refused by the browser, or not found
type Read = Blob | 'refused' | 'missing';

// the attributes of text that name a file of the deck by a relative path
function refsIn(text: string): Ref[] {
  const out: Ref[] = [];
  for (const t of tokenize(text)) {
    if (t.type !== 'start') continue;
    const isMedia = /^(img|video|source)$/.test(t.name);
    for (const a of t.attrs) {
      if (a.value === null || !(a.name === 'data-trajectories' || (isMedia && (a.name === 'src' || a.name === 'poster')))) continue;
      const path = a.value.trim().replace(/&amp;/g, '&');
      if (path && !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(path)) out.push({ start: a.start, end: a.end, name: a.name, path });
    }
  }
  return out;
}

// a fetch that a browser refuses, e.g. from file:// or from another port, rejects, and a file
// that the server does not have is answered with an error status
async function fetched(url: string): Promise<Read> {
  try {
    const r = await fetch(url);
    return r.ok ? await r.blob() : 'missing';
  } catch {
    return 'refused';
  }
}

// the bytes of this deck at path, or null where the page cannot read them
async function here(path: string): Promise<Blob | null> {
  const own = media.get(path);
  if (own) return own.blob;
  const r = await fetched(new URL(path, location.href).href);
  return r instanceof Blob ? r : null;
}

async function same(a: Blob, b: Blob | null): Promise<boolean> {
  if (!b || a.size !== b.size) return false;
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]).then((v) => v.map((buf) => new Uint8Array(buf)));
  return x.every((v, i) => v === y[i]);
}

// the first path under media/ for name that the deck does not name, that the store does not
// hold, and that is not a file of this deck that the page can read
async function freePath(name: string, isTaken: (path: string) => boolean): Promise<string> {
  const clean = safeName(name, 'file');
  const dot = clean.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ''];
  for (let i = 1; ; i++) {
    const path = `${FOLDER}/${i === 1 ? clean : `${stem}-${i}${ext}`}`;
    if (!media.get(path) && !isTaken(path) && !(await here(path))) return path;
  }
}

// a file of a chosen folder by its path relative to the deck, or null
type Folder = (path: string) => Promise<Blob | null>;
type DirectoryPicker = (o: { id: string; mode: 'read' }) => Promise<FileSystemDirectoryHandle>;
const picker = (): DirectoryPicker | undefined => (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
// an input with webkitdirectory opens a file chooser in place of a folder on a phone
const canPick = (): boolean => !!picker() || ('webkitdirectory' in HTMLInputElement.prototype && matchMedia('(any-pointer: fine)').matches);

const folders = new Map<string, Folder>();
let dialog: Dialog | null = null;

const parts = (path: string): string[] => path.split(/[?#]/)[0].split('/').filter((p) => p && p !== '.').map(decodeURIComponent);

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

// the folder chosen with showDirectoryPicker, or else with an input with webkitdirectory, whose
// files are named by their paths under the chosen folder. null when the person cancels
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

// the folder of the deck at address, asked for once. the picker is opened in the click on the
// button, which grants it in every browser
async function folderOf(address: string, name: string): Promise<Folder | null> {
  const kept = folders.get(address);
  if (kept) return kept;
  let picked: Promise<Folder | null> = Promise.resolve(null);
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
  dialog.text.textContent = `The images, videos, and backdrops that you pasted are files in the folder ${name} of ${address}. The browser lets this page read them only once you choose this folder.`;
  if ((await dialog.open('choose')) !== 'choose') return null;
  const folder = await picked;
  if (folder) folders.set(address, folder);
  return folder;
}

const listed = (n: string[]) => (n.length < 3 ? n.join(' and ') : `${n.slice(0, -1).join(', ')}, and ${n.at(-1)}`);

// the step of a paste from another deck that carries its files, in commands/origin.ts
export async function carryFiles(app: App, arrival: Arrival): Promise<void> {
  const refs = arrival.texts.map(refsIn);
  const paths = [...new Set(refs.flat().map((r) => r.path))];
  if (!paths.length) return;
  const read = new Map<string, Read>();
  // the files of one deck are all refused once one is
  for (const p of paths) read.set(p, [...read.values()].includes('refused') ? 'refused' : await fetched(new URL(p, arrival.origin.deck).href));
  const name = decodeURIComponent(new URL('.', arrival.origin.deck).pathname.split('/').filter(Boolean).pop() ?? '');
  const refused = paths.filter((p) => read.get(p) === 'refused');
  const folder = refused.length && canPick() ? await folderOf(arrival.origin.deck, name) : null;
  if (folder) for (const p of refused) read.set(p, (await folder(p)) ?? 'missing');
  const isTaken = taken(app);
  const to = new Map<string, string>();
  const lost: string[] = [];
  for (const p of paths) {
    const blob = read.get(p);
    if (!(blob instanceof Blob)) {
      lost.push(p);
      continue;
    }
    if (await same(blob, await here(p))) continue;
    const path = await freePath(decodeURIComponent(p.split(/[?#]/)[0].split('/').pop() ?? ''), isTaken);
    media.add(blob, path.slice(FOLDER.length + 1), isTaken);
    to.set(p, path);
  }
  arrival.texts = arrival.texts.map((text, i) => {
    let out = text;
    for (const r of [...refs[i]].reverse()) if (to.has(r.path)) out = `${out.slice(0, r.start)}${r.name}="${to.get(r.path)}"${out.slice(r.end)}`;
    return out;
  });
  const why = refused.length && !canPick() ? ', since this browser cannot open a folder' : '';
  if (lost.length) arrival.notes.push(`${listed(lost)} ${lost.length > 1 ? 'were' : 'was'} not copied from the folder ${name}${why}.`);
  // the theme reads a trajectory file from the disk only, and once per page
  const drawn = [...new Set(refs.flat().filter((r) => r.name === 'data-trajectories' && to.has(r.path)).map((r) => to.get(r.path)!))];
  if (drawn.length) arrival.notes.push(`The ${drawn.length > 1 ? 'backdrops' : 'backdrop'} of ${listed(drawn)} ${drawn.length > 1 ? 'are' : 'is'} drawn once the deck is saved and opened again.`);
}
