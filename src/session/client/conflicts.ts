import { conflict, diff } from '../patch.ts';
import type { Side } from '../replica.ts';
import type { Client } from './client.ts';
import { make, style } from './dom.ts';
import { setAside } from './history.ts';

const OFFLINE = 5000;

const CSS = `
dialog.beeson-session-conflicts .row button { min-height: 32px; }
dialog.beeson-session-conflicts li { overflow-wrap: anywhere; }
`;

type State = { armed: boolean; offline: boolean };
const states = new WeakMap<Client, State>();

function stateOf(client: Client): State {
  let st = states.get(client);
  if (!st) states.set(client, (st = { armed: false, offline: false }));
  return st;
}

export function arm(client: Client): void {
  stateOf(client).armed = true;
}

function snippet(text: string, r: { start: number; end: number }): string {
  const a = text.lastIndexOf('\n', r.start - 1) + 1;
  const e = text.indexOf('\n', r.end > r.start ? r.end - 1 : r.end);
  const plain = text
    .slice(a, e < 0 ? text.length : e)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 60 ? `${plain.slice(0, 59)}…` : plain;
}

type Item = { slide: number | null; text: string; removed: boolean };
function texts(client: Client, base: string, mine: string, theirs: string): Item[] {
  const others = diff(base, theirs);
  const found: { removed: boolean; r: { start: number; end: number; text: string } }[] = [];
  let delta = 0;
  for (const o of diff(base, mine)) {
    const at = o.start + delta;
    delta += o.text.length - (o.end - o.start);
    if (!others.some((t) => conflict(o, t) && !(t.start === o.start && t.end === o.end && t.text === o.text))) continue;
    found.push(o.text ? { removed: false, r: { start: at, end: at + o.text.length, text: '' } } : { removed: true, r: { start: o.start, end: o.end, text: '' } });
  }
  const slides = new Map<object, number | null>();
  for (const removed of [false, true]) for (const f of found) if (f.removed === removed) slides.set(f, client.shell.slidesAt(removed ? base : mine, [f.r])[0] ?? null);
  const out = new Map<string, Item>();
  for (const f of found) {
    const slide = slides.get(f) ?? null;
    const text = snippet(f.removed ? base : mine, f.r);
    out.set(`${slide}\n${f.removed}\n${text}`, { slide, text, removed: f.removed });
  }
  return [...out.values()];
}

const labelOf = (i: Item): string => (i.removed ? (i.slide ? `Slide ${i.slide} (removed by you): ` : 'Removed by you: ') : i.slide ? `Slide ${i.slide}: ` : '');

export function ask(client: Client, base: string, mine: string, theirs: string): Promise<Side> {
  style('conflicts', CSS);
  const items = texts(client, base, mine, theirs);
  const list = make('ul');
  for (const i of items) list.append(make('li', '', `${labelOf(i)}${i.text ? `“${i.text}”` : 'a change without text'}`));
  const slides = [...new Set(items.flatMap((i) => (i.slide ? [i.slide] : [])))].sort((a, b) => a - b);
  const dialog = client.shell.dialog({
    title: 'Others changed texts that you edited offline',
    text: `You and others changed the texts below${client.shell.onSlides(slides)} while you were offline. Every other edit of yours and of the others is kept either way.`,
    body: items.length ? list : undefined,
    className: 'beeson-session-conflicts',
    dismissable: false,
    stay: ['download'],
    buttons: [
      { label: 'Download my version', title: 'Download the deck with your version of these texts', value: 'download' },
      { label: 'Keep theirs', title: 'Drop your edits of these texts, and keep the version of the others', value: 'theirs' },
      { label: 'Keep mine', title: 'Send your version of these texts', value: 'ours', primary: true },
    ],
    onButton: (value) => {
      if (value === 'download') client.shell.download(mine);
    },
  });
  const off = client.on('ended', () => dialog.close('ours'));
  return dialog.open('ours').then((value) => {
    off();
    dialog.el.remove();
    if (value !== 'theirs') return 'ours';
    let text = mine;
    try {
      text = client.port.text();
    } catch {}
    setAside(text, 'Your version of these texts was not sent.').catch((e: unknown) => {
      const d = client.shell.dialog({
        title: 'Your version could not be set aside',
        text: e instanceof Error ? e.message : String(e),
        buttons: [
          { label: 'Close', value: 'close' },
          { label: 'Download my version', value: 'download', primary: true },
        ],
        className: 'beeson-session-history-dialog',
      });
      void d.open('download').then((v) => {
        d.el.remove();
        if (v === 'download') client.shell.download(text);
      });
    });
    return 'theirs';
  });
}

export function install(client: Client): void {
  const st = stateOf(client);
  client.on('dropped', (text) => void setAside(text, 'Your edit clashed with an edit of another person, and was dropped.').catch(() => {}));
  client.on('state', () => {
    if (client.connection === 'offline' || client.connection === 'no-host') {
      st.offline = true;
      return;
    }
    if (client.connection === 'online' && st.offline) {
      if (client.lostAt !== null && Date.now() - client.lostAt > OFFLINE && !client.acked()) st.armed = true;
      st.offline = false;
    }
    if (st.armed && client.acked()) st.armed = false;
  });
  client.hooks.side = (sync, whole, ops) => {
    if (!st.armed) return null;
    st.armed = false;
    const { conflicts, theirs } = sync.conflicts(whole, ops);
    if (!conflicts.length) return 'ours';
    return ask(client, sync.base, sync.mine, theirs);
  };
}
