// the image, PDF, and video files added in the editor and not saved yet. each file is kept as a blob under
// its path in the deck, e.g. media/orbit.png, and the page shows it from an object URL until a save
// writes it next to the deck. the text of the file names the path, and only the page has the object
// URL. the blobs are also kept in IndexedDB under the address of the deck, so that a draft of
// file/drafts.ts is recovered with its files after a crash or a closed tab

export type Kind = 'image' | 'video';
export type MediaFile = { path: string; blob: Blob; url: string; saved: boolean };

// the folder of the new files, next to the deck
export const FOLDER = 'media';

const DB = 'beeson-media';
const STORE = 'files';
// read when used, since the model of the deck, which a test loads without a page, imports the store
const deck = () => location.href.split(/[?#]/)[0];

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i;
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv)$/i;

export const isPdf = (file: { type: string; name: string }): boolean => file.type === 'application/pdf' || (!file.type && /\.pdf$/i.test(file.name));

// a PDF is put on a slide as the images of its renders, as media/pdf.ts describes
export function kindOf(file: { type: string; name: string }): Kind | null {
  if (isPdf(file)) return 'image';
  if (file.type.startsWith('image/') || (!file.type && IMAGE_EXT.test(file.name))) return 'image';
  if (file.type.startsWith('video/') || (!file.type && VIDEO_EXT.test(file.name))) return 'video';
  return null;
}

// the longest stem of a name, as cleanName of src/edit/command.ts cuts it
const STEM = 80;
const fit = (stem: string, max = STEM) => stem.slice(0, max).replace(/[-_]+$/, '');

// a name that is safe in a path and in an attribute, e.g. orbit-plot-2.png for "Orbit plot (2).PNG".
// its stem is cleaned as cleanName of src/edit/command.ts cleans it, so that the edit command keeps
// the name, e.g. fig-1.png for fig.1.png
export function safeName(name: string, fallback: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  const clean = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  let stem = fit(clean(dot > 0 ? base.slice(0, dot) : base).replace(/\./g, '-').replace(/-{2,}/g, '-').replace(/^[-_]+/, '')) || fallback;
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/.test(stem)) stem = `${stem}-file`;
  const ext = dot > 0 ? clean(base.slice(dot + 1)) : '';
  return ext ? `${stem}.${ext}` : stem;
}

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const suffix = () => `-${Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => DIGITS[b % 36]).join('')}`;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// whether text has path as the whole value of an attribute
export const names = (text: string, path: string): boolean => new RegExp(`=\\s*(["']?)${escapeRe(path)}\\1(?=[\\s>/])`).test(text);

type Row = { deck: string; path: string; blob: Blob };

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((done, fail) => {
    r.onsuccess = () => done(r.result);
    r.onerror = () => fail(r.error);
  });
}

let opened: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  opened ??= new Promise((done, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: ['deck', 'path'] });
    r.onsuccess = () => done(r.result);
    r.onerror = () => fail(r.error);
  });
  return opened;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const s = (await db()).transaction(STORE, mode).objectStore(STORE);
  return request(fn(s));
}

const ofDeck = () => IDBKeyRange.bound([deck(), ''], [deck(), '￿']);

export class MediaStore {
  // the reason why a file cannot be added, e.g. the limit of a session, or null
  refuse: ((file: File) => string | null) | null = null;
  // whether a new file gets a name unique to this page, e.g. plot-k3f9.png, while another page of
  // a session may pick the same name
  unique: (() => boolean) | null = null;
  // the stems given a suffix by unique, so that the poster of plot-k3f9.mp4 is plot-k3f9.png, and
  // the render of plot-k3f9.pdf is plot-k3f9-dark.png
  private readonly suffixed = new Set<string>();
  private readonly byPath = new Map<string, MediaFile>();
  private readonly byUrl = new Map<string, MediaFile>();
  // the chain of the writes to IndexedDB, whose end a test waits for
  private kept: Promise<unknown> = Promise.resolve();

  // a new file under media/ named after name. its path is not one of the store, and taken is
  // false for it
  add(blob: Blob, name: string, taken: (path: string) => boolean, fallback = 'file'): MediaFile {
    const clean = safeName(name, fallback);
    const dot = clean.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ''];
    let path: string;
    if (this.unique?.() && ![...this.suffixed].some((s) => stem === s || stem.startsWith(`${s}-`))) {
      let named: string;
      do {
        named = fit(stem, STEM - 5) + suffix();
        path = `${FOLDER}/${named}${ext}`;
      } while (this.byPath.has(path) || taken(path));
      this.suffixed.add(named);
    } else path = this.free(`${FOLDER}/${clean}`, taken);
    return this.put({ path, blob, url: URL.createObjectURL(blob), saved: false }, true);
  }

  // path, or a numbered name of it, e.g. media/plot-2.png, that is not a path of the store and for
  // which taken is false
  private free(path: string, taken: (path: string) => boolean): string {
    const dot = path.lastIndexOf('.');
    const [stem, ext] = dot > path.lastIndexOf('/') ? [path.slice(FOLDER.length + 1, dot), path.slice(dot)] : [path.slice(FOLDER.length + 1), ''];
    for (let i = 2; this.byPath.has(path) || taken(path); i++) path = `${FOLDER}/${fit(stem, STEM - 1 - String(i).length)}-${i}${ext}`;
    return path;
  }

  // a file of path kept elsewhere, e.g. in the copy of a session in the browser
  adopt(path: string, blob: Blob): MediaFile {
    return this.byPath.get(path) ?? this.put({ path, blob, url: URL.createObjectURL(blob), saved: false }, false);
  }

  private put(f: MediaFile, keep: boolean): MediaFile {
    this.byPath.set(f.path, f);
    this.byUrl.set(f.url, f);
    if (keep) this.keep(() => tx('readwrite', (s) => s.put({ deck: deck(), path: f.path, blob: f.blob } satisfies Row)));
    return f;
  }

  // a browser without IndexedDB, e.g. in a private window, keeps the files on the page only
  private keep(fn: () => Promise<unknown>): void {
    this.kept = this.kept.then(fn).catch(() => {});
  }

  idle(): Promise<unknown> {
    return this.kept;
  }

  get(path: string | null): MediaFile | null {
    return (path && this.byPath.get(path)) || null;
  }

  // the path in the deck of the value of a src or a poster on the page
  pathOf(value: string | null): string | null {
    if (!value) return value;
    return this.byUrl.get(value)?.path ?? value;
  }

  // the files that text names and that are not on the disk yet
  unsaved(text: string): MediaFile[] {
    return [...this.byPath.values()].filter((f) => !f.saved && names(text, f.path));
  }

  // files are on the disk, hence IndexedDB no longer keeps them for a draft. the page keeps
  // showing them from their object URLs
  saved(files: MediaFile[]): void {
    for (const f of files) {
      f.saved = true;
      const path = f.path;
      this.keep(() => tx('readwrite', (s) => s.delete([deck(), path])));
    }
  }

  // f is kept under path, the name that the edit command gave it, so that an element of another
  // page that names the first name of f shows the file in media/. a file not uploaded yet that had
  // path is given a new name for which taken is false, under which it is uploaded
  renamed(f: MediaFile, path: string, taken: (path: string) => boolean): void {
    const other = this.byPath.get(path);
    this.move(f, path);
    if (other && other !== f && !other.saved) this.move(other, this.free(path, taken));
  }

  // the row of a file not uploaded yet is moved as well, so that a draft finds it under path
  private move(f: MediaFile, path: string): void {
    const from = f.path;
    if (this.byPath.get(from) === f) this.byPath.delete(from);
    f.path = path;
    this.byPath.set(path, f);
    if (!f.saved) this.keep(() => tx('readwrite', (s) => (s.delete([deck(), from]), s.put({ deck: deck(), path, blob: f.blob } satisfies Row))));
  }

  // each src and poster under root, root included, that names a file of the store is shown from
  // the object URL of the file. a later src or poster set on these elements with the path of a new
  // file, e.g. by app.doc at an undo, is set to its object URL at once, since a browser asks the
  // server for a poster as soon as it is set
  resolve(root: Element): void {
    for (const el of [root, ...root.querySelectorAll('img, video, source')]) {
      if (!el.matches('img, video, source')) continue;
      this.hook(el);
      for (const attr of ['src', 'poster']) {
        const f = this.byPath.get(el.getAttribute(attr) ?? '');
        if (f) el.setAttribute(attr, f.url);
      }
    }
  }

  private readonly hooked = new WeakSet<Element>();
  private hook(el: Element): void {
    if (this.hooked.has(el)) return;
    this.hooked.add(el);
    const set = Element.prototype.setAttribute;
    el.setAttribute = (name: string, value: string) => set.call(el, name, name === 'src' || name === 'poster' ? (this.byPath.get(value)?.url ?? value) : value);
  }

  // the files that IndexedDB keeps for a draft of this deck. with keep false, e.g. when the deck
  // does not have a draft, they are forgotten. the read is on the chain of the writes, so that a
  // file added while the database is still opened is kept after the others are forgotten
  async load(keep: boolean): Promise<number> {
    const read = this.kept.then(async () => {
      const rows = (await tx('readonly', (s) => s.getAll(ofDeck()))) as Row[];
      if (!keep) await tx('readwrite', (s) => s.delete(ofDeck()));
      return rows;
    });
    this.kept = read.catch(() => {});
    let rows: Row[];
    try {
      rows = await read;
    } catch {
      return 0;
    }
    if (!keep) return 0;
    for (const r of rows) if (!this.byPath.has(r.path)) this.put({ path: r.path, blob: r.blob, url: URL.createObjectURL(r.blob), saved: false }, false);
    return rows.length;
  }
}

// the one store of the editor
export const media = new MediaStore();
