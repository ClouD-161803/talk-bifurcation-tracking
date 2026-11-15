// the images and videos added in the editor and kept by media/store.ts until a save, whose paths
// under media/ name files that are not in the talk folder yet. before an operation whose text names
// one is sent, the file is uploaded with PUT media/<name>. while another page is in the session, a
// new file is named uniquely to this page, and the name that the edit command gives in its place
// when the name is taken anyway is written only into the elements of the edits of this page. a
// poster of a video and the picture of the other mode are files of the store as well, and they are
// uploaded the same way. a file that the edit command would refuse is refused when it is added

import type { MediaFile } from '../../editor/media/store.ts';
import type { SrcEl } from '../../editor/source.ts';
import type { Attr } from '../../editor/tokens.ts';
import { diff } from '../patch.ts';
import type { Client } from './client.ts';
import { Failure } from './transport.ts';

const MB = 1024 * 1024;
// the limit of PUT media/ of the edit command, kept for a video of the host, which a browser asks
// for in ranges
const HOST_MAX = 64 * MB;
// the limit of a body through the relay, hence of an image, which a guest asks for whole
const GUEST_MAX = 16 * MB;
// the extensions that PUT media/ takes, apart from json, which the editor does not add
const TAKEN = /\.(png|jpe?g|gif|webp|avif|svg|bmp|mp4|m4v|webm|mov|ogv)$/i;
const VIDEO = /\.(mp4|m4v|webm|mov|ogv)$/i;
export const FAILED = 'A picture could not be sent. Try again';

type State = { busy: boolean; failed: boolean; network: boolean };
const states = new WeakMap<Client, State>();

// the ranges of text, as [start, end), that the patches of diff(base, text) insert
function inserted(base: string, text: string): [number, number][] {
  const out: [number, number][] = [];
  let shift = 0;
  for (const p of diff(base, text)) {
    out.push([p.start + shift, p.start + shift + p.text.length]);
    shift += p.text.length - (p.end - p.start);
  }
  return out;
}

// the save state after a failed upload, or null
export function failedLine(client: Client): string | null {
  return states.get(client)?.failed ? FAILED : null;
}

export function retry(client: Client): void {
  const st = states.get(client);
  if (!st?.failed) return;
  st.failed = false;
  client.refresh();
  client.rewrite();
}

export function install(client: Client): void {
  const store = client.shell.media;
  const st: State = { busy: false, failed: false, network: false };
  states.set(client, st);
  // set at the first rename by the edit command, after which the elements are checked before each
  // operation
  let moved = false;
  // the elements whose new name could not be written, which are not tried again
  const stuck = new WeakSet<Element>();
  let settling = false;

  store.refuse = (file) => {
    if (!TAKEN.test(file.name)) return `${file.name} cannot be sent to the others, since a session takes only PNG, JPEG, GIF, WebP, AVIF, SVG, MP4, and WebM files`;
    // a guest reaches the edit command through the relay, which also limits what a guest loads
    const video = file.type.startsWith('video/') || (!file.type && VIDEO.test(file.name));
    const max = client.host && video ? HOST_MAX : GUEST_MAX;
    if (file.size > max) return `${file.name} is larger than ${max / MB} MB, the largest file that can be sent to the others`;
    return null;
  };
  store.unique = () => client.people.some((p) => p.client !== client.client);

  // each src and poster of the page shown from a file of the store whose name in the text is not
  // the one of the file. an element of the edits of this page, i.e. new on the page, with a tag edit
  // of the attribute, or in a range that the text of the authority lacks, is returned to be written.
  // an element of another page shows its own file in media/ again, whose name it keeps
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
      for (const name of ['src', 'poster']) {
        const live = el.getAttribute(name);
        const path = store.pathOf(live);
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

  // the rewrite of the drive loop that writes the new names into the elements of this page, left
  // out of the history so that the insert of an element is still undone. the deck is read again
  // after it, hence the apply of the drive loop does not change the page
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

  // rename() run again once no transaction of the history is open and no operation of the model runs
  function later(): void {
    if (settling) return;
    settling = true;
    void Promise.all([client.app.history.settle(), client.app.doc.idle()]).then(() => {
      settling = false;
      client.rewrite(rename);
    });
  }

  // the files are uploaded one at a time. the names given by the edit command are written also
  // after a failure, since the files uploaded before it are kept
  async function upload(files: MediaFile[]): Promise<void> {
    st.busy = true;
    let renamed = false;
    try {
      for (const f of files) {
        const name = f.path.slice(f.path.lastIndexOf('/') + 1);
        let response: Response;
        try {
          response = await fetch(client.url(`media/${encodeURIComponent(name)}`, { token: client.token }), { method: 'PUT', body: f.blob, headers: { 'Content-Type': f.blob.type || 'application/octet-stream' }, cache: 'no-store' });
        } catch (e) {
          throw new Failure(0, e instanceof Error ? e.message : String(e));
        }
        const answer = (await response.json().catch(() => null)) as { path?: unknown; error?: unknown } | null;
        if (!response.ok || typeof answer?.path !== 'string') throw new Failure(response.ok ? 0 : response.status, typeof answer?.error === 'string' ? answer.error : 'the upload failed');
        store.saved([f]);
        if (answer.path !== f.path) {
          const now = client.snapshot();
          store.renamed(f, answer.path, (path) => !!now && (now.base.includes(path) || now.mine.includes(path)));
          renamed = moved = true;
        }
      }
    } catch (e) {
      st.failed = true;
      st.network = !(e instanceof Failure) || e.retried;
    } finally {
      st.busy = false;
    }
    if (st.failed) client.refresh();
    client.rewrite(renamed ? rename : undefined);
  }

  client.hooks.ready = (text) => {
    if (client.ended) return true;
    const files = store.unsaved(text);
    if (files.length) {
      if (!st.busy && !st.failed) void upload(files);
      return false;
    }
    // e.g. an element of this page brought back by an undo with the first name of its file
    if (moved && scan().length) {
      later();
      return false;
    }
    return true;
  };

  // an upload that failed on the network is tried again once the page is online again
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
