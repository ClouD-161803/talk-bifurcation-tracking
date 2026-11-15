// the join of a page: the name of the person, asked once per browser, and the person id, kept
// in localStorage, which may be blocked or full in a private window

import { changes, merge } from '../../editor/merge.ts';
import { cleanPersonName, NAME_MAX, nameKey, type HelloAnswer, type HelloRequest, type Taken } from '../protocol.ts';
import type { Client } from './client.ts';
import { accept, beforeJoin, type Copy } from './copy.ts';
import { bdi, fitClass, make, style } from './dom.ts';
import { Failure } from './transport.ts';

export const NAME = 'beeson-session-name';
const PERSON = 'beeson-session-person';
// the key of a name that the next join of the page claims, set by Change Name before a reload
const CLAIM = 'beeson-session-claim';

const CSS = `
.beeson-session-name label { display: flex; align-items: center; gap: 10px; margin: 0 0 16px; }
.beeson-session-name label > span:first-child { flex: none; }
.beeson-session-name input { flex: 1; min-width: 0; height: 32px; box-sizing: border-box; padding: 0 8px; font: inherit; border: 1px solid var(--ed-control-line); border-radius: 6px; background: var(--ed-control); color: var(--ed-text); }
.beeson-session-name .swatch { flex: none; display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--tone, var(--ed-pressed)); color: var(--ink, var(--ed-text)); font: 600 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif; }
.beeson-session-name .error { margin: -8px 0 12px; color: var(--ed-text); }
.beeson-session-name .error:empty { display: none; }
`;

export function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // the name is asked again at the next join
  }
}

type Segmenter = { segment(s: string): Iterable<{ segment: string }> };
let segmenter: Segmenter | null | undefined;

// the first graphemes of the first and the last word, or the first two of a one-word name
export function initials(name: string): string {
  const graphemes = (s: string): string[] => {
    // one segmenter for every call, since the avatars are drawn at each answer of a poll
    if (segmenter === undefined) {
      const Made = (Intl as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => Segmenter }).Segmenter;
      segmenter = Made ? new Made(undefined, { granularity: 'grapheme' }) : null;
    }
    return segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s);
  };
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return graphemes(words[0]).slice(0, 2).join('').toUpperCase();
  return (graphemes(words[0])[0] + graphemes(words[words.length - 1])[0]).toUpperCase();
}

// the field Your name of the join dialog and of Change Name, with the initials of the name beside it
export function nameField(value: string, error = ''): { body: HTMLElement; input: HTMLInputElement; swatch: HTMLElement; note: HTMLElement } {
  style('join', CSS);
  const body = make('div', 'beeson-session-name');
  const label = make('label');
  const input = make('input');
  input.type = 'text';
  input.autocomplete = 'name';
  input.spellcheck = false;
  input.value = value;
  const swatch = make('span', 'swatch');
  swatch.setAttribute('aria-hidden', 'true');
  const show = () => (swatch.textContent = initials(input.value));
  // cut to NAME_MAX code points, as cleanPersonName counts. maxLength counts UTF-16 units, i.e. an
  // emoji twice, and a cut inside a composition would break the input method
  const cut = (e?: Event) => {
    const chars = Array.from(input.value);
    if (!(e as InputEvent | undefined)?.isComposing && chars.length > NAME_MAX) input.value = chars.slice(0, NAME_MAX).join('');
  };
  input.addEventListener('input', cut);
  input.addEventListener('compositionend', () => (cut(), show()));
  input.addEventListener('input', show);
  show();
  label.append(make('span', '', 'Your name'), input, swatch);
  const note = make('p', 'error', error);
  note.setAttribute('role', 'alert');
  body.append(label, note);
  return { body, input, swatch, note };
}

function askName(client: Client, error = ''): Promise<string> {
  const { body, input, note } = nameField(stored(NAME) ?? '', error);
  return new Promise((done) => {
    const dialog = client.shell.dialog({
      title: 'Join the session',
      text: 'Type the name that the others will see on your edits and comments.',
      body,
      className: `beeson-session-join ${fitClass()}`,
      dismissable: false,
      stay: ['join'],
      buttons: [{ label: 'Join', value: 'join', primary: true }],
      onButton: () => {
        const name = cleanPersonName(input.value);
        if (!name) {
          note.textContent = 'Type a name first.';
          input.focus();
          return;
        }
        dialog.close('join');
        dialog.el.remove();
        done(name);
      },
    });
    void dialog.open();
    input.focus();
    input.select();
  });
}

export async function askTaken(client: Client, name: string): Promise<boolean> {
  const dialog = client.shell.dialog({
    title: `${name} has joined this deck before. Is that you?`,
    buttons: [
      { label: 'Use another name', value: 'other' },
      { label: 'Yes, continue', value: 'claim', primary: true },
    ],
    dismissable: false,
  });
  dialog.heading.replaceChildren(bdi(name), ' has joined this deck before. Is that you?');
  try {
    return (await dialog.open('claim')) === 'claim';
  } finally {
    dialog.el.remove();
  }
}

// the first hello of the page, with the dialog when the browser does not know the name of its
// person. text is the text of the page at version v. a copy of copy.ts is joined from its version,
// as a reconnect of a page with its edits
export async function join(client: Client, text: string, v: string, copy: Copy | null = null): Promise<void> {
  if (copy) copy = await accept(client, copy, text, v);
  // the deck with the edits of the copy and the edits typed since the load, made from text. deck is
  // the base of the copy when the deck was not read since the begin of the session
  const onto = (deck: string): string => {
    if (!copy || deck === copy.base) return copy?.mine ?? deck;
    const own = changes(text, deck);
    if (own === null) return deck;
    if (!own.length) return copy.mine;
    return merge(text, own, copy.mine, 'ours')?.text ?? deck;
  };
  // until hello is answered, copy.ts keeps the edits typed since the load, read again after a change
  let early: Copy | null | undefined;
  client.port.onChange(() => (early = undefined));
  beforeJoin(client, () => {
    if (early !== undefined) return early;
    let deck: string;
    try {
      deck = client.port.text();
    } catch {
      return null;
    }
    early = copy ? { base: copy.base, v: copy.v, mine: onto(deck) } : deck === text ? null : { base: text, v, mine: deck };
    return early;
  });
  let name = cleanPersonName(stored(NAME) ?? '');
  let error = '';
  let claim = false;
  try {
    // the flag is cleared by a write, since the tests keep the keys of each page apart in setItem
    claim = !!name && sessionStorage.getItem(CLAIM) === nameKey(name);
    sessionStorage.setItem(CLAIM, '');
  } catch {}
  for (;;) {
    if (!name) name = await askName(client, error);
    const request: HelloRequest = { name, v: copy?.v ?? v, ...(claim ? { claim } : {}) };
    const person = stored(PERSON);
    if (person) request.person = person;
    let answer: HelloAnswer | Taken;
    try {
      answer = await client.hello(request);
    } catch (e) {
      // a refused hello, e.g. a name that the edit command does not take
      if (!(e instanceof Failure)) throw e;
      error = e.message;
      name = '';
      continue;
    }
    if ('taken' in answer) {
      claim = await askTaken(client, answer.taken.name);
      if (!claim) {
        error = '';
        name = '';
      }
      continue;
    }
    store(NAME, answer.name);
    store(PERSON, answer.person);
    if (copy) client.rewrite(onto);
    client.begin(answer, copy?.base ?? text, copy?.v ?? v);
    beforeJoin(client, null);
    return;
  }
}

// the name of another person taken over at the next join of the page, i.e. after a reload
export function claimOnReload(name: string): void {
  store(NAME, name);
  try {
    sessionStorage.setItem(CLAIM, nameKey(name));
  } catch {}
}

// Change Name of the menu of the own avatar
export async function rename(client: Client, name: string): Promise<'renamed' | 'taken'> {
  const answer = await client.transport.name(client.token, cleanPersonName(name));
  if ('taken' in answer) return 'taken';
  store(NAME, answer.name);
  client.setName(answer.name);
  return 'renamed';
}
