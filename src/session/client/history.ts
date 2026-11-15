// the Version History pane of a session. File > Version History, its key, or the menu of the save
// state puts the editor into a mode, in which the pane takes the place of the inspector and the
// rest of the chrome is inert, see src/editor/session/history-mode.ts. the list holds Current
// version, the versions newest first under day headings, and the texts set aside. a click on a
// version or on a text set aside shows it in a preview over the canvas, see preview.ts, from which
// the person restores, names, or downloads it. the applies of the others go on under the mode

import { parseVersion, VERSION_NAME_MAX, type AsideInfo, type HistoryAnswer, type Restored, type RestoreAnswer, type Version, type VersionInfo } from '../protocol.ts';
import type { Client } from './client.ts';
import { make, style } from './dom.ts';
import { stopFollowing } from './follow.ts';
import { authorsOf, dayLabel, personOf, slidesText, timeOf, whenOf } from './labels.ts';
import { presenceOf } from './presence.ts';
import { Preview } from './preview.ts';
import { addStateItem } from './state.ts';
import { toast } from './toast.ts';

// unnamed versions closer than FOLD ms fold under the newest of them
const FOLD = 30 * 60_000;
// the longest wait in ms for the apply of a restore before the mode ends
const RESTORE_WAIT = 5000;

const STYLE = `
html.beeson-editor.beeson-history { --ed-insp-col: 288px; }
html.beeson-editor.beeson-history body > .beeson-edit-inspector { display: none; }
html.beeson-editor body > .beeson-session-history { grid-area: insp; position: relative; z-index: 50; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; background: var(--ed-panel); border-left: 1px solid var(--ed-line); color: var(--ed-text); font: 12px/1.4 var(--ed-font); }
html.beeson-editor body > .beeson-session-history[hidden] { display: none; }
@media (max-width: 855.98px) {
  html.beeson-editor.beeson-history { --ed-nav-col: 0px; }
  html.beeson-editor.beeson-history body > :is(.beeson-edit-nav, .beeson-edit-nav-edge) { display: none; }
}
@media (max-width: 599.98px) {
  html.beeson-editor.beeson-history { --ed-insp-col: 0px; }
  html.beeson-editor body > .beeson-session-history { position: fixed; left: 0; right: 0; bottom: 28px; height: 55vh; height: 55dvh; z-index: 70; border-left: 0; border-top: 1px solid var(--ed-line); box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.18); }
}
.beeson-session-history button, .beeson-session-preview button { font: inherit; color: inherit; }
.beeson-session-history :is(button, input):focus-visible, .beeson-session-preview :is(button, input):focus-visible { outline: 2px solid var(--ed-focus); outline-offset: -2px; }
.beeson-session-history .head { display: flex; align-items: center; gap: 8px; padding: 8px 8px 4px 14px; }
.beeson-session-history h2 { flex: 1; min-width: 0; margin: 0; font: 600 13px/1.3 var(--ed-font); }
.beeson-session-history .back, .beeson-session-history .name-current, .beeson-session-preview .bar button { min-height: 32px; padding: 0 10px; border: 1px solid var(--ed-control-line); border-radius: 6px; background: var(--ed-control); white-space: nowrap; }
.beeson-session-history label.named { display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 0 14px; }
.beeson-session-history label.named input { margin: 0; width: 16px; height: 16px; }
.beeson-session-history h3 { margin: 12px 14px 4px; color: var(--ed-muted); font: 600 11px/1.3 var(--ed-font); }
.beeson-session-history .rows { display: flex; flex-direction: column; padding: 0 6px; }
.beeson-session-history .row { display: flex; flex-direction: column; align-items: stretch; gap: 2px; min-height: 40px; box-sizing: border-box; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; text-align: left; }
.beeson-session-history .row:hover { background: var(--ed-hover); }
.beeson-session-history .row[aria-current="true"] { background: var(--ed-pressed); }
.beeson-session-history .row .title { font-weight: 600; overflow-wrap: anywhere; }
.beeson-session-history .row .sub, .beeson-session-history .row .slides { color: var(--ed-muted); }
.beeson-session-history .who { display: flex; flex-wrap: wrap; gap: 2px 10px; }
.beeson-session-history .who > span, .beeson-session-preview .who > span { display: inline-flex; align-items: center; gap: 5px; min-width: 0; overflow-wrap: anywhere; }
.beeson-session-history .dot, .beeson-session-preview .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; }
.beeson-session-history .fold { align-self: flex-start; min-height: 32px; margin: 0 0 2px 8px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--ed-muted); }
.beeson-session-history .fold:hover { background: var(--ed-hover); }
.beeson-session-history .folded { display: flex; flex-direction: column; padding-left: 12px; }
.beeson-session-history .folded[hidden] { display: none; }
.beeson-session-history .name-current { align-self: flex-start; margin: 2px 8px 0; }
.beeson-session-history .empty { margin: 8px 14px; color: var(--ed-muted); }
.beeson-session-history .aside-list[hidden] { display: none; }
dialog.beeson-session-history-dialog input { display: block; width: 100%; box-sizing: border-box; height: 32px; margin: 0 0 16px; padding: 0 8px; border: 1px solid var(--ed-control-line); border-radius: 6px; background: var(--ed-control); color: var(--ed-text); font: inherit; }
dialog.beeson-session-history-dialog .row button { min-height: 32px; }
`;

type Selected = { kind: 'current' } | { kind: 'version'; id: string } | { kind: 'aside'; id: string };

let current: Client | null = null;
let opener: ((aside?: string) => void) | null = null;

const dayKey = (t: number) => new Date(t).toDateString();

// the versions in groups: a named version alone, and unnamed versions closer than FOLD under the
// newest of them, which do not cross a day
export function foldsOf(versions: VersionInfo[]): { head: VersionInfo; rest: VersionInfo[] }[] {
  const out: { head: VersionInfo; rest: VersionInfo[] }[] = [];
  for (const v of versions) {
    const last = out[out.length - 1];
    const prev = last ? last.rest[last.rest.length - 1] ?? last.head : null;
    if (last && prev && !v.name && !last.head.name && prev.time - v.time < FOLD && dayKey(prev.time) === dayKey(v.time)) last.rest.push(v);
    else out.push({ head: v, rest: [] });
  }
  return out;
}

// a text set aside at a conflict, so that it is not lost, with reason shown in a toast that leads
// to it under Set aside in Version History. rejects when the page is not in a session or the edit
// command refused the text
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
  let pane: HTMLElement | null = null;
  let list: HTMLElement;
  let asideHead: HTMLElement;
  let asideList: HTMLElement;
  let named: HTMLInputElement;
  let preview: Preview | null = null;
  let answer: HistoryAnswer | null = null;
  let failed = false;
  let stale = true;
  let loading: Promise<void> | null = null;
  let on = false;
  let selected: Selected = { kind: 'current' };
  const opened = new Set<string>();
  let back: Element | null = null;

  function build(): HTMLElement {
    style('history', STYLE);
    const el = make('div', 'beeson-session-history');
    el.setAttribute('role', 'complementary');
    el.setAttribute('aria-label', 'Version History');
    el.hidden = true;
    const head = make('div', 'head');
    const title = make('h2', '', 'Version History');
    const backButton = make('button', 'back', 'Back to editor');
    backButton.type = 'button';
    backButton.addEventListener('click', () => close());
    head.append(title, backButton);
    const label = make('label', 'named');
    named = make('input');
    named.type = 'checkbox';
    named.addEventListener('change', render);
    label.append(named, document.createTextNode('Only show named versions'));
    list = make('div', 'rows versions');
    asideHead = make('h3', 'aside-head', 'Set aside');
    asideList = make('div', 'rows aside-list');
    el.append(head, label, list, asideHead, asideList);
    // a drop on the pane is not a drop on the deck
    el.addEventListener('dragover', (ev) => ev.preventDefault());
    (shell.inspector ?? document.body.lastElementChild)?.after(el);
    return el;
  }

  async function load(): Promise<void> {
    if (loading) return loading;
    // a read that fails is made again when stale is set meanwhile, e.g. by the hello of a reconnect
    loading = (async () => {
      while (stale) {
        stale = false;
        try {
          answer = await client.transport.get<HistoryAnswer>('history', { token: client.token });
          failed = false;
        } catch {
          failed = true;
        }
      }
      loading = null;
      render();
    })();
    return loading;
  }

  function row(className: string, select: Selected, parts: (Node | string)[]): HTMLButtonElement {
    const b = make('button', `row ${className}`);
    b.type = 'button';
    const id = select.kind === 'current' ? 'current' : `${select.kind}:${select.id}`;
    b.dataset.id = id;
    const is = selected.kind === select.kind && (select.kind === 'current' || (selected as { id: string }).id === select.id);
    b.setAttribute('aria-current', String(is));
    b.append(...parts);
    b.addEventListener('click', () => choose(select));
    return b;
  }

  function versionRow(v: VersionInfo): HTMLButtonElement {
    const parts: (Node | string)[] = [make('span', 'title', v.name ?? timeOf(v.time))];
    if (v.name) parts.push(make('span', 'sub', timeOf(v.time)));
    if (v.restored) {
      const was = answer?.versions.find((x) => x.id === v.restored);
      parts.push(make('span', 'sub', was ? `Restored the version of ${whenOf(was.time)}` : 'Restored an earlier version'));
    }
    parts.push(authorsOf(client, v.authors));
    if (v.slides.length) parts.push(make('span', 'slides', slidesText(v.slides)));
    return row('version', { kind: 'version', id: v.id }, parts);
  }

  function render(): void {
    if (!pane || !on) return;
    const focused = document.activeElement instanceof HTMLElement && pane.contains(document.activeElement) ? document.activeElement.dataset.id ?? null : null;
    const nodes: Node[] = [row('current', { kind: 'current' }, [make('span', 'title', 'Current version')])];
    const nameCurrent = make('button', 'name-current', 'Name this version');
    nameCurrent.type = 'button';
    nameCurrent.addEventListener('click', () => void name('current', ''));
    nodes.push(nameCurrent);
    const versions = (answer?.versions ?? []).filter((v) => !named.checked || v.name);
    if (failed) nodes.push(make('p', 'empty', 'The versions cannot be read while the page is offline.'));
    if (!answer) {
      if (!failed) nodes.push(make('p', 'empty', 'Loading versions…'));
    } else if (!versions.length) nodes.push(make('p', 'empty', named.checked && answer.versions.length ? 'No named versions yet.' : 'No earlier versions yet.'));
    let day = '';
    for (const fold of foldsOf(versions)) {
      const label = dayLabel(fold.head.time);
      if (label !== day) nodes.push(make('h3', 'day', (day = label)));
      nodes.push(versionRow(fold.head));
      if (!fold.rest.length) continue;
      const key = fold.head.id;
      if (selected.kind === 'version' && fold.rest.some((v) => v.id === (selected as { id: string }).id)) opened.add(key);
      const more = make('button', 'fold');
      more.type = 'button';
      const inner = make('div', 'folded');
      const draw = () => {
        const shown = opened.has(key);
        more.textContent = `${shown ? 'Hide' : 'Show'} ${fold.rest.length} more`;
        more.setAttribute('aria-expanded', String(shown));
        inner.hidden = !shown;
      };
      more.addEventListener('click', () => {
        if (!opened.delete(key)) opened.add(key);
        draw();
      });
      inner.append(...fold.rest.map(versionRow));
      draw();
      nodes.push(more, inner);
    }
    list.replaceChildren(...nodes);
    const asides = answer?.aside ?? [];
    asideHead.hidden = asideList.hidden = !asides.length;
    asideList.replaceChildren(...asides.map((a) => row('aside', { kind: 'aside', id: a.id }, [make('span', 'title', `${dayLabel(a.time)}, ${timeOf(a.time)}`), authorsOf(client, [a.author])])));
    if (focused) pane.querySelector<HTMLElement>(`[data-id="${CSS.escape(focused)}"]`)?.focus();
    showSelected();
  }

  function showSelected(): void {
    if (selected.kind === 'current') {
      preview?.hide();
      return;
    }
    const id = selected.id;
    const info = selected.kind === 'version' ? answer?.versions.find((v) => v.id === id) : answer?.aside.find((a) => a.id === id);
    if (!info) return;
    preview ??= new Preview(client, pane!, { restore, name: (v) => void name(v.id, v.name ?? '') });
    if (selected.kind === 'version') preview.showVersion(info as VersionInfo);
    else preview.showAside(info as AsideInfo);
  }

  function choose(select: Selected): void {
    selected = select;
    render();
  }

  function open(aside?: string): void {
    if (client.connection === 'ended') return;
    pane ??= build();
    if (aside) selected = { kind: 'aside', id: aside };
    if (!on) {
      on = true;
      back = document.activeElement;
      if (!aside) selected = { kind: 'current' };
      pane.hidden = false;
      // the person stops following in this mode, and the others see the mode in the pill of following
      stopFollowing();
      presenceOf(client)?.set({ mode: 'history' });
      shell.setMode(true, close);
      stale = true;
    }
    render();
    pane.querySelector<HTMLElement>(aside ? `[data-id="aside:${CSS.escape(aside)}"]` : '.row.current')?.focus();
    void load();
  }

  function close(): void {
    if (!on || !pane) return;
    on = false;
    pane.hidden = true;
    preview?.hide();
    shell.setMode(false);
    presenceOf(client)?.set({ mode: 'edit' });
    if (back instanceof HTMLElement && back.isConnected && !back.closest('[inert]')) back.focus();
    back = null;
  }

  function fail(title: string, e: unknown): void {
    const d = client.shell.dialog({ title, text: e instanceof Error ? e.message : String(e), buttons: [{ label: 'OK', value: 'ok', primary: true }], className: 'beeson-session-history-dialog' });
    void d.open('ok').then(() => d.el.remove());
  }

  async function name(id: string, was: string): Promise<void> {
    const input = make('input');
    input.type = 'text';
    input.maxLength = VERSION_NAME_MAX;
    input.value = was;
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Name of the version');
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.isComposing) {
        ev.preventDefault();
        d.close('save');
      }
    });
    const body = make('div');
    body.append(input);
    const d = client.shell.dialog({
      title: 'Name this version',
      body,
      buttons: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Save', value: 'save', primary: true },
      ],
      className: 'beeson-session-history-dialog',
    });
    const value = await d.open();
    d.el.remove();
    if (value !== 'save') return;
    try {
      const v = await client.transport.post<VersionInfo>(`history/${encodeURIComponent(id)}/name`, { token: client.token, name: input.value });
      if (answer) {
        const at = answer.versions.findIndex((x) => x.id === v.id);
        if (at >= 0) answer.versions[at] = v;
        else answer.versions.unshift(v);
      }
      stale = true;
      render();
      void load();
    } catch (e) {
      fail('The version could not be named', e);
    }
  }

  // resolves once the deck holds the operation of a restore, at version v of the answer
  function reached(v: Version, text: string | null): Promise<void> {
    const want = parseVersion(v);
    return new Promise((done) => {
      let applied = false;
      const check = () => {
        const have = parseVersion(client.version);
        const past = !want || !have || have.epoch !== want.epoch || have.n >= want.n;
        if (past && (applied || (text !== null && client.port.text() === text))) finish();
      };
      const off = client.on('applied', () => {
        applied = true;
        check();
      });
      const timer = window.setInterval(check, 100);
      const limit = window.setTimeout(() => finish(), RESTORE_WAIT);
      function finish(): void {
        off();
        clearInterval(timer);
        clearTimeout(limit);
        done();
      }
      check();
    });
  }

  async function restore(v: VersionInfo, text: string | null): Promise<void> {
    const d = client.shell.dialog({
      title: 'Restore this version?',
      text: `The deck goes back to how it was ${dayLabel(v.time) === 'Today' ? 'at' : 'on'} ${whenOf(v.time).replace(', ', ' at ')}. The current version stays in the history.`,
      buttons: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Restore', value: 'restore', primary: true },
      ],
      className: 'beeson-session-history-dialog',
    });
    const value = await d.open('restore');
    d.el.remove();
    if (value !== 'restore') return;
    try {
      const a = await client.transport.post<RestoreAnswer>(`history/${encodeURIComponent(v.id)}/restore`, { token: client.token });
      await reached(a.v, text);
      close();
    } catch (e) {
      fail('The version could not be restored', e);
    }
  }

  shell.onCommand(() => open());
  opener = open;
  addStateItem({ label: 'Version History', run: () => open() });
  client.on('history', (rev) => {
    if (answer && rev === answer.rev) return;
    stale = true;
    if (on) void load();
  });
  client.on('hello', () => {
    stale = true;
    if (on) void load();
  });
  client.on('known', render);
  client.on('state', () => {
    if (on && failed && client.connection === 'online') {
      stale = true;
      void load();
    }
  });
  client.on('restored', (r: Restored) => {
    if (r.by === client.person) return;
    toast(`${personOf(client, r.by)?.name ?? 'Someone'} restored the version of ${whenOf(r.time)}`);
  });
  client.on('ended', () => close());
}
