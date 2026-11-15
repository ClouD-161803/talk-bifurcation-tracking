// the Version History pane of a session. File > Version History, its key, or the menu of the save
// state puts the editor into a mode, in which the pane takes the place of the inspector and the
// rest of the chrome is inert, see src/editor/session/history-mode.ts. the list holds Current
// version, the versions newest first under day headings, and the texts set aside. a click on a
// version or on a text set aside shows it in a preview over the canvas, see preview.ts, from which
// the person restores, names, or downloads it. the applies of the others go on under the mode

import { parseVersion, VERSION_NAME_MAX, type AsideInfo, type HistoryAnswer, type Restored, type RestoreAnswer, type Version, type VersionInfo } from '../protocol.ts';
import type { Client } from './client.ts';
import { bdi, make, style } from './dom.ts';
import { stopFollowing } from './follow.ts';
import { authorsOf, dateOf, dayLabel, personOf, slidesText, timeOf, whenOf } from './labels.ts';
import { presenceOf } from './presence.ts';
import { Preview } from './preview.ts';
import { addStateItem } from './state.ts';
import { mountToasts, toast } from './toast.ts';

// unnamed versions closer than FOLD ms fold under the newest of them
const FOLD = 30 * 60_000;
// the longest wait in ms for the apply of a restore before the mode ends
const RESTORE_WAIT = 5000;

const STYLE = `
html.beeson-editor.beeson-history { --ed-insp-col: 288px; }
html.beeson-editor.beeson-history body > .beeson-edit-inspector { display: none; }
html.beeson-editor body > .beeson-session-history { grid-area: insp; position: relative; z-index: 50; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; overflow-anchor: none; background: var(--ed-panel); border-left: 1px solid var(--ed-line); color: var(--ed-text); font: 12px/1.4 var(--ed-font); }
html.beeson-editor body > .beeson-session-history[hidden] { display: none; }
@media (max-width: 855.98px) {
  html.beeson-editor.beeson-history { --ed-nav-col: 0px; }
  html.beeson-editor.beeson-history body > :is(.beeson-edit-nav, .beeson-edit-nav-edge) { display: none; }
}
@media (max-width: 599.98px) {
  html.beeson-editor.beeson-history { --ed-insp-col: 0px; }
  html.beeson-editor body > .beeson-session-history { position: fixed; left: 0; right: 0; bottom: 28px; height: 55vh; height: 55dvh; z-index: 70; border-left: 0; border-top: 1px solid var(--ed-line); box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.18); }
  /* while a version is previewed, the sheet shrinks to the row of the version and Versions */
  html.beeson-editor body > .beeson-session-history.peek { height: auto; max-height: 55vh; max-height: 55dvh; padding-bottom: 6px; }
  .beeson-session-history.peek > :not(.head, .rows), .beeson-session-history.peek .rows > :not(.row[aria-current="true"], .folded), .beeson-session-history.peek .folded > :not([aria-current="true"]) { display: none; }
  .beeson-session-history.peek .show-list { display: block; }
}
.beeson-session-history .show-list { display: none; min-height: 32px; padding: 0 10px; border: 1px solid var(--ed-control-line); border-radius: 6px; background: var(--ed-control); white-space: nowrap; }
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
dialog.beeson-session-history-dialog .count { margin: -8px 0 16px; color: var(--ed-error); }
`;

type Selected = { kind: 'current' } | { kind: 'version'; id: string } | { kind: 'aside'; id: string };

let current: Client | null = null;
let opener: ((aside?: string) => void) | null = null;

const dayKey = (t: number) => new Date(t).toDateString();
const keyOf = (s: Selected) => (s.kind === 'current' ? 'current' : `${s.kind}:${s.id}`);

// the children of parent made nodes, in order, with each node that is in place left alone, since a
// node moved or written again loses the focus and is read again by a screen reader
function place(parent: Element, nodes: Node[]): void {
  const want = new Set(nodes);
  for (const c of [...parent.childNodes]) if (!want.has(c)) c.remove();
  let at = parent.firstChild;
  for (const n of nodes) {
    if (n === at) at = at.nextSibling;
    else parent.insertBefore(n, at);
  }
}

// the versions in groups: a named version and the start of the history alone, and unnamed versions
// closer than FOLD under the newest of them, which do not cross a day
export function foldsOf(versions: VersionInfo[]): { head: VersionInfo; rest: VersionInfo[] }[] {
  const out: { head: VersionInfo; rest: VersionInfo[] }[] = [];
  for (const v of versions) {
    const last = out[out.length - 1];
    const prev = last ? last.rest[last.rest.length - 1] ?? last.head : null;
    if (last && prev && !v.name && !v.start && !last.head.name && prev.time - v.time < FOLD && dayKey(prev.time) === dayKey(v.time)) last.rest.push(v);
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
  const restoreWait = Number(new URLSearchParams(location.search).get('session-restore-wait')) || RESTORE_WAIT;
  let pane: HTMLElement | null = null;
  let list: HTMLElement;
  let asideHead: HTMLElement;
  let asideList: HTMLElement;
  let named: HTMLInputElement;
  let nameCurrent: HTMLButtonElement;
  let preview: Preview | null = null;
  let answer: HistoryAnswer | null = null;
  let failed = false;
  let stale = true;
  let loading: Promise<void> | null = null;
  let on = false;
  let selected: Selected = { kind: 'current' };
  // the sheet of a phone shows the chosen version alone, until Versions is pressed
  let peek = false;
  const opened = new Set<string>();
  let back: Element | null = null;
  // the time of the version last shown in the preview, which a toast names when it is merged
  let shownTime: number | null = null;
  let midnight = 0;
  let naming = false;
  // a reload of the page deferred until the mode ends, see hooks.defer below
  let release: (() => void) | null = null;
  let deferred: Promise<void> | null = null;
  // the nodes of the list kept between renders by key, hence a new answer writes only what changed
  const rows = new Map<string, { el: HTMLButtonElement; sig: string }>();
  const folds = new Map<string, { button: HTMLButtonElement; inner: HTMLElement }>();
  const heads = new Map<string, HTMLElement>();
  const notes = new Map<string, HTMLElement>();
  const used = new Set<string>();

  mountToasts();

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
    const showList = make('button', 'show-list', 'Versions');
    showList.type = 'button';
    showList.addEventListener('click', () => {
      peek = false;
      el.classList.remove('peek');
      el.querySelector<HTMLElement>('.row[aria-current="true"]')?.focus();
    });
    head.append(title, showList, backButton);
    const label = make('label', 'named');
    named = make('input');
    named.type = 'checkbox';
    named.addEventListener('change', render);
    label.append(named, document.createTextNode('Only show named versions'));
    list = make('div', 'rows versions');
    nameCurrent = make('button', 'name-current', 'Name this version');
    nameCurrent.type = 'button';
    nameCurrent.dataset.id = 'name-current';
    nameCurrent.addEventListener('click', () => void name('current', ''));
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

  const isSelected = (s: Selected) => selected.kind === s.kind && (s.kind === 'current' || (selected as { id: string }).id === s.id);

  // the row of select, written again only when sig, what it shows, changed
  function row(className: string, select: Selected, sig: string, parts: () => (Node | string)[]): HTMLButtonElement {
    const id = keyOf(select);
    let r = rows.get(id);
    if (!r) {
      const b = make('button', `row ${className}`);
      b.type = 'button';
      b.dataset.id = id;
      b.addEventListener('click', () => choose(select));
      r = { el: b, sig: '' };
      rows.set(id, r);
    }
    if (r.sig !== sig) {
      r.el.replaceChildren(...parts());
      r.sig = sig;
    }
    const is = String(isSelected(select));
    if (r.el.getAttribute('aria-current') !== is) r.el.setAttribute('aria-current', is);
    used.add(id);
    return r.el;
  }

  function versionRow(v: VersionInfo): HTMLButtonElement {
    const was = v.restored ? answer?.versions.find((x) => x.id === v.restored) : undefined;
    const restored = v.restored ? (was ? `Restored the version of ${whenOf(was.time)}` : 'Restored an earlier version') : '';
    const sig = JSON.stringify([v.name, timeOf(v.time), restored, v.start, v.authors.map((a) => personOf(client, a)), v.slides]);
    return row('version', { kind: 'version', id: v.id }, sig, () => {
      const parts: (Node | string)[] = [make('span', 'title', v.name ?? timeOf(v.time))];
      if (v.name) parts.push(make('span', 'sub', timeOf(v.time)));
      if (restored) parts.push(make('span', 'sub', restored));
      parts.push(v.start ? make('span', 'who', 'Start of the history') : authorsOf(client, v.authors));
      if (v.slides.length) parts.push(make('span', 'slides', slidesText(v.slides)));
      return parts;
    });
  }

  function note(text: string): HTMLElement {
    let p = notes.get(text);
    if (!p) notes.set(text, (p = make('p', 'empty', text)));
    used.add(`note:${text}`);
    return p;
  }

  function heading(key: string, label: string): HTMLElement {
    let h = heads.get(key);
    if (!h) heads.set(key, (h = make('h3', 'day')));
    if (h.textContent !== label) h.textContent = label;
    used.add(`day:${key}`);
    return h;
  }

  // the button and the rows of a fold, kept by its oldest version, which a newer version that joins
  // it does not change. its rows are made only while it is open
  function foldOf(fold: { rest: VersionInfo[] }): Node[] {
    const key = fold.rest[fold.rest.length - 1]!.id;
    if (selected.kind === 'version' && fold.rest.some((v) => v.id === (selected as { id: string }).id)) opened.add(key);
    let f = folds.get(key);
    if (!f) {
      const button = make('button', 'fold');
      button.type = 'button';
      button.dataset.id = `fold:${key}`;
      button.addEventListener('click', () => {
        if (!opened.delete(key)) opened.add(key);
        render();
      });
      folds.set(key, (f = { button, inner: make('div', 'folded') }));
    }
    used.add(`fold:${key}`);
    const shown = opened.has(key);
    const text = `${shown ? 'Hide' : 'Show'} ${fold.rest.length} more`;
    if (f.button.textContent !== text) f.button.textContent = text;
    if (f.button.getAttribute('aria-expanded') !== String(shown)) f.button.setAttribute('aria-expanded', String(shown));
    if (f.inner.hidden === shown) f.inner.hidden = !shown;
    place(f.inner, shown ? fold.rest.map(versionRow) : []);
    return [f.button, f.inner];
  }

  // the first node of the pane in view and its top, which stays in place when nodes above it change
  function anchorOf(): { el: Element; top: number } | null {
    if (!pane || pane.scrollTop <= 0) return null;
    const top = pane.getBoundingClientRect().top;
    for (const el of pane.querySelectorAll('.rows > *, .folded > *')) {
      const r = el.getBoundingClientRect();
      if (r.height && r.bottom > top) return { el, top: r.top };
    }
    return null;
  }

  function render(): void {
    if (!pane || !on) return;
    const active = document.activeElement instanceof HTMLElement && pane.contains(document.activeElement) ? document.activeElement : null;
    const anchor = anchorOf();
    // a version or a text set aside that a new answer does not hold, e.g. after a compaction
    let merged: number | null = null;
    let lost = false;
    if (answer && selected.kind !== 'current') {
      const id = selected.id;
      if (!(selected.kind === 'version' ? answer.versions.some((v) => v.id === id) : answer.aside.some((a) => a.id === id))) {
        if (selected.kind === 'version') merged = shownTime;
        lost = !!preview && (preview.el.contains(document.activeElement) || document.activeElement === document.body);
        selected = { kind: 'current' };
      }
    }
    used.clear();
    const nodes: Node[] = [
      row('current', { kind: 'current' }, deferred ? 'deferred' : '', () => {
        const parts: (Node | string)[] = [make('span', 'title', 'Current version')];
        if (deferred) parts.push(make('span', 'sub', 'The deck changed. It is loaded again when Version History is closed.'));
        return parts;
      }),
      nameCurrent,
    ];
    const versions = (answer?.versions ?? []).filter((v) => !named.checked || v.name);
    if (failed) nodes.push(note('The versions cannot be read while the page is offline.'));
    if (!answer) {
      if (!failed) nodes.push(note('Loading versions…'));
    } else if (!versions.length) nodes.push(note(named.checked && answer.versions.length ? 'No named versions yet.' : 'No earlier versions yet.'));
    let day = '';
    for (const fold of foldsOf(versions)) {
      const label = dayLabel(fold.head.time);
      if (label !== day) nodes.push(heading(dayKey(fold.head.time), (day = label)));
      nodes.push(versionRow(fold.head));
      if (fold.rest.length) nodes.push(...foldOf(fold));
    }
    place(list, nodes);
    const asides = answer?.aside ?? [];
    asideHead.hidden = asideList.hidden = !asides.length;
    place(
      asideList,
      asides.map((a) =>
        row('aside', { kind: 'aside', id: a.id }, JSON.stringify([dayLabel(a.time), timeOf(a.time), personOf(client, a.author)]), () => [make('span', 'title', `${dayLabel(a.time)}, ${timeOf(a.time)}`), authorsOf(client, [a.author])]),
      ),
    );
    for (const [map, prefix] of [[rows, ''], [folds, 'fold:'], [heads, 'day:'], [notes, 'note:']] as const) {
      for (const k of map.keys()) if (!used.has(prefix + k)) map.delete(k);
    }
    // a control of the list that was moved has lost the focus
    const id = active?.dataset.id;
    if (active && id && document.activeElement !== active) pane.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus();
    if (anchor?.el.isConnected) pane.scrollTop += anchor.el.getBoundingClientRect().top - anchor.top;
    showSelected();
    if (lost) pane.querySelector<HTMLElement>('.row.current')?.focus();
    if (merged !== null) toast(`The version of ${whenOf(merged)} was merged into a later one.`);
  }

  function showSelected(): void {
    if (selected.kind === 'current') {
      pane?.classList.remove('peek');
      preview?.hide();
      return;
    }
    const id = selected.id;
    const info = selected.kind === 'version' ? answer?.versions.find((v) => v.id === id) : answer?.aside.find((a) => a.id === id);
    pane!.classList.toggle('peek', peek && !!info);
    if (!info) return;
    preview ??= new Preview(client, pane!, { restore, name: (v) => void name(v.id, v.name ?? '') });
    if (selected.kind === 'aside') {
      preview.showAside(info as AsideInfo);
      return;
    }
    const v = info as VersionInfo;
    shownTime = v.time;
    preview.showVersion(v);
  }

  function choose(select: Selected): void {
    selected = select;
    peek = select.kind !== 'current';
    render();
  }

  // the list drawn again at each local midnight while the pane is open, for its day headings
  function arm(): void {
    clearTimeout(midnight);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    midnight = window.setTimeout(() => {
      render();
      arm();
    }, next - now.getTime() + 100);
  }

  function open(aside?: string): void {
    if (client.connection === 'ended') return;
    pane ??= build();
    if (aside) {
      selected = { kind: 'aside', id: aside };
      peek = true;
    }
    if (!on) {
      on = true;
      back = document.activeElement;
      // a control removed by its own click, e.g. the button of a toast, leaves the focus on body
      if (!(back instanceof HTMLElement) || back === document.body || back.closest('.beeson-session-toast')) back = document.querySelector('.beeson-session-state');
      if (!aside) selected = { kind: 'current' };
      pane.hidden = false;
      // a caret left in the inert deck would keep the text held against the others
      getSelection()?.removeAllRanges();
      // the person stops following in this mode, and the others see the mode in the pill of following
      stopFollowing();
      presenceOf(client)?.set({ mode: 'history' });
      shell.setMode(true, close);
      stale = true;
      arm();
    }
    render();
    pane.querySelector<HTMLElement>(aside ? `[data-id="aside:${CSS.escape(aside)}"]` : '.row.current')?.focus();
    void load();
  }

  function close(): void {
    if (!on || !pane) return;
    on = false;
    clearTimeout(midnight);
    pane.hidden = true;
    preview?.hide();
    shell.setMode(false);
    presenceOf(client)?.set({ mode: 'edit' });
    if (back instanceof HTMLElement && back.isConnected && !back.closest('[inert]')) back.focus();
    back = null;
    const go = release;
    release = deferred = null;
    go?.();
  }

  function fail(title: string, e: unknown): void {
    const d = client.shell.dialog({ title, text: e instanceof Error ? e.message : String(e), buttons: [{ label: 'OK', value: 'ok', primary: true }], className: 'beeson-session-history-dialog' });
    void d.open('ok').then(() => d.el.remove());
  }

  // the name of the newest version when the deck has not changed since, which a name of Current
  // version replaces, or an empty text
  async function newestName(): Promise<string> {
    const v = answer?.versions[0];
    const snap = client.snapshot();
    if (!v?.name || !snap || snap.mine !== snap.base) return '';
    try {
      const url = new URL(location.href);
      url.search = `?version=${encodeURIComponent(v.id)}`;
      url.hash = '';
      const r = await fetch(url.href, { cache: 'no-store' });
      const text = r.ok ? (await r.text()).replace(/^﻿/, '') : null;
      const now = client.snapshot();
      return text !== null && now && text === now.base && now.mine === now.base ? v.name : '';
    } catch {
      return '';
    }
  }

  async function name(id: string, was: string): Promise<void> {
    if (naming) return;
    naming = true;
    try {
      await ask(id, id === 'current' ? await newestName() : was);
    } finally {
      naming = false;
    }
  }

  async function ask(id: string, was: string): Promise<void> {
    const input = make('input');
    input.type = 'text';
    input.value = was;
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Name of the version');
    const count = make('p', 'count');
    count.id = 'beeson-session-name-count';
    count.hidden = true;
    const body = make('div');
    body.append(input, count);
    const d = client.shell.dialog({
      title: 'Name this version',
      body,
      buttons: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Save', value: 'save', primary: true },
      ],
      className: 'beeson-session-history-dialog',
    });
    const save = d.buttons.get('save')!;
    // a name is counted in characters as the edit command keeps it. an empty name takes the name of a
    // version off, and under Current version it does nothing
    const update = () => {
      const n = Array.from(input.value.replace(/\s+/g, ' ').trim()).length;
      const over = n > VERSION_NAME_MAX;
      count.hidden = !over;
      count.textContent = over ? `${n} of at most ${VERSION_NAME_MAX} characters` : '';
      if (over) input.setAttribute('aria-describedby', count.id);
      else input.removeAttribute('aria-describedby');
      const label = !n && id !== 'current' && was ? 'Remove name' : 'Save';
      if (save.textContent !== label) save.textContent = label;
      save.disabled = over || (!n && id !== 'current' && !was);
    };
    input.addEventListener('input', update);
    update();
    const answered = d.open();
    input.select();
    const value = await answered;
    d.el.remove();
    if (value !== 'save' || (id === 'current' && !input.value.trim())) return;
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
      const limit = window.setTimeout(() => finish(), restoreWait);
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
    const when = dayLabel(v.time) === 'Today' ? `at ${timeOf(v.time)}` : `on ${dateOf(v.time)} at ${timeOf(v.time)}`;
    const d = client.shell.dialog({
      title: 'Restore this version?',
      text: `The deck goes back to how it was ${when}. The current version stays in the history.`,
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
  // a reload that an apply needs waits for the end of the mode, which Current version says
  client.hooks.defer = () => {
    if (!on) return null;
    if (!deferred) {
      deferred = new Promise((done) => (release = done));
      render();
    }
    return deferred;
  };
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
    toast([bdi(personOf(client, r.by)?.name ?? 'Someone'), ` restored the version of ${whenOf(r.time)}`]);
  });
  client.on('ended', () => close());
}
