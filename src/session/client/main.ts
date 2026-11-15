// theme/session.js, the client of the synchronous editor, loaded by theme/editor.js with session in
// the address. start() reads the text of the version of the page, begins the session of the
// port, installs the parts of the client, and joins

import type { Entry, Handover } from './handover.ts';
import { Client } from './client.ts';
import { install as end } from './end.ts';
import { join, rename } from './join.ts';
import { install as people } from './people.ts';
import { install as state } from './state.ts';

// each part reads the Client and its events, and later parts, e.g. the avatars, join this list
const PARTS: ((client: Client) => void)[] = [state, end, people];

let current: Client | null = null;

// the address of the page without its version, which the edit command sends to the current one.
// the query is cut by hand, since URLSearchParams would write edit as edit=
function withoutVersion(): string {
  const url = new URL(location.href);
  const kept = url.search.slice(1).split('&').filter((p) => p && decodeURIComponent(p.split('=')[0]) !== 'v');
  url.search = kept.length ? `?${kept.join('&')}` : '';
  return url.href;
}

async function start(handover: Handover): Promise<boolean> {
  const { app, port } = handover;
  let response: Response;
  try {
    response = await fetch(location.href.split('#')[0], { cache: 'no-store' });
  } catch {
    return false;
  }
  // the version of the page left the log of the edit command, e.g. after a restart
  if (response.status === 409) {
    location.replace(withoutVersion());
    return new Promise(() => {});
  }
  const v = response.headers.get('x-session-version');
  if (!response.ok || !v) {
    const dialog = handover.dialog({
      title: 'This page is not served by an edit command',
      text: 'The deck is edited without a session. Run npm run edit in the folder of the talk, and open the address that it prints.',
      buttons: [{ label: 'OK', value: 'ok', primary: true }],
    });
    void dialog.open().then(() => dialog.el.remove());
    return false;
  }
  const text = await response.text();
  port.begin();
  app.files.open(text);
  const client = new Client(handover);
  current = client;
  for (const install of PARTS) install(client);
  void join(client, text, v).catch((e) => app.fail(e));
  return true;
}

const entry: Entry & { client(): Client | null; rename: typeof rename } = { start, client: () => current, rename };
(window as { BeesonSession?: Entry }).BeesonSession = entry;
