// theme/session.js, the client of the synchronous editor, loaded by theme/editor.js with session in
// the address. start() reads the text of the version of the page, begins the session of the
// port, installs the parts of the client, and joins

import type { Entry, Handover } from './handover.ts';
import type { Dialog } from '../../editor/ui/dialog.ts';
import { install as activity } from './activity.ts';
import { Client, RETRY } from './client.ts';
import { install as conflicts } from './conflicts.ts';
import { install as copy, restore } from './copy.ts';
import { install as dots } from './dots.ts';
import { install as end } from './end.ts';
import { install as history } from './history.ts';
import { join, rename } from './join.ts';
import { install as floor } from './floor.ts';
import { install as follow, followOf } from './follow.ts';
import { install as layer } from './layer.ts';
import { install as media } from './media.ts';
import { install as people } from './people.ts';
import { install as presence, presenceOf } from './presence.ts';
import { install as share, pageLink } from './share.ts';
import { install as state } from './state.ts';
import { withClass } from './dom.ts';
import { mayRetry } from './transport.ts';

// each part reads the Client and its events. the avatars go before the save state, and Share
// before the parts that follow a person, draw the dots of the slides, and fill the lines of Share
const PARTS: ((client: Client) => void)[] = [state, end, copy, conflicts, media, history, presence, layer, floor, people, share, follow, dots, activity];

let current: Client | null = null;

// the answer for the address of the page, fetched again on the schedule of the reconnect while the
// fetch throws or its status may change, e.g. a 502 of a relay without the edit command, under a
// dialog that closes once an answer comes
async function fetchPage(handover: Handover): Promise<Response> {
  let dialog: Dialog | null = null;
  let wake = () => {};
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(location.href.split('#')[0], { cache: 'no-store' }).catch(() => null);
    if (response && !mayRetry(response.status)) {
      dialog?.close(null);
      dialog?.el.remove();
      return response;
    }
    if (!dialog) {
      dialog = handover.dialog({
        title: "The host's edit command is not running",
        text: 'This link works again once the host starts it.',
        buttons: [{ label: 'Try now', value: 'retry', primary: true }],
        dismissable: false,
        stay: ['retry'],
        onButton: () => wake(),
      });
      void dialog.open('retry');
    }
    const delay = RETRY[Math.min(attempt, RETRY.length - 1)] * 1000;
    await new Promise<void>((done) => {
      const timer = setTimeout(done, delay);
      wake = () => (clearTimeout(timer), done());
    });
  }
}

// a dialog that the page cannot leave but by Load again
function loadAgain(handover: Handover, title: string, text: string): Promise<never> {
  const dialog = handover.dialog({ title, text, buttons: [{ label: 'Load again', value: 'reload', primary: true }], dismissable: false, onButton: () => location.reload() });
  void dialog.open('reload');
  return new Promise(() => {});
}

async function start(given: Handover): Promise<boolean> {
  // every dialog of the client, also of the Client below, gets the class of dialogClass()
  const handover = { ...given, dialog: withClass(given.dialog) };
  const { app, port } = handover;
  const response = await fetchPage(handover);
  // the version of the page left the log of the edit command, e.g. after a restart
  if (response.status === 409) {
    // the edit command sends the address without a version to the current one
    location.replace(pageLink() + location.hash);
    return new Promise(() => {});
  }
  const v = response.headers.get('x-session-version');
  if (!response.ok) return loadAgain(handover, 'This page cannot join the session', `The edit command answered ${response.status}. Load the page again, or open the address that the host shared.`);
  if (!v) {
    const dialog = handover.dialog({
      title: 'This page is not served by an edit command',
      text: 'The deck is edited without a session. Double-click Edit.command (macOS), Edit.cmd (Windows), or Edit.sh (Linux) in the talk folder, or run npm run edit there, and open the address that it prints.',
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

// presence() and follow() are read by the tests, e.g. to move the clock of the floor rule
const entry: Entry & { client(): Client | null; rename: typeof rename; presence(): ReturnType<typeof presenceOf> | null; follow: typeof followOf } = {
  start,
  client: () => current,
  rename,
  presence: () => (current && presenceOf(current)) ?? null,
  follow: followOf,
};
(window as { BeesonSession?: Entry }).BeesonSession = entry;
