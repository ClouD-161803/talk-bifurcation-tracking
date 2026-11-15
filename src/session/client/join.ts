// the join of a page: the name of the person, asked once per browser, and the person id, kept
// in localStorage, which may be blocked or full in a private window

import { cleanPersonName, NAME_MAX, type HelloAnswer, type HelloRequest, type Taken } from '../protocol.ts';
import type { Client } from './client.ts';
import { make, style } from './dom.ts';
import { Failure } from './transport.ts';

const NAME = 'beeson-session-name';
const PERSON = 'beeson-session-person';

const CSS = `
dialog.beeson-session-join label { display: flex; align-items: center; gap: 10px; margin: 0 0 16px; }
dialog.beeson-session-join label > span:first-child { flex: none; }
dialog.beeson-session-join input { flex: 1; min-width: 0; height: 32px; box-sizing: border-box; padding: 0 8px; font: inherit; border: 1px solid var(--ed-control-line); border-radius: 6px; background: var(--ed-control); color: var(--ed-text); }
dialog.beeson-session-join .swatch { flex: none; display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--ed-pressed); color: var(--ed-text); font: 600 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif; }
dialog.beeson-session-join .error { margin: -8px 0 12px; color: var(--ed-text); }
dialog.beeson-session-join .error:empty { display: none; }
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

// the first graphemes of the first and the last word, or the first two of a one-word name
export function initials(name: string): string {
  const graphemes = (s: string): string[] => {
    const Segmenter = (Intl as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
    return Segmenter ? Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment) : Array.from(s);
  };
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return graphemes(words[0]).slice(0, 2).join('').toUpperCase();
  return (graphemes(words[0])[0] + graphemes(words[words.length - 1])[0]).toUpperCase();
}

// the address is of the machine of the edit command for the host, and of the relay for a guest
const isHost = (): boolean => ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);

function askName(client: Client, error = ''): Promise<string> {
  style('join', CSS);
  const body = make('div');
  const label = make('label');
  const input = make('input');
  input.type = 'text';
  input.maxLength = NAME_MAX;
  input.autocomplete = 'name';
  input.spellcheck = false;
  input.value = stored(NAME) ?? '';
  const swatch = make('span', 'swatch');
  swatch.setAttribute('aria-hidden', 'true');
  const show = () => (swatch.textContent = initials(input.value));
  input.addEventListener('input', show);
  show();
  label.append(make('span', '', 'Your name'), input, swatch);
  const note = make('p', 'error', error);
  note.setAttribute('role', 'alert');
  body.append(label, note);
  return new Promise((done) => {
    const dialog = client.shell.dialog({
      title: isHost() ? 'Start the session' : 'Join the session',
      text: 'Type the name that the others will see on your edits and comments.',
      body,
      className: 'beeson-session-join',
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

async function askTaken(client: Client, name: string): Promise<boolean> {
  const dialog = client.shell.dialog({
    title: `${name} has joined this deck before. Is that you?`,
    buttons: [
      { label: 'Use another name', value: 'other' },
      { label: 'Yes, continue', value: 'claim', primary: true },
    ],
    dismissable: false,
  });
  try {
    return (await dialog.open('claim')) === 'claim';
  } finally {
    dialog.el.remove();
  }
}

// the first hello of the page, with the dialog when the browser does not know the name of its
// person. text is the text of the page at version v
export async function join(client: Client, text: string, v: string): Promise<void> {
  let name = cleanPersonName(stored(NAME) ?? '');
  let error = '';
  let claim = false;
  for (;;) {
    if (!name) name = await askName(client, error);
    const request: HelloRequest = { name, v, ...(claim ? { claim } : {}) };
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
    client.begin(answer, text, v);
    return;
  }
}

// Change Name of the menu of the own avatar
export async function rename(client: Client, name: string): Promise<'renamed' | 'taken'> {
  const answer = await client.transport.name(client.token, cleanPersonName(name));
  if ('taken' in answer) return 'taken';
  store(NAME, answer.name);
  client.setName(answer.name);
  return 'renamed';
}
