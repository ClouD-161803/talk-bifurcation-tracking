import type { MediaFile } from '../../editor/media/store.ts';
import type { SrcEl } from '../../editor/source.ts';
import type { Attr } from '../../editor/tokens.ts';
import { diff } from '../patch.ts';
import type { Client } from './client.ts';
import { Failure } from './transport.ts';

const MB = 1024 * 1024;
const HOST_MAX = 64 * MB;
const GUEST_MAX = 16 * MB;
const TAKEN = /\.(png|jpe?g|gif|webp|avif|svg|bmp|mp4|m4v|webm|mov|ogv|pdf)$/i;
const VIDEO = /\.(mp4|m4v|webm|mov|ogv)$/i;
const UPLOAD_WAIT = 30_000;
const UPLOAD_PER_MB = 1000;
export const FAILED = (path: string) => `Could not send ${path}. Try again`;
const FINAL = new Set([403, 409, 413, 414, 415]);

type State = { busy: boolean; failed: string | null; network: boolean; lost: string | null };
const states = new WeakMap<Client, State>();

async function sha256(blob: Blob): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    return Array.from(new Uint8Array(await subtle.digest('SHA-256', await blob.arrayBuffer())), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

function inserted(base: string, text: string): [number, number][] {
  const out: [number, number][] = [];
  let shift = 0;
  for (const p of diff(base, text)) {
    out.push([p.start + shift, p.start + shift + p.text.length]);
    shift += p.text.length - (p.end - p.start);
  }
  return out;
}

export function failedLine(client: Client): string | null {
  const failed = states.get(client)?.failed;
  return failed ? FAILED(failed) : null;
}

export const lostLine = (client: Client): string | null => states.get(client)?.lost ?? null;

export function retry(client: Client): void {
  const st = states.get(client);
  if (!st?.failed) return;
  st.failed = null;
  client.refresh();
  client.rewrite();
}

export function install(client: Client): void {
  const store = client.shell.media;
  const st: State = { busy: false, failed: null, network: false, lost: null };
  states.set(client, st);
  const wait = Number(new URLSearchParams(location.search).get('session-upload-wait')) || UPLOAD_WAIT;
  let moved = false;
  const stuck = new WeakSet<Element>();
  const given = new Map<MediaFile, string>();
  const former = new Map<string, MediaFile>();
  const named = new WeakMap<Element, { file: MediaFile; from: string }>();
  const pdfOf = (el: Element, live: string | null): string | null => {
    if (!live || el.localName !== 'img') return null;
    const b = named.get(el);
    return ((b?.from === live ? b.file : null) ?? store.get(live) ?? former.get(live))?.path ?? null;
  };
  let settling = false;

  store.refuse = (file) => {
    if (!TAKEN.test(file.name)) {
      const ext = /\.[^./]+$/.exec(file.name)?.[0].toLowerCase();
      const advice = `Save ${file.type.startsWith('image/') ? 'it as a PNG or a JPEG' : file.type.startsWith('video/') ? 'it as an MP4 or a WebM' : 'a picture as a PNG or a JPEG, and a video as an MP4 or a WebM'}`;
      return `${file.name} cannot be sent to the others, since a session does not take ${ext ? `${ext} files` : 'files without an extension'}. ${advice}.`;
    }
    const video = file.type.startsWith('video/') || (!file.type && VIDEO.test(file.name));
    const max = client.host && video ? HOST_MAX : GUEST_MAX;
    if (file.size > max) return `${file.name} is larger than ${max / MB} MB, the largest file that can be sent to the others`;
    return null;
  };
  store.unique = () => client.people.some((p) => p.client !== client.client);

  function scan(): { el: Element; name: string; path: string }[] {
    const { pairing, source, tagEdits } = client.app;
    if (!pairing || !source) return [];
    let ranges: [number, number][] | null = null;
    const own = (s: SrcEl, a: Attr) => {
      if (s.source !== source) return true;
      ranges ??= inserted(client.base?.text ?? source.text, source.text);
      return ranges.some(([from, to]) => a.start >= from && a.end <= to);
    };
    const out: { el: Element; name: string; path: string }[] = [];
    for (const el of client.app.slides().querySelectorAll('img, video, source')) {
      const s = pairing.elements.get(el) ?? pairing.inner.get(el);
      if (!s || stuck.has(el)) continue;
      for (const name of ['src', 'poster', 'data-pdf']) {
        const live = el.getAttribute(name);
        const path = name === 'data-pdf' ? pdfOf(el, live) : store.pathOf(live);
        if (!path || path === live) continue;
        const edit = tagEdits.get(el)?.attrs?.[name];
        const a = s.attrs.find((x) => x.name === name);
        const written = edit !== undefined ? edit : (a?.value ?? null);
        if (written === null || written === path) continue;
        if (edit !== undefined || (a && own(s, a))) out.push({ el, name, path });
        else el.setAttribute(name, written);
      }
    }
    return out;
  }

  function rename(text: string): string {
    const writes = scan();
    if (!writes.length) return text;
    const { app } = client;
    if (!app.history.settled || app.doc.busy) {
      later();
      return text;
    }
    for (const { el, name, path } of writes) {
      try {
        app.doc.setTag(el, { attrs: { [name]: path } }, 'rename');
        app.history.discard();
      } catch {}
      if (app.tagEdits.get(el)?.attrs?.[name] !== path) stuck.add(el);
    }
    return client.port.text();
  }

  function later(): void {
    if (settling) return;
    settling = true;
    void Promise.all([client.app.history.settle(), client.app.doc.idle()]).then(() => {
      settling = false;
      client.rewrite(rename);
    });
  }

  async function upload(files: MediaFile[]): Promise<void> {
    st.busy = true;
    let renamed = false;
    let f: MediaFile | null = null;
    try {
      for (f of files) {
        const name = f.path.slice(f.path.lastIndexOf('/') + 1);
        const hash = await sha256(f.blob);
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), wait + (UPLOAD_PER_MB * f.blob.size) / MB);
        let response: Response;
        let answer: { path?: unknown; error?: unknown } | null;
        try {
          response = await fetch(client.url(`media/${encodeURIComponent(name)}`, { token: client.token }), { method: 'PUT', body: f.blob, headers: { 'Content-Type': f.blob.type || 'application/octet-stream', ...(hash && { 'x-content-sha256': hash }) }, cache: 'no-store', signal: abort.signal });
          const body = await response.text();
          try {
            answer = JSON.parse(body);
          } catch {
            answer = { error: body.trim() || undefined };
          }
        } catch (e) {
          throw new Failure(0, e instanceof Error ? e.message : String(e));
        } finally {
          clearTimeout(timer);
        }
        const error = typeof answer?.error === 'string' ? answer.error : `the upload was refused with status ${response.status}`;
        if (FINAL.has(response.status)) {
          given.set(f, error);
          continue;
        }
        if (!response.ok || typeof answer?.path !== 'string') throw new Failure(response.ok ? 0 : response.status, error);
        store.saved([f]);
        if (answer.path !== f.path) {
          for (const el of client.app.slides().querySelectorAll('img[data-pdf]')) {
            const from = el.getAttribute('data-pdf')!;
            const file = store.get(from);
            if (file) named.set(el, { file, from });
          }
          former.set(f.path, f);
          const now = client.snapshot();
          store.renamed(f, answer.path, (path) => !!now && (now.base.includes(path) || now.mine.includes(path)));
          renamed = moved = true;
        }
      }
    } catch (e) {
      st.failed = f?.path || 'a file';
      st.network = !(e instanceof Failure) || e.retried || e.status === 404;
    } finally {
      st.busy = false;
    }
    if (st.failed) client.refresh();
    client.rewrite(renamed ? rename : undefined);
  }

  const lose = (named: MediaFile[]): void => {
    const lost = named.find((f) => given.has(f));
    const line = lost ? `${lost.path} is not in the talk folder, since ${given.get(lost)}. Delete it from the deck, or ${client.host ? 'add the file to media/ by hand and load the page again' : 'ask the host to add the file to media/, then load the page again'}.` : null;
    if (line === st.lost) return;
    st.lost = line;
    client.refresh();
  };

  client.hooks.ready = (text) => {
    if (client.ended) return true;
    const named = store.unsaved(text);
    lose(named);
    const files = named.filter((f) => !given.has(f));
    if (files.length) {
      if (!st.busy && !st.failed) void upload(files);
      return false;
    }
    if (st.failed) {
      st.failed = null;
      client.refresh();
    }
    if (moved && scan().length) {
      later();
      return false;
    }
    return true;
  };

  client.hooks.held = (text) => (client.ended || (moved && scan().length) ? [] : store.unsaved(text).filter((f) => !given.has(f)).map((f) => f.path));

  client.on('me', () => st.failed && st.network && retry(client));
  client.on('applied', () => {
    if (given.size && !client.ended) lose(store.unsaved(client.port.text()));
  });
  let was = client.connection;
  client.on('state', () => {
    const now = client.connection;
    if (now === 'online' && was !== 'online' && st.failed && st.network) retry(client);
    if (now === 'ended') {
      store.refuse = null;
      store.unique = null;
    }
    was = now;
  });
}
