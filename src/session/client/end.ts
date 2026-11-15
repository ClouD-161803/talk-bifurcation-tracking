// the dialog at the end of a session, with a copy of the deck as this page has it

import type { Client } from './client.ts';
import type { Ended } from '../protocol.ts';

export function install(client: Client): void {
  client.on('ended', (ended: Ended) => {
    // Leave Session shows a dialog of its own, in people.ts
    if (client.left) return;
    // read before the editor leaves the session
    const acked = client.acked();
    const text = client.port.text();
    const base = client.snapshot()?.base;
    const slides = acked || base === undefined ? [] : client.shell.changedSlides(base, text);
    const host = client.host;
    const who = ended.by && !host ? ended.by : null;
    const deck = host ? 'index.html' : who ? `${who}'s deck` : "the host's deck";
    const lines = [`Your changes up to now are in ${deck}.`];
    if (!acked) lines.push(`Your ${slides.length ? `changes${client.shell.onSlides(slides)}` : 'last changes'} did not reach ${host ? 'index.html' : who ?? 'the host'}.`);
    const dialog = client.shell.dialog({
      title: who ? `${who} ended the session` : 'The session has ended',
      text: lines.join(' '),
      buttons: [
        { label: 'Download a copy', value: 'download' },
        { label: 'Close', value: 'close', primary: true },
      ],
      onButton: (value) => {
        if (value === 'download') client.shell.download(text);
      },
    });
    void dialog.open('close').then(() => dialog.el.remove());
  });
}
