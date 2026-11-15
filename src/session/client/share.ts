// the Share button at the end of .right of the title bar, and its dialog. the host connects the
// edit command to the relay of the group there, with the address and the secret that the edit
// command keeps for the next time, and then sees the link of the session, Copy, and its QR code. a
// guest sees the address of the page as the link, since share answers only the host. both see the
// people of the session, and the host ends the session for the guests with End session

import type { ShareAnswer } from '../protocol.ts';
import { qr } from '../qr.ts';
import type { Client } from './client.ts';
import { make, sheet, style } from './dom.ts';
import { disc, everyone, type Someone } from './people.ts';

const COPIED = 2000;
const QR_SIZE = 160;
// the quiet zone around a QR code, in modules
const QUIET = 4;

const CSS = `
.beeson-edit-titlebar .right button.beeson-session-share { position: relative; background: var(--ed-select); color: var(--ed-on-select); font-weight: 600; }
.beeson-edit-titlebar .right button.beeson-session-share:hover { background: var(--ed-select); filter: brightness(1.08); }
.beeson-edit-titlebar .right button.beeson-session-share::after { content: ''; position: absolute; inset: -5px -2px; }
dialog.beeson-session-share-dialog label { display: block; margin: 0 0 4px; color: var(--ed-text); }
dialog.beeson-session-share-dialog .field { display: flex; gap: 8px; margin: 0 0 4px; }
dialog.beeson-session-share-dialog input { flex: 1; min-width: 0; height: 32px; box-sizing: border-box; padding: 0 8px; font: inherit; border: 1px solid var(--ed-control-line); border-radius: 6px; background: var(--ed-control); color: var(--ed-text); }
dialog.beeson-session-share-dialog input[readonly] { color: var(--ed-muted); text-overflow: ellipsis; }
dialog.beeson-session-share-dialog .field button { flex: none; min-width: 72px; height: 32px; padding: 0 12px; font: inherit; border: 1px solid var(--ed-control-line); border-radius: 6px; background: var(--ed-control); color: var(--ed-text); cursor: default; }
dialog.beeson-session-share-dialog .error { margin: 0 0 12px; color: var(--ed-text); }
dialog.beeson-session-share-dialog .error::before { content: '⚠ '; color: var(--ed-guide); }
dialog.beeson-session-share-dialog .error:empty { display: none; }
dialog.beeson-session-share-dialog .gap { height: 12px; }
dialog.beeson-session-share-dialog p.hint { margin: 0 0 12px; font-size: 12px; }
dialog.beeson-session-share-dialog .note { margin: 4px 0 12px; }
dialog.beeson-session-share-dialog .note:empty { display: none; }
dialog.beeson-session-share-dialog .qr { display: flex; justify-content: center; margin: 8px 0 16px; }
dialog.beeson-session-share-dialog .qr svg { display: block; width: ${QR_SIZE}px; height: ${QR_SIZE}px; }
dialog.beeson-session-share-dialog h4 { margin: 8px 0 8px; font: 600 13px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; }
dialog.beeson-session-share-dialog ul.people { list-style: none; margin: 0 0 16px; padding: 0; max-height: none; color: var(--ed-text); }
dialog.beeson-session-share-dialog ul.people li { display: flex; align-items: center; gap: 10px; min-height: 32px; }
dialog.beeson-session-share-dialog ul.people .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
dialog.beeson-session-share-dialog ul.people .activity { margin-left: auto; flex: none; color: var(--ed-muted); }
dialog.beeson-session-share-dialog ul.people .activity:empty { display: none; }
`;

// the address of the page without its version and its fragment, i.e. the link of the session for
// a guest. the query is cut by hand, since URLSearchParams would write edit as edit=
export function pageLink(): string {
  const url = new URL(location.href);
  const kept = url.search.slice(1).split('&').filter((p) => p && decodeURIComponent(p.split('=')[0]) !== 'v');
  url.search = kept.length ? `?${kept.join('&')}` : '';
  url.hash = '';
  return url.href;
}

const statuses: ((someone: Someone) => string)[] = [];

// a line beside a person in the list of the Share dialog, e.g. Typing on slide 4, Following Ana,
// or Away. the first function that returns a text is shown. the function returned removes it
export function addPersonStatus(fn: (someone: Someone) => string): () => void {
  statuses.push(fn);
  return () => void statuses.splice(statuses.indexOf(fn) >>> 0, 1);
}

const SVG = 'http://www.w3.org/2000/svg';

// the QR code of text as an inline SVG of QR_SIZE px, black on white with a quiet zone, or null
// when text is too long for it. a dark run of a row is one rectangle of the path
export function qrSvg(text: string): SVGSVGElement | null {
  let dark: boolean[][];
  try {
    dark = qr(text);
  } catch {
    return null;
  }
  const n = dark.length + 2 * QUIET;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
  svg.setAttribute('width', String(QR_SIZE));
  svg.setAttribute('height', String(QR_SIZE));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR code of the link');
  const ground = document.createElementNS(SVG, 'rect');
  ground.setAttribute('width', String(n));
  ground.setAttribute('height', String(n));
  ground.setAttribute('fill', '#fff');
  let d = '';
  dark.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let w = 1;
      while (row[x + w]) w++;
      d += `M${x + QUIET} ${y + QUIET}h${w}v1h-${w}z`;
      x += w - 1;
    }
  });
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', '#000');
  svg.append(ground, path);
  return svg;
}

// the text of a field, put in the clipboard, or selected for a copy by hand where the browser
// does not give the clipboard. resolves with true when the text was copied
async function copy(input: HTMLInputElement): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(input.value);
      return true;
    }
  } catch {
    // e.g. a page without the focus, or without the permission
  }
  input.focus();
  input.setSelectionRange(0, input.value.length);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

type Field = { input: HTMLInputElement; error: HTMLElement };

function field(id: string, label: string, type: string): Field & { el: HTMLElement; row: HTMLElement } {
  const el = make('div');
  const l = make('label', '', label);
  const input = make('input');
  input.id = `beeson-session-${id}`;
  l.htmlFor = input.id;
  input.type = type;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.autocapitalize = 'off';
  const row = make('div', 'field');
  row.append(input);
  const error = make('p', 'error');
  error.id = `${input.id}-error`;
  error.setAttribute('role', 'alert');
  input.setAttribute('aria-describedby', error.id);
  el.append(l, row, error);
  return { el, row, input, error };
}

// the field of an error of the edit command, by its text
function fieldOf(status: number, message: string): 'relay' | 'secret' | 'general' {
  if (status === 409) return 'general';
  if (/secret| 401\b/.test(message)) return 'secret';
  return 'relay';
}

function openShare(client: Client): void {
  const body = make('div');
  const top = make('div');
  const heading = make('h4');
  const people = make('ul', 'people');
  body.append(top, heading, people);
  const dialog = client.shell.dialog({
    title: 'Share',
    body,
    className: `beeson-session-share-dialog ${sheet()}`,
    stay: ['connect', 'end'],
    buttons: [],
    onButton: (value) => {
      if (value === 'connect') void connect();
      if (value === 'end') void end();
    },
  });

  // the link of the session, or null while the host is not connected to a relay
  let link: string | null = client.host ? null : pageLink();
  let form: { relay: Field; secret: Field; general: HTMLElement } | null = null;
  let copiedTimer = 0;

  const request = async (method: string, payload?: object): Promise<{ status: number; answer: ShareAnswer }> => {
    try {
      const response = await fetch(client.url('share'), {
        method,
        cache: 'no-store',
        ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
      });
      const text = await response.text();
      let answer: ShareAnswer;
      try {
        answer = JSON.parse(text);
      } catch {
        answer = { link: null, error: text.slice(0, 200) || `the edit command answered ${response.status}` };
      }
      return { status: response.status, answer };
    } catch (e) {
      return { status: 0, answer: { link: null, error: e instanceof Error ? e.message : String(e) } };
    }
  };

  const showPeople = () => {
    const all = everyone(client);
    heading.textContent = `People in this session (${all.length})`;
    people.replaceChildren(...all.map((p) => {
      const li = make('li');
      li.dataset.person = p.person;
      const name = make('span', 'name', p.person === client.person ? `${p.name} (you)` : p.name);
      // filled by a later part, e.g. Typing on slide 4
      const activity = make('span', 'activity');
      for (const fn of statuses) {
        const text = fn(p);
        if (text) {
          activity.textContent = text;
          break;
        }
      }
      li.append(disc(client, p.person), name, activity);
      return li;
    }));
  };

  const showForm = () => {
    const relay = field('relay', 'Relay address', 'url');
    relay.input.placeholder = 'https://';
    relay.input.inputMode = 'url';
    const secret = field('secret', 'Secret', 'password');
    const reveal = make('button', '', 'Show');
    reveal.type = 'button';
    reveal.setAttribute('aria-pressed', 'false');
    reveal.setAttribute('aria-label', 'Show the secret');
    reveal.addEventListener('click', () => {
      const shown = secret.input.type === 'password';
      secret.input.type = shown ? 'text' : 'password';
      reveal.textContent = shown ? 'Hide' : 'Show';
      reveal.setAttribute('aria-pressed', String(shown));
    });
    secret.row.append(reveal);
    const general = make('p', 'error');
    general.setAttribute('role', 'alert');
    const note = make('p', '', 'Guests join through the relay of your group.');
    // GET share does not tell whether an address is kept, hence the hint is always shown
    const hint = make('p', 'hint', 'Leave both fields empty to connect to the relay that you used last.');
    top.replaceChildren(note, relay.el, make('div', 'gap'), secret.el, general, hint);
    form = { relay, secret, general };
    dialog.setButtons([
      { label: 'Done', value: 'done' },
      { label: 'Connect', value: 'connect', primary: true },
    ]);
  };

  const showLink = (value: string) => {
    form = null;
    const text = make('p', '', 'Anyone with this link can edit the deck while the session runs.');
    const row = make('div', 'field');
    const input = make('input');
    input.type = 'text';
    input.readOnly = true;
    input.value = value;
    input.setAttribute('aria-label', 'Link of the session');
    input.addEventListener('focus', () => input.setSelectionRange(0, input.value.length));
    const button = make('button', 'copy', 'Copy');
    button.type = 'button';
    const note = make('p', 'note');
    note.setAttribute('role', 'status');
    button.addEventListener('click', async () => {
      const done = await copy(input);
      clearTimeout(copiedTimer);
      if (done) {
        button.textContent = 'Copied';
        note.textContent = '';
        copiedTimer = window.setTimeout(() => (button.textContent = 'Copy'), COPIED);
      } else {
        input.focus();
        input.setSelectionRange(0, input.value.length);
        note.textContent = `This browser does not copy for the page. The link is selected: press ${client.app.platform === 'mac' ? '⌘C' : 'Ctrl+C'}, or hold it to copy.`;
      }
    });
    row.append(input, button);
    const code = make('div', 'qr');
    const svg = qrSvg(value);
    if (svg) code.append(svg);
    else code.append(make('p', 'note', 'The link is too long for a QR code.'));
    top.replaceChildren(text, row, note, code);
    dialog.setButtons([...(client.host ? [{ label: 'End session', value: 'end' }] : []), { label: 'Done', value: 'done', primary: true }]);
  };

  const show = () => (link ? showLink(link) : showForm());

  const connect = async () => {
    if (!form) return;
    const { relay, secret, general } = form;
    for (const el of [relay.error, secret.error, general]) el.textContent = '';
    const payload: { relay?: string; secret?: string } = {};
    if (relay.input.value.trim()) payload.relay = relay.input.value.trim();
    if (secret.input.value) payload.secret = secret.input.value;
    const button = dialog.buttons.get('connect');
    if (button) {
      button.disabled = true;
      button.textContent = 'Connecting…';
    }
    const { status, answer } = await request('POST', payload);
    if (button) {
      button.disabled = false;
      button.textContent = 'Connect';
    }
    if (form?.relay !== relay) return;
    if (answer.link) {
      link = answer.link;
      show();
      dialog.buttons.get('done')?.focus();
      return;
    }
    const message = answer.error || 'The relay could not be reached.';
    const at = fieldOf(status, message);
    const target = at === 'general' ? general : form[at].error;
    target.textContent = message.charAt(0).toUpperCase() + message.slice(1);
    if (at !== 'general') form[at].input.focus();
  };

  const end = async () => {
    const sure = client.shell.dialog({
      title: 'End the session?',
      text: 'Guests can no longer edit. The deck stays open for you.',
      className: sheet(),
      buttons: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'End session', value: 'end', primary: true },
      ],
    });
    const answer = await sure.open('cancel');
    sure.el.remove();
    if (answer !== 'end') return;
    const { answer: ended } = await request('DELETE');
    link = ended.link;
    show();
    showPeople();
  };

  // the host is shown the form or the link once the edit command answers
  if (client.host) dialog.setButtons([{ label: 'Done', value: 'done', primary: true }]);
  else show();
  showPeople();
  const off = [client.on('people', showPeople), client.on('known', showPeople), client.on('presence', showPeople), client.on('state', () => client.connection === 'ended' && dialog.close(null))];
  void dialog.open('done').then(() => {
    clearTimeout(copiedTimer);
    for (const fn of off) fn();
    dialog.el.remove();
  });
  if (client.host) {
    void request('GET').then(({ answer }) => {
      if (!dialog.el.isConnected) return;
      link = answer.link;
      show();
      if (!link) form?.relay.input.focus();
    });
  }
}

export function install(client: Client): void {
  style('share', CSS);
  const button = make('button', 'beeson-session-share', 'Share');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'dialog');
  button.title = 'Share the link of the session';
  button.addEventListener('click', () => openShare(client));
  client.shell.bar.append(button);
  client.on('state', () => {
    if (client.connection === 'ended') button.remove();
  });
}
