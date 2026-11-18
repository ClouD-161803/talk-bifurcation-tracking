// File > Export To > Talk Folder… of a session: the talk folder as the session has it, for a person
// who presents the deck from their own machine. the edit command builds the zip, see
// src/edit/zip.ts, and the page asks for it in pieces, so that the relay holds one piece of a
// download at a time and takes each within its time limit

import type { Client } from './client.ts';
import { make } from './dom.ts';
import { mayRetry } from './transport.ts';

// the wait of the exports of the editor for the edits of the page, SEND_WAIT in src/editor/file/files.ts
const SEND_WAIT = 4000;
// the tries of one piece, e.g. while the relay answers that it is busy
const TRIES = 5;
const FAILED = 'The talk folder could not be downloaded. Try again.';
const MB = 1024 * 1024;

// a phone or a tablet, on which a deck is not opened from the disk: a page without a mouse or a
// trackpad, as touchOnly() in src/editor/ui/dom.ts, and Android, iOS, and iPadOS with one. a tablet
// of Windows without one opens a deck from the disk. an iPad names itself a Mac, with a touch
// screen. an Android tablet that names itself a computer and has a mouse is not told apart from
// one, hence the last text of the download names phones and tablets
const handheld = (): boolean =>
  (matchMedia('(any-pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches && !/Win/.test(navigator.platform)) ||
  /Android|iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// an error whose message is written for the person
class Told extends Error {}

type Made = { id: string; size: number; name: string };

// a sleep that ends early with the signal
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((done) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), done()), { once: true });
  });

// the edits of this page sent, as sent() in src/editor/file/files.ts does before PDF…
async function sent(client: Client): Promise<void> {
  let timer = 0;
  const late = new Promise<never>((_, fail) => {
    timer = window.setTimeout(() => fail(new Told('Your last changes are not sent yet. Try again once they are saved.')), SEND_WAIT);
  });
  try {
    // the editor has the port of the session from before the client is made until the session has
    // ended, when the command is off and its dialog is closed. a page without the port is told an
    // error, and is not given a zip without its last changes
    await Promise.race([client.app.session!.save(), late]);
  } catch (e) {
    throw e instanceof Told ? e : new Told(`${(e as Error).message.replace(/\.$/, '')}.`);
  } finally {
    clearTimeout(timer);
  }
}

// the zip of the talk folder, of which progress is told the bytes read so far
async function fetchZip(client: Client, signal: AbortSignal, progress: (made: Made, read: number) => void): Promise<{ made: Made; blob: Blob }> {
  const query = { token: client.token };
  const built = await fetch(client.url('zip', query), { method: 'POST', cache: 'no-store', signal });
  const answer = (await built.json().catch(() => null)) as (Partial<Made> & { error?: string }) | null;
  // a folder over the limit, or too many downloads at once, in a sentence of the edit command
  if ((built.status === 413 || built.status === 503) && typeof answer?.error === 'string' && /^[A-Z]/.test(answer.error)) throw new Told(answer.error);
  if (!built.ok || !answer || typeof answer.id !== 'string' || typeof answer.size !== 'number' || typeof answer.name !== 'string') throw new Error(`the zip was answered with ${built.status}`);
  const made = answer as Made;
  const at = client.url(`zip/${made.id}`, query);
  // the piece from the byte start, asked for again while the answer may change
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
    // the edit command frees the zip, also for a download that was stopped
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
      // the section on browsers of REFERENCE.md
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
    // a screen reader reads the text with the title, and each later text as it is written
    dialog.text.id = 'beeson-talk-folder-text';
    dialog.el.setAttribute('aria-describedby', dialog.text.id);
    dialog.text.setAttribute('aria-live', 'polite');
    const tell = (text: string) => void (dialog.text.textContent = text);
    // the one button that is left once the download ended either way
    const end = (text: string, label: string) => {
      tell(text);
      dialog.setButtons([{ label, value: 'close', primary: true }]);
      dialog.buttons.get('close')?.focus({ preventScroll: true });
    };
    let started = false;
    let done = false;
    const download = async () => {
      // Download keeps its place and the focus without an effect, so that a second tap or key does
      // not land on Cancel
      if (started) return;
      started = true;
      dialog.buttons.get('download')?.setAttribute('aria-disabled', 'true');
      if (!client.acked()) tell('Sending your last changes…');
      try {
        await sent(client);
        if (stop.signal.aborted) return;
        tell(client.host ? 'The edit command is building the zip…' : "The host's edit command is building the zip…");
        const mb = (bytes: number) => (bytes / MB).toFixed(1);
        const { made, blob } = await fetchZip(client, stop.signal, (made, read) => tell(`Downloading ${made.name}: ${mb(read)} of ${mb(made.size)} MB`));
        if (stop.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        const a = make('a');
        a.href = url;
        a.download = made.name;
        // inside the dialog, since the rest of the page is inert under it
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
    // a download cannot go on or be tried again after the session. what to do with a zip that was
    // downloaded is still read. the dialog is closed at the new state, i.e. before the dialog of
    // src/session/client/end.ts is opened, which then gives the focus back to where it was
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
