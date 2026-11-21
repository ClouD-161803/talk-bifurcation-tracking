import { take } from './host.ts';
import { install } from './session.ts';

window.BeesonEditorSession = (host, app, tracked) => {
  take(host);
  return install(app, tracked);
};
