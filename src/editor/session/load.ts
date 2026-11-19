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
import { script } from '../ui/script.ts';
import { commentsShell } from './comments-shell.ts';
import { historyShell } from './history-mode.ts';
import { hooks, type Shape } from './presence.ts';
import { slideHooks } from './slides.ts';
import { loadEngine, type Port } from './port.ts';

export function load(app: App, port: Port): () => Promise<boolean> {
  if (!new URLSearchParams(location.search).has('session')) return async () => false;
  const given = (window as { BeesonSession?: Entry }).BeesonSession;
  if (!given && location.protocol === 'file:') {
    port.served(false);
    return async () => false;
  }
  const loaded = given ? Promise.resolve(given) : script('session.js').then(() => (window as { BeesonSession?: Entry }).BeesonSession ?? null, () => null);
  const engine = loadEngine();
  return async () => {
    const [entry, installed] = await Promise.all([loaded, engine]);
    if (!entry || !installed) {
      const failed = [!entry && 'theme/session.js', !installed && 'theme/editor-session.js'].filter(Boolean).join(' and ');
      void new Dialog({ title: 'The session could not start', text: `${failed} could not be loaded. Load the page again to join the session.`, buttons: [{ label: 'Load again', value: 'reload', primary: true }], dismissable: false, onButton: () => location.reload() }).open('reload');
      return new Promise(() => {});
    }
    const bar = document.querySelector<HTMLElement>('.beeson-edit-titlebar .right') ?? document.body;
    return entry.start({ app, port, dialog: (o) => new Dialog(o), icon, bar, download: (text) => void download(fileName(), text), define: (command) => (app.commands.define(command), app.invalidate()), menu: (items, options) => openMenu(app, items, options), slidesAt, changedSlides, onSlides, media, presence: hooks(app), slides: slideHooks(app), groups: (els) => groups(app, els), history: historyShell(app), comments: commentsShell(app) });
  };
}

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
