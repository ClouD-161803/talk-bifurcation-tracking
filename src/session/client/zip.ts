import type { Client } from './client.ts';
import { make } from './dom.ts';
import { mayRetry } from './transport.ts';

const TRIES = 5;
const MB = 1024 * 1024;
const PIECE = 2 * MB;
const AT_ONCE = 4;

const handheld = (): boolean =>
  (matchMedia('(any-pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches && !/Win/.test(navigator.platform)) ||
  /Android|iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

class Told extends Error {}

type Made = { id: string; size: number; name: string; missing?: string[] };

type Kind = { route: string; id: string; label: string; order: number; title: string; built: string; type: string };

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((done) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), done()), { once: true });
  });

async function sent(client: Client): Promise<void> {
  try {
    await client.app.session!.sent();
  } catch (e) {
    throw new Told(`${(e as Error).message.replace(/\.$/, '')}.`);
  }
}

async function fetchZip(client: Client, kind: Kind, outer: AbortSignal, progress: (made: Made, read: number) => void): Promise<{ made: Made; blob: Blob }> {
  const stopped = new AbortController();
  const signal = stopped.signal;
  outer.addEventListener('abort', () => stopped.abort(), { once: true });
  const query = { token: client.token };
  const built = await fetch(client.url(kind.route, query), { method: 'POST', cache: 'no-store', signal });
  const answer = (await built.json().catch(() => null)) as (Partial<Made> & { error?: string }) | null;
  if ((built.status === 413 || built.status === 503) && typeof answer?.error === 'string' && /^[A-Z]/.test(answer.error)) throw new Told(answer.error);
  if (!built.ok || !answer || typeof answer.id !== 'string' || typeof answer.size !== 'number' || typeof answer.name !== 'string') throw new Error(`the zip was answered with ${built.status}`);
  const made = answer as Made;
  const at = client.url(`${kind.route}/${made.id}`, query);
  const pieceAt = async (start: number): Promise<Blob> => {
    for (let tries = 1; ; tries++) {
      const response = await fetch(`${at}&at=${start}`, { cache: 'no-store', signal }).catch(() => null);
      if (response?.status === 409) throw new Told(((await response.json()) as { error: string }).error);
      const bytes = response?.ok ? await response.blob().catch(() => null) : null;
      if (signal.aborted) throw new Error('the download was stopped');
      if (bytes?.size) return bytes;
      if (tries >= TRIES || (response && !response.ok && !mayRetry(response.status))) throw new Error(`a piece of the zip was answered with ${response?.status ?? 'an error of the network'}`);
      await sleep(1000 * tries, signal);
    }
  };
  try {
    const pieces: Blob[] = [];
    let read = 0;
    let asked = 0;
    progress(made, 0);
    const worker = async () => {
      while (asked < made.size) {
        const start = asked;
        asked += PIECE;
        const piece = await pieceAt(start);
        pieces[start / PIECE] = piece;
        read += piece.size;
        progress(made, read);
      }
    };
    await Promise.all(Array.from({ length: AT_ONCE }, worker));
    if (read !== made.size) throw new Error('the zip has another size than the edit command gave');
    return { made, blob: new Blob(pieces, { type: kind.type }) };
  } finally {
    stopped.abort();
    void fetch(at, { method: 'DELETE', cache: 'no-store', keepalive: true }).catch(() => {});
  }
}

const KINDS: Kind[] = [
  { route: 'zip', id: 'file.export.folder', label: 'Talk Folder…', order: 43, title: 'Talk Folder', built: 'The zip is being built', type: 'application/zip' },
  { route: 'single', id: 'file.export.single', label: 'Single Web Page…', order: 44, title: 'Single Web Page', built: 'The single web page is being built', type: 'text/html' },
];

export function install(client: Client): void {
  for (const kind of KINDS) offer(client, kind);
}

function offer(client: Client, kind: Kind): void {
  let busy = false;
  const single = kind.route === 'single';
  const run = () => {
    if (busy) return;
    busy = true;
    const stop = new AbortController();
    const touch = handheld();
    const dialog = client.shell.dialog({
      title: kind.title,
      text: touch && !single
        ? 'On a phone or a tablet, a deck is opened from a web server, such as the site of the repository. The talk folder is downloaded as a zip, which is unzipped and presented on a computer.'
        : '',
      buttons: touch
        ? [
            { label: 'Cancel', value: 'cancel' },
            { label: 'Download', value: 'download', primary: true },
          ]
        : [{ label: 'Cancel', value: 'cancel' }],
      stay: ['download'],
      onButton: (value) => {
        if (value === 'download') void download();
      },
    });
    dialog.text.id = `beeson-${kind.route}-text`;
    dialog.el.setAttribute('aria-describedby', dialog.text.id);
    dialog.text.setAttribute('aria-live', 'polite');
    const tell = (text: string) => void (dialog.text.textContent = text);
    const end = (text: string, label: string) => {
      tell(text);
      dialog.setButtons([{ label, value: 'close', primary: true }]);
      dialog.buttons.get('close')?.focus({ preventScroll: true });
    };
    let started = false;
    let done = false;
    const download = async () => {
      if (started) return;
      started = true;
      dialog.buttons.get('download')?.setAttribute('aria-disabled', 'true');
      if (!client.acked()) tell('Sending your last changes…');
      try {
        await sent(client);
        if (stop.signal.aborted) return;
        tell(`${kind.built}${client.host ? '' : ' on the host machine'}…`);
        const mb = (bytes: number) => (bytes / MB).toFixed(1);
        const { made, blob } = await fetchZip(client, kind, stop.signal, (made, read) => tell(`Downloading ${made.name}: ${mb(read)} of ${mb(made.size)} MB`));
        if (stop.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        const a = make('a');
        a.href = url;
        a.download = made.name;
        dialog.el.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        const open = 'Then open index.html in the unzipped folder with a double click.';
        done = true;
        const left = made.missing?.length ? ` These files are left out, since they are not in the talk folder or are over 384 MB, the most that Chrome reads in one file: ${made.missing.join(', ')}.` : '';
        end(
          single
            ? `${made.name} holds the whole talk. Open it with a double click, without the talk folder and without a network.${left}`
            : touch
              ? `Move ${made.name} to a computer and unzip it there. ${open}`
              : `Unzip ${made.name} first, unless your browser has already unzipped it. ${open} On a phone or a tablet, a deck is opened from a web server instead.`,
          'Done',
        );
      } catch (e) {
        if (stop.signal.aborted) return;
        if (!(e instanceof Told)) console.warn(`beeson: the ${kind.title.toLowerCase()} was not downloaded, since ${(e as Error).message}`);
        end(e instanceof Told ? e.message : `The ${kind.title.toLowerCase()} could not be downloaded. Try again.`, 'Close');
      }
    };
    const off = client.on('state', () => client.connection === 'ended' && !done && dialog.close(null));
    void dialog.open(touch ? 'download' : 'cancel').then(() => {
      off();
      stop.abort();
      dialog.el.remove();
      busy = false;
    });
    if (!touch) void download();
  };
  client.shell.define({
    id: kind.id,
    label: kind.label,
    menu: { bar: 'File', group: 'export', order: kind.order, submenu: 'Export To' },
    enabled: () => client.connection !== 'ended',
    why: () => (client.connection === 'ended' ? 'The session has ended' : null),
    run,
  });
}
