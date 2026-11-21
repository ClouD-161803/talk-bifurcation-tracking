import type { AsideInfo, Restored } from '../protocol.ts';
import type { Client } from './client.ts';
import { bdi } from './dom.ts';
import { stopFollowing } from './follow.ts';
import { personOf, whenOf } from './labels.ts';
import { presenceOf } from './presence.ts';
import { addStateItem } from './state.ts';
import { mountToasts, toast } from './toast.ts';

export type HistoryHost = { toast: typeof toast; stopFollowing: typeof stopFollowing; presenceOf: typeof presenceOf };
export type HistoryPane = { open(aside?: string): void; defer(): Promise<void> | null };
export type HistoryEntry = { install(client: Client, host: HistoryHost): HistoryPane };

const PRELOAD_AFTER_JOIN = 3000;

let current: Client | null = null;
let opener: ((aside?: string) => void) | null = null;

export async function setAside(text: string, reason: string): Promise<AsideInfo> {
  const client = current;
  if (!client?.token) throw new Error('The page is not in a session');
  const aside = await client.transport.post<AsideInfo>('aside', { token: client.token, text });
  toast(reason ? `${reason} It is kept under Set aside in Version History.` : 'Your text is kept under Set aside in Version History.', { label: 'Show', run: () => opener?.(aside.id) });
  return aside;
}

export function install(client: Client): void {
  current = client;
  const shell = client.shell.history;
  let pane: HistoryPane | null = null;
  let loading: Promise<HistoryPane> | null = null;

  const loadPane = (): Promise<HistoryPane> =>
    (loading ??= shell.load().then(() => {
      const entry = (window as { BeesonHistory?: HistoryEntry }).BeesonHistory;
      if (!entry) throw new Error('theme/session-history.js did not start');
      return (pane = entry.install(client, { toast, stopFollowing, presenceOf }));
    }).catch((e: unknown) => {
      loading = null;
      throw e;
    }));

  function open(aside?: string): void {
    if (client.connection === 'ended') return;
    if (pane) return pane.open(aside);
    loadPane().then(
      (p) => p.open(aside),
      (e: unknown) => {
        const d = client.shell.dialog({ title: 'Version History could not be loaded', text: e instanceof Error ? e.message : String(e), buttons: [{ label: 'OK', value: 'ok', primary: true }] });
        void d.open().then(() => d.el.remove());
      },
    );
  }

  mountToasts();
  shell.onCommand(() => open());
  opener = open;
  addStateItem({ label: 'Version History', run: () => open() });
  client.hooks.defer = () => pane?.defer() ?? null;
  client.on('hello', () => void setTimeout(() => void loadPane().catch(() => {}), PRELOAD_AFTER_JOIN));
  client.on('restored', (r: Restored) => {
    if (r.by === client.person) return;
    toast([bdi(personOf(client, r.by)?.name ?? 'Someone'), ` restored the version of ${whenOf(r.time)}`]);
  });
  client.on('overwritten', () => toast('index.html was changed outside the editor, and text of this session was replaced. This text is kept in Version History.', { label: 'Show', run: () => open() }));
}
