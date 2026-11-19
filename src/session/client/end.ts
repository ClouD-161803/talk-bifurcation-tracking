import type { Client } from './client.ts';
import type { Ended } from '../protocol.ts';
import { bdi } from './dom.ts';

const copyOf = (client: Client): string => (client.reloading ? client.snapshot()!.mine : client.port.text());

export function install(client: Client): void {
  let warned = false;
  client.on('state', () => {
    if (warned || !client.blocked || !client.reloading || client.ended) return;
    warned = true;
    const text = copyOf(client);
    const slides = client.shell.changedSlides(client.snapshot()!.base, text);
    const dialog = client.shell.dialog({
      title: 'Your changes cannot be sent',
      text: `Load the page again to show the deck. Your ${slides.length ? `changes${client.shell.onSlides(slides)}` : 'last changes'} ${client.host ? 'were not saved to index.html' : 'did not reach the host'}.`,
      buttons: [
        { label: 'Download a copy', value: 'download' },
        { label: 'Load again', value: 'reload', primary: true },
      ],
      dismissable: false,
      stay: ['download'],
      onButton: (value) => (value === 'download' ? client.shell.download(text) : client.loadAgain()),
    });
    void dialog.open('reload');
  });

  client.on('ended', (ended: Ended) => {
    if (client.left) return;
    const acked = client.acked();
    const text = copyOf(client);
    const base = client.snapshot()?.base;
    const slides = acked || base === undefined ? [] : client.shell.changedSlides(base, text);
    const host = client.host;
    const who = ended.by && !host ? ended.by : null;
    const deck = host ? ['index.html'] : who ? [bdi(who), "'s deck"] : ["the host's deck"];
    const lines: (string | Node)[] = ['Your changes up to now are in ', ...deck, '.'];
    if (!acked) lines.push(` Your ${slides.length ? `changes${client.shell.onSlides(slides)}` : 'last changes'} ${host ? 'were not saved to' : 'did not reach'} `, host ? 'index.html' : who ? bdi(who) : 'the host', '.');
    const dialog = client.shell.dialog({
      title: who ? `${who} ended the session` : 'The session has ended',
      text: '',
      buttons: [
        { label: 'Download a copy', value: 'download' },
        { label: 'Close', value: 'close', primary: true },
      ],
      onButton: (value) => {
        if (value === 'download') client.shell.download(text);
      },
    });
    if (who) dialog.heading.replaceChildren(bdi(who), ' ended the session');
    dialog.text.replaceChildren(...lines);
    void dialog.open('close').then(() => dialog.el.remove());
  });
}
