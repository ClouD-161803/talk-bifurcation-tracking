// the entry of theme/editor-session.js, the engine of the port, which loadEngine of port.ts loads
// once a page starts or joins a session. the engine takes the values of theme/editor.js from the
// host before it is installed

import { take } from './host.ts';
import { install } from './session.ts';

window.BeesonEditorSession = (host, app, tracked) => {
  take(host);
  return install(app, tracked);
};
