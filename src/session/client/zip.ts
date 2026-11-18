// File > Export To > Talk Folder… of a session: the talk folder as the session has it, for a person
// who presents the deck from their own machine. the edit command builds the zip, see
// src/edit/zip.ts, and the page asks for it in pieces, so that the relay holds one piece of a
// download at a time and takes each within its time limit

import type { Client } from './client.ts';
import { mayRetry } from './transport.ts';

// the tries of one piece, e.g. while the relay answers that it is busy
const TRIES = 5;

// an error whose message is written for the person
class Told extends Error {}

type Made = { id: string; size: number; name: string };

// a sleep that ends early with the signal
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((done) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), done()), { once: true });
  });

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
