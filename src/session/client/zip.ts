import type { Client } from './client.ts';
import { make } from './dom.ts';
import { mayRetry } from './transport.ts';

const TRIES = 5;
const FAILED = 'The talk folder could not be downloaded. Try again.';
const MB = 1024 * 1024;

const handheld = (): boolean =>
  (matchMedia('(any-pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches && !/Win/.test(navigator.platform)) ||
  /Android|iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

class Told extends Error {}

type Made = { id: string; size: number; name: string };

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

async function fetchZip(client: Client, signal: AbortSignal, progress: (made: Made, read: number) => void): Promise<{ made: Made; blob: Blob }> {
  const query = { token: client.token };
  const built = await fetch(client.url('zip', query), { method: 'POST', cache: 'no-store', signal });
  const answer = (await built.json().catch(() => null)) as (Partial<Made> & { error?: string }) | null;
  if ((built.status === 413 || built.status === 503) && typeof answer?.error === 'string' && /^[A-Z]/.test(answer.error)) throw new Told(answer.error);
  if (!built.ok || !answer || typeof answer.id !== 'string' || typeof answer.size !== 'number' || typeof answer.name !== 'string') throw new Error(`the zip was answered with ${built.status}`);
  const made = answer as Made;
  const at = client.url(`zip/${made.id}`, query);
  const pieceAt = async (start: number): Promise<ArrayBuffer> => {
    for (let tries = 1; ; tries++) {
      const response = await fetch(`${at}&at=${start}`, { cache: 'no-store', signal }).catch(() => null);
      const bytes = response?.ok ? await response.arrayBuffer().catch(() => null) : null;
      if (signal.aborted) throw new Error('the download was stopped');
      if (bytes?.byteLength) return bytes;
      if (tries >= TRIES || (response && !response.ok && !mayRetry(response.status))) throw new Error(`a piece of the zip was answered with ${response?.status ?? 'an error of the network'}`);
      await sleep(1000 * tries, signal);
    }
  };
  try {
    const pieces: ArrayBuffer[] = [];
    let read = 0;
    progress(made, 0);
    while (read < made.size) {
      const piece = await pieceAt(read);
      pieces.push(piece);
      read += piece.byteLength;
      progress(made, read);
    }
    if (read !== made.size) throw new Error('the zip has another size than the edit command gave');
    return { made, blob: new Blob(pieces, { type: 'application/zip' }) };
  } finally {
    void fetch(at, { method: 'DELETE', cache: 'no-store', keepalive: true }).catch(() => {});
  }
}

export function install(client: Client): void {
  let busy = false;
  const run = () => {
    if (busy) return;
    busy = true;
    const stop = new AbortController();
    const touch = handheld();
    const dialog = client.shell.dialog({
      title: 'Talk Folder',
      text: touch
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
    dialog.text.id = 'beeson-talk-folder-text';
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
        tell(client.host ? 'The zip is being built…' : 'The zip is being built on the computer of the host…');
        const mb = (bytes: number) => (bytes / MB).toFixed(1);
        const { made, blob } = await fetchZip(client, stop.signal, (made, read) => tell(`Downloading ${made.name}: ${mb(read)} of ${mb(made.size)} MB`));
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
        end(
          touch
            ? `Move ${made.name} to a computer and unzip it there. ${open}`
            : `Unzip ${made.name} first, unless your browser has already unzipped it. ${open} On a phone or a tablet, a deck is opened from a web server instead.`,
          'Done',
        );
      } catch (e) {
        if (stop.signal.aborted) return;
        if (!(e instanceof Told)) console.warn(`beeson: the talk folder was not downloaded, since ${(e as Error).message}`);
        end(e instanceof Told ? e.message : FAILED, 'Close');
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
    id: 'file.export.folder',
    label: 'Talk Folder…',
    menu: { bar: 'File', group: 'export', order: 43, submenu: 'Export To' },
    enabled: () => client.connection !== 'ended',
    why: () => (client.connection === 'ended' ? 'The session has ended' : null),
    run,
  });
}
