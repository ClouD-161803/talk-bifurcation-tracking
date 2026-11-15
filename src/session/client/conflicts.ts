// the dialog of the conflicts after a break: at a reconnect after the page was offline for over
// OFFLINE ms with edits that wait, and at a join that took over a copy of copy.ts, the texts that
// the person and someone else both changed are listed with their slides, and the person keeps
// either version. every other edit of both sides is merged either way. a typing race of pages that
// are online is merged without a dialog, and the edit of this page wins

import { conflict, diff } from '../patch.ts';
import type { Side } from '../replica.ts';
import type { Client } from './client.ts';
import { make, style } from './dom.ts';

const OFFLINE = 5000;

// the hit area of each button is 32 px high, also at a width of 390 px, where the buttons wrap
const CSS = `
dialog.beeson-session-conflicts .row button { min-height: 32px; }
dialog.beeson-session-conflicts li { overflow-wrap: anywhere; }
`;

type State = { armed: boolean; since: number | null };
const states = new WeakMap<Client, State>();

function stateOf(client: Client): State {
  let st = states.get(client);
  if (!st) states.set(client, (st = { armed: false, since: null }));
  return st;
}

// the next merge of operations or of a whole text asks the person at a conflict
export function arm(client: Client): void {
  stateOf(client).armed = true;
}

// the line of text around r with its tags taken out, cut to about 60 characters
function snippet(text: string, r: { start: number; end: number }): string {
  const a = text.lastIndexOf('\n', r.start - 1) + 1;
  const e = text.indexOf('\n', r.end);
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

// the texts of mine that conflict with theirs, both made from base, each with its slide in mine
function texts(client: Client, base: string, mine: string, theirs: string): { slide: number | null; text: string }[] {
  const others = diff(base, theirs);
  const out = new Map<string, { slide: number | null; text: string }>();
  let delta = 0;
  for (const o of diff(base, mine)) {
    const at = o.start + delta;
    delta += o.text.length - (o.end - o.start);
    // an operation of this page that the authority holds is on both sides
    if (!others.some((t) => conflict(o, t) && !(t.start === o.start && t.end === o.end && t.text === o.text))) continue;
    const r = { start: at, end: at + o.text.length, text: '' };
    const slide = client.shell.slidesAt(mine, [r])[0] ?? null;
    const text = snippet(mine, r);
    out.set(`${slide}\n${text}`, { slide, text });
  }
  return [...out.values()];
}

function ask(client: Client, base: string, mine: string, theirs: string): Promise<Side> {
  style('conflicts', CSS);
  const items = texts(client, base, mine, theirs);
  const list = make('ul');
  for (const i of items) list.append(make('li', '', `${i.slide ? `Slide ${i.slide}: ` : ''}${i.text ? `“${i.text}”` : 'a change without text'}`));
  const slides = [...new Set(items.flatMap((i) => (i.slide ? [i.slide] : [])))].sort((a, b) => a - b);
  // the deck keeps the version of the person while the dialog is open, and the dialog is not closed
  // by Esc or a click outside, hence the person cannot lose the edits that wait
  const dialog = client.shell.dialog({
    title: 'Others changed texts that you edited offline',
    text: `You and others changed the texts below${client.shell.onSlides(slides)} while you were offline. Every other edit of yours and of the others is kept either way.`,
    body: items.length ? list : undefined,
    className: 'beeson-session-conflicts',
    dismissable: false,
    stay: ['download'],
    buttons: [
      { label: 'Download my version', title: 'Download the deck as this page has it, with your version of these texts', value: 'download' },
      { label: 'Keep theirs', title: 'Drop your edits of these texts, and keep the version of the others', value: 'theirs' },
      { label: 'Keep mine', title: 'Send your version of these texts', value: 'ours', primary: true },
    ],
    onButton: (value) => {
      if (value !== 'download') return;
      let text = mine;
      try {
        text = client.port.text();
      } catch {
        // the text of the replica is the deck as this page has it
      }
      client.shell.download(text);
    },
  });
  return dialog.open('ours').then((value) => {
    dialog.el.remove();
    return value === 'theirs' ? 'theirs' : 'ours';
  });
}

export function install(client: Client): void {
  const st = stateOf(client);
  client.on('state', () => {
    if (client.connection === 'offline' || client.connection === 'no-host') {
      st.since ??= Date.now();
      return;
    }
    if (client.connection === 'online' && st.since !== null) {
      if (Date.now() - st.since > OFFLINE && !client.acked()) st.armed = true;
      st.since = null;
    }
    // every edit of the break was sent without a conflict
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
