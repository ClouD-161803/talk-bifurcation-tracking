// the save state of a session, a button in .right of the title bar in place of Autosave, whose
// text is given to the status bar as well. a click on it while offline reconnects at once, and
// otherwise it saves, which in a session waits for the acknowledgments. a second button beside it
// is Try now while a reconnect waits, and Load again while the page is blocked

import { BLOCKED, type Client } from './client.ts';
import { make, style } from './dom.ts';

// the hit area is 32 px high, around a button of 22 px. in a title bar narrower than its menus, e.g.
// on a phone, the buttons at the right are kept in view over the last menus
const CSS = `
.beeson-edit-titlebar .right button.beeson-session-state, .beeson-edit-titlebar .right button.beeson-session-action { position: relative; }
.beeson-edit-titlebar .right button.beeson-session-state::after, .beeson-edit-titlebar .right button.beeson-session-action::after { content: ''; position: absolute; inset: -5px -2px; }
.beeson-edit-titlebar .right button.beeson-session-state svg { flex: none; color: var(--ed-muted); }
.beeson-edit-titlebar .right button.beeson-session-state.warn svg { color: var(--ed-guide); }
.beeson-edit-titlebar .right button.beeson-session-action { border: 1px solid var(--ed-control-line); background: var(--ed-control); }
.beeson-edit-titlebar.narrow .right { position: sticky; right: 0; padding-left: 6px; background: var(--ed-bg); }
`;

type Action = 'retry' | 'reload' | null;
type View = { text: string; icon: string; warn: boolean; action: Action };

function view(client: Client): View {
  const retry: Action = client.retryAt === null ? null : 'retry';
  if (client.blocked) return { text: BLOCKED, icon: 'warning', warn: true, action: 'reload' };
  switch (client.connection) {
    case 'joining':
      return { text: 'Joining…', icon: 'cloud', warn: false, action: retry };
    case 'offline': {
      const left = client.retryAt === null ? 0 : Math.max(0, Math.ceil((client.retryAt - Date.now()) / 1000));
      return { text: `Offline. ${left ? `Reconnecting in ${left} s` : 'Reconnecting…'}`, icon: 'cloud-off', warn: true, action: retry };
    }
    case 'no-host':
      return { text: "The host's edit command is not running", icon: 'warning', warn: true, action: retry };
    default:
      // the one place for a warning of the edit command, e.g. that it cannot write index.html
      if (client.warning) return { text: client.warning, icon: 'warning', warn: true, action: null };
      if (client.saving) return { text: 'Saving…', icon: 'cloud', warn: false, action: null };
      return { text: client.host ? 'Saved to index.html' : 'Saved', icon: 'cloud', warn: false, action: null };
  }
}

const ACTIONS = { retry: ['Try now', 'Reconnect now'], reload: ['Load again', 'Load the page again'] } as const;

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
    if (v.text === shown) return;
    shown = v.text;
    name.textContent = v.text;
    button.setAttribute('aria-label', v.text);
    button.title = v.text;
    client.port.setStatus(v.text);
  };
  button.addEventListener('click', () => {
    if (client.blocked) location.reload();
    else if (client.retryAt !== null) client.tryNow();
    else void client.flush().catch(() => {});
  });
  action.addEventListener('click', () => {
    if (doing === 'reload') location.reload();
    else client.tryNow();
  });
  client.on('state', draw);
  client.on('me', draw);
  draw();
}
