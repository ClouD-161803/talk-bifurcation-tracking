// the images and videos added in the editor and kept by media/store.ts until a save, whose paths
// under media/ name files that are not in the talk folder yet. before an operation whose text names
// one is sent, the file is uploaded with PUT media/<name>, and the name that the edit command gives
// in its place when the name is taken is written into the deck. a poster of a video and the picture
// of the other mode are files of the store as well, and they are uploaded the same way. a file that
// the edit command would refuse is refused when it is added

import type { MediaFile } from '../../editor/media/store.ts';
import type { Client } from './client.ts';
import { Failure } from './transport.ts';

const MB = 1024 * 1024;
// the limit of PUT media/ of the edit command, and the limit of a body through the relay
const HOST_MAX = 64 * MB;
const GUEST_MAX = 16 * MB;
// the extensions that PUT media/ takes, apart from json, which the editor does not add
const TAKEN = /\.(png|jpe?g|gif|webp|avif|svg|bmp|mp4|m4v|webm|mov|ogv)$/i;
export const FAILED = 'A picture could not be sent. Try again';

type State = { busy: boolean; failed: boolean; network: boolean };
const states = new WeakMap<Client, State>();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// text with every attribute whose whole value is a path of renamed set to its new path
function rename(text: string, renamed: Map<string, string>): string {
  for (const [from, to] of renamed) {
    text = text.replace(new RegExp(`(=\\s*(["']?))${escape(from)}(?=\\2[\\s>/])`, 'g'), (_, head: string) => head + to);
  }
  return text;
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

  store.refuse = (file) => {
    if (!TAKEN.test(file.name)) return `${file.name} cannot be sent to the others, since a session takes only PNG, JPEG, GIF, WebP, AVIF, SVG, MP4, and WebM files`;
    // a guest reaches the edit command through the relay
    const max = client.host ? HOST_MAX : GUEST_MAX;
    if (file.size > max) return `${file.name} is larger than ${max / MB} MB, the largest file that can be sent to the others`;
    return null;
  };

  // the files are uploaded one at a time. the names given by the edit command are written into the
  // deck also after a failure, since the files uploaded before it are kept
  async function upload(files: MediaFile[]): Promise<void> {
    st.busy = true;
    const renamed = new Map<string, string>();
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
        if (answer.path !== f.path) renamed.set(f.path, answer.path);
        store.saved([f]);
      }
    } catch (e) {
      st.failed = true;
      st.network = !(e instanceof Failure) || e.retried;
    } finally {
      st.busy = false;
    }
    if (st.failed) client.refresh();
    client.rewrite(renamed.size ? (text) => rename(text, renamed) : undefined);
  }

  client.hooks.ready = (text) => {
    if (client.ended) return true;
    const files = store.unsaved(text);
    if (!files.length) return true;
    if (!st.busy && !st.failed) void upload(files);
    return false;
  };

  // an upload that failed on the network is tried again once the page is online again
  let was = client.connection;
  client.on('state', () => {
    const now = client.connection;
    if (now === 'online' && was !== 'online' && st.failed && st.network) retry(client);
    if (now === 'ended') store.refuse = null;
    was = now;
  });
}
