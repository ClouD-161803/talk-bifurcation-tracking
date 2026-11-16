// the save state of a session, a button in .right of the title bar in place of Autosave, whose
// text is given to the title as well. a click on it opens its menu, with Try Now while a
// reconnect waits and the items that other parts add, or else saves, which in a session waits for
// the acknowledgments. a second button beside it is Try now while a reconnect waits, and Load again
// while the page is blocked

import { BLOCKED, type Client } from './client.ts';
import { keptLine, restoredLine } from './copy.ts';
import { make, style } from './dom.ts';
import { failedLine, lostLine, retry as retryUpload } from './media.ts';
import type { MenuItem, OpenMenu } from '../../editor/ui/menu.ts';
import { isLeaving } from './people.ts';

// the items of the menu after Try Now, e.g. Version History
const ITEMS: MenuItem[] = [];
export const addStateItem = (item: MenuItem): void => void ITEMS.push(item);

// the hit area is 32 px high, around a button of 22 px. in a narrow title bar the buttons take a row
// of their own, see people.ts. the button is drawn without its text while the title shows it, i.e.
// from the width at which menubar.ts shows the state, and while the title has room for it. in a
// narrow title bar a warning takes a line of its own under the buttons, on which it wraps
const CSS = `
@media (min-width: 900px) { .beeson-edit-titlebar:has(.doc:not(.tight) .state) .right button.beeson-session-state .name { display: none; } }
.beeson-edit-titlebar .right button.beeson-session-state, .beeson-edit-titlebar .right button.beeson-session-action { position: relative; }
.beeson-edit-titlebar .right button.beeson-session-state::after, .beeson-edit-titlebar .right button.beeson-session-action::after { content: ''; position: absolute; inset: -5px -2px; }
.beeson-edit-titlebar .right button.beeson-session-state svg { flex: none; color: var(--ed-muted); }
.beeson-edit-titlebar .right button.beeson-session-state.warn svg { color: var(--ed-guide); }
.beeson-edit-titlebar .right button.beeson-session-action { border: 1px solid var(--ed-control-line); background: var(--ed-control); }
.beeson-edit-titlebar.beeson-session-bar.narrow .right button.beeson-session-state.warn { order: 1; flex: 1 0 100%; align-items: flex-start; height: auto; padding: 4px 8px; line-height: 1.35; white-space: normal; overflow-wrap: anywhere; text-align: start; }
.beeson-edit-titlebar.beeson-session-bar.narrow .right button.beeson-session-state.warn .name { position: relative; z-index: 1; max-height: 5lh; overflow-y: auto; }
`;

type Action = 'retry' | 'reload' | 'upload' | null;
// note is a warning of the editor, e.g. why a file is not added, which follows text until the next
// edit. the title shows it in place of the status, hence text is the status
type View = { text: string; icon: string; warn: boolean; action: Action; note?: string };

function view(client: Client): View {
  const retry: Action = client.retryAt === null ? null : 'retry';
  if (client.blocked) return { text: BLOCKED, icon: 'warning', warn: true, action: 'reload' };
  if (isLeaving()) return { text: 'Leaving…', icon: 'cloud', warn: false, action: null };
  switch (client.connection) {
    case 'joining':
      return { text: 'Joining…', icon: 'cloud', warn: false, action: retry };
    case 'offline': {
      const kept = keptLine(client);
      if (kept) return { text: kept, icon: 'cloud-off', warn: true, action: retry };
      const left = client.retryAt === null ? 0 : Math.max(0, Math.ceil((client.retryAt - Date.now()) / 1000));
      if (client.full) return { text: `The session is full. ${left ? `Trying again in ${left} s` : 'Trying again…'}`, icon: 'cloud-off', warn: true, action: retry };
      return { text: `Offline. ${left ? `Reconnecting in ${left} s` : 'Reconnecting…'}`, icon: 'cloud-off', warn: true, action: retry };
    }
    case 'no-host':
      return { text: "The host's edit command is not running", icon: 'warning', warn: true, action: retry };
    default:
      // a line that asks the person to act is not hidden behind a note
      const note = client.app.note?.warn ? client.app.note.text : undefined;
      // the one place for a warning of the edit command, e.g. that it cannot write index.html
      if (client.warning) return { text: client.warning, icon: 'warning', warn: true, action: null, note };
      const failed = failedLine(client);
      if (failed) return { text: failed, icon: 'warning', warn: true, action: 'upload', note };
      const lost = lostLine(client);
      if (lost) return { text: lost, icon: 'warning', warn: true, action: null, note };
      if (note) return { text: '', icon: 'warning', warn: true, action: null, note };
      if (client.saving) return { text: 'Saving…', icon: 'cloud', warn: false, action: null };
      const restored = restoredLine(client);
      if (restored) return { text: restored, icon: 'cloud', warn: false, action: null };
      return { text: client.host ? 'Saved to index.html' : 'Saved', icon: 'cloud', warn: false, action: null };
  }
}

const ACTIONS = { retry: ['Try now', 'Reconnect now'], reload: ['Load again', 'Load the page again'], upload: ['Try again', 'Send the file again'] } as const;

export function install(client: Client): void {
  style('state', CSS);
  const button = make('button', 'beeson-session-state');
  button.type = 'button';
  const name = make('span', 'name');
  const action = make('button', 'beeson-session-action');
  action.type = 'button';
  action.hidden = true;
  const label = make('span');
  action.append(label);
  client.shell.bar.append(button, action);

  let shown = '';
  let icon = '';
  let doing: Action = null;
  const draw = () => {
    if (client.connection === 'ended') {
      button.remove();
      action.remove();
      return;
    }
    const v = view(client);
    if (v.icon !== icon) {
      icon = v.icon;
      button.replaceChildren(client.shell.icon(icon, 14), name);
    }
    button.classList.toggle('warn', v.warn);
    action.hidden = !v.action;
    if (v.action && v.action !== doing) [label.textContent, action.title] = ACTIONS[v.action];
    doing = v.action;
    const text = v.text && v.note ? `${v.text.replace(/\.$/, '')}. ${v.note}` : v.text || v.note!;
    if (text === shown) return;
    shown = text;
    name.textContent = text;
    button.setAttribute('aria-label', text);
    button.title = text;
    client.port.setStatus(v.text || null);
  };
  button.setAttribute('aria-haspopup', 'menu');
  let menu: OpenMenu | null = null;
  button.addEventListener('click', (ev) => {
    if (menu) return menu.close();
    const items = client.retryAt === null ? ITEMS : [{ label: 'Try Now', run: () => client.tryNow() }, ...ITEMS];
    if (client.blocked) client.loadAgain();
    else if (doing === 'upload') retryUpload(client);
    else if (items.length) {
      const m = client.shell.menu(items, {
        anchor: button.getBoundingClientRect(),
        placement: 'below',
        owner: button,
        keyboard: ev.detail === 0,
        label: button.getAttribute('aria-label') ?? undefined,
        onClose: () => {
          if (menu === m) menu = null;
        },
      });
      menu = m;
    } else void client.flush().catch(() => {});
  });
  action.addEventListener('click', () => {
    if (doing === 'reload') client.loadAgain();
    else if (doing === 'upload') retryUpload(client);
    else client.tryNow();
  });
  client.on('state', draw);
  client.on('me', draw);
  client.app.listen('report', draw);
  draw();
}
