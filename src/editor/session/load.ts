// the loader of theme/session.js, the client of the synchronous editor, which is fetched from the
// folder of editor.js only with session in the address. the client is handed the port and a few
// parts of the shell in one call, see src/session/client/handover.ts

import type { App } from '../app.ts';
import type { Entry } from '../../session/client/handover.ts';
import { download, fileName } from '../file/files.ts';
import { changedSlides, onSlides, slidesAt } from '../file/follow.ts';
import { media } from '../media/store.ts';
import { Dialog } from '../ui/dialog.ts';
import { icon } from '../ui/icons.ts';
import { openMenu } from '../ui/menu.ts';
import { hooks } from './presence.ts';
import type { Port } from './session.ts';

// read while editor.js runs, since currentScript is null afterward
const self = document.currentScript as HTMLScriptElement | null;

// starts the load of session.js, and returns the start of the session, which resolves with false
// when the page is opened without a session
export function load(app: App, port: Port): () => Promise<boolean> {
  if (!new URLSearchParams(location.search).has('session')) return async () => false;
  // a client that the page defined before editor.js ran is taken as it is, as the tests of the
  // session mode do, which need the mode without an edit command
  const given = (window as { BeesonSession?: Entry }).BeesonSession;
  if (!given && location.protocol === 'file:') return async () => false;
  const loaded = given ? Promise.resolve<Entry | null>(given) : new Promise<Entry | null>((done) => {
    const script = document.createElement('script');
    script.src = self?.src ? new URL('session.js', self.src).href : 'theme/session.js';
    script.onload = () => done((window as { BeesonSession?: Entry }).BeesonSession ?? null);
    script.onerror = () => done(null);
    document.head.append(script);
  });
  return async () => {
    const entry = await loaded;
    if (!entry) {
      app.note = { text: 'theme/session.js could not be loaded, hence the deck is edited without a session', warn: true };
      return false;
    }
    const bar = document.querySelector<HTMLElement>('.beeson-edit-titlebar .right') ?? document.body;
    return entry.start({ app, port, dialog: (o) => new Dialog(o), icon, bar, download: (text) => void download(fileName(), text), menu: (items, options) => openMenu(app, items, options), slidesAt, changedSlides, onSlides, media, presence: hooks(app) });
  };
}
