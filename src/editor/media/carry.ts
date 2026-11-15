// the files of slides or elements pasted from another deck, kept as new media of this deck. each
// relative src or poster of an img, a video, or a source, and each data-trajectories, is read from
// the address of the first deck, and the pasted text names its new path under media/. a file that
// this deck has at the same path with the same bytes keeps its path, and a file of this deck is
// never replaced

import type { App } from '../app.ts';
import type { Arrival } from '../commands/origin.ts';
import { tokenize } from '../tokens.ts';
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

const listed = (n: string[]) => (n.length < 3 ? n.join(' and ') : `${n.slice(0, -1).join(', ')}, and ${n.at(-1)}`);

// the step of a paste from another deck that carries its files, in commands/origin.ts
export async function carryFiles(app: App, arrival: Arrival): Promise<void> {
  const refs = arrival.texts.map(refsIn);
  const paths = [...new Set(refs.flat().map((r) => r.path))];
  if (!paths.length) return;
  const read = new Map<string, Read>();
  for (const p of paths) read.set(p, await fetched(new URL(p, arrival.origin.deck).href));
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
  if (lost.length) arrival.notes.push(`${listed(lost)} ${lost.length > 1 ? 'were' : 'was'} not copied from ${arrival.origin.deck}.`);
  // the theme reads a trajectory file from the disk only, and once per page
  const drawn = [...new Set(refs.flat().filter((r) => r.name === 'data-trajectories' && to.has(r.path)).map((r) => to.get(r.path)!))];
  if (drawn.length) arrival.notes.push(`The ${drawn.length > 1 ? 'backdrops' : 'backdrop'} of ${listed(drawn)} ${drawn.length > 1 ? 'are' : 'is'} drawn once the deck is saved and opened again.`);
}
