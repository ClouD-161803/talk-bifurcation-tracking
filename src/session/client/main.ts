// theme/session.js, the client of the synchronous editor, loaded by theme/editor.js with session in
// the address. start() reads the text of the version of the page, begins the session of the
// port, installs the parts of the client, and joins

import type { Entry, Handover } from './handover.ts';
import { Client } from './client.ts';
import { install as conflicts } from './conflicts.ts';
import { install as copy, restore } from './copy.ts';
import { install as end } from './end.ts';
import { join, rename } from './join.ts';
import { install as floor } from './floor.ts';
import { install as layer } from './layer.ts';
import { install as media } from './media.ts';
import { install as people } from './people.ts';
import { install as presence, presenceOf } from './presence.ts';
import { install as share, pageLink } from './share.ts';
import { install as state } from './state.ts';

// each part reads the Client and its events. the avatars go before the save state, and Share last
const PARTS: ((client: Client) => void)[] = [state, end, copy, conflicts, media, presence, layer, floor, people, share];

let current: Client | null = null;

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
    // the edit command sends the address without a version to the current one
    location.replace(pageLink() + location.hash);
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
  void restore(client)
    .then((kept) => join(client, text, v, kept))
    .catch((e) => app.fail(e));
  return true;
}

// presence() is read by the tests, e.g. to move the clock of the floor rule
const entry: Entry & { client(): Client | null; rename: typeof rename; presence(): ReturnType<typeof presenceOf> | null } = {
  start,
  client: () => current,
  rename,
  presence: () => (current && presenceOf(current)) ?? null,
};
(window as { BeesonSession?: Entry }).BeesonSession = entry;
