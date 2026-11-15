// the loader of theme/session.js, the client of the synchronous editor, which is fetched from the
// folder of editor.js only with session in the address. the client is handed the port and a few
// parts of the shell in one call, see src/session/client/handover.ts

import type { App } from '../app.ts';
import type { Entry } from '../../session/client/handover.ts';
import { turnersOf } from '../canvas/drag.ts';
import { groupFrame } from '../canvas/frames.ts';
import { frameOf } from '../canvas/hit.ts';
import { download, fileName } from '../file/files.ts';
import { changedSlides, onSlides, slidesAt } from '../file/follow.ts';
import { media } from '../media/store.ts';
import { Dialog } from '../ui/dialog.ts';
import { groupOf } from '../model/groups.ts';
import { icon } from '../ui/icons.ts';
import { openMenu } from '../ui/menu.ts';
import { hooks, type Shape } from './presence.ts';
import { slideHooks } from './slides.ts';
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
    // the page does not edit the deck without the session, whose edits would not reach the others
    if (!entry) {
      void new Dialog({ title: 'The session could not start', text: 'theme/session.js could not be loaded. Load the page again to join the session.', buttons: [{ label: 'Load again', value: 'reload', primary: true }], dismissable: false, onButton: () => location.reload() }).open('reload');
      return new Promise(() => {});
    }
    const bar = document.querySelector<HTMLElement>('.beeson-edit-titlebar .right') ?? document.body;
    return entry.start({ app, port, dialog: (o) => new Dialog(o), icon, bar, download: (text) => void download(fileName(), text), menu: (items, options) => openMenu(app, items, options), slidesAt, changedSlides, onSlides, media, presence: hooks(app), slides: slideHooks(app), groups: (els) => groups(app, els) });
  };
}

// the groups among els, each framed as frames.ts frames a group selected with other objects, at
// the angle of its first member, in fractions of the slide as the shapes of presence.ts
function groups(app: App, els: Element[]): { els: Element[]; shape: Shape }[] {
  const ids = new Map<string, Element[]>();
  for (const el of els) {
    const g = groupOf(el);
    if (g) ids.set(g, [...(ids.get(g) ?? []), el]);
  }
  const slides = app.slides() as HTMLElement;
  const W = slides.offsetWidth, H = slides.offsetHeight;
  const out: { els: Element[]; shape: Shape }[] = [];
  for (const members of ids.values()) {
    if (members.length < 2 || !W || !H) continue;
    const f = frameOf(app);
    const deg = turnersOf(app, members)?.[0].angle ?? 0;
    const b = groupFrame(members, deg);
    out.push({ els: members, shape: { x: (b.left - f.left) / f.scale / W, y: (b.top - f.top) / f.scale / H, w: b.width / f.scale / W, h: b.height / f.scale / H, deg, grow: 0 } });
  }
  return out;
}
