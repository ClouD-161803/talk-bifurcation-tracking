// the loader of theme/session.js, the client of the synchronous editor, which is fetched from the
// folder of editor.js only with session in the address. the client is handed the port and a few
// parts of the shell in one call, see src/session/client/handover.ts

import type { App } from '../app.ts';
import type { Entry } from '../../session/client/handover.ts';
import { download, fileName } from '../file/files.ts';
import { Dialog } from '../ui/dialog.ts';
import { icon } from '../ui/icons.ts';
import type { Port } from './session.ts';

// read while editor.js runs, since currentScript is null afterward
const self = document.currentScript as HTMLScriptElement | null;

// starts the load of session.js, and returns the start of the session, which resolves with false
// when the page is opened without a session
export function load(app: App, port: Port): () => Promise<boolean> {
  if (!new URLSearchParams(location.search).has('session') || location.protocol === 'file:') return async () => false;
  const loaded = new Promise<Entry | null>((done) => {
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
    return entry.start({ app, port, dialog: (o) => new Dialog(o), icon, bar, download: (text) => void download(fileName(), text) });
  };
}
