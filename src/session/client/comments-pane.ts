import { COMMENT_MAX, MENTION, type Comment } from '../protocol.ts';
import type { Client, Connection } from './client.ts';
import { Badges } from './comments-badges.ts';
import { Comments, itemsOf, stamp, type Item, type Place, type Spot } from './comments.ts';
import { bdi, make, style } from './dom.ts';
import { stopFollowing } from './follow.ts';
import { whenOf } from './labels.ts';
import type { OpenMenu } from '../../editor/ui/menu.ts';
import { initials, inkOf, toneOf } from './people.ts';
import { mountToasts, toast, type ToastButton, type ToastKind } from './toast.ts';
import { Failure } from './transport.ts';

const ENDED = 'The session has ended';
const JOINED = 'Comments can be sent once you have joined';
const UNSENT: Record<Connection, string> = { online: '', ended: ENDED, joining: JOINED, 'no-host': "Comments can be sent once the host's edit command runs", offline: 'Comments can be sent once you are back online' };
const unsent = (c: Client) => (c.connection === 'offline' && c.full ? `The session is full. ${JOINED}` : UNSENT[c.connection]);

const CSS = `
.beeson-comments { display: flex; flex-direction: column; min-height: 0; flex: 1; font: 12px/1.4 var(--ed-font); color: var(--ed-text); }
.beeson-comments .filters { display: flex; gap: 2px; margin: 4px 12px 8px; padding: 2px; border-radius: 7px; background: var(--ed-hover); }
.beeson-comments .filters button { flex: 1; min-height: 32px; border: 0; border-radius: 5px; background: transparent; color: var(--ed-text); font: 500 12px/1.2 var(--ed-font); }
.beeson-comments .filters button[aria-pressed="true"] { background: var(--ed-segment); box-shadow: 0 0.5px 2px rgba(0, 0, 0, 0.2); }
.beeson-comments .list { flex: 1; min-height: 0; overflow: auto; padding: 0 8px 12px; overscroll-behavior: contain; }
.beeson-comments h3 { margin: 10px 4px 4px; color: var(--ed-muted); font: 600 11px/1.3 var(--ed-font); }
.beeson-comments .empty { margin: 16px 8px; color: var(--ed-muted); }
.beeson-comments article, .beeson-comments .draft { position: relative; margin: 0 0 8px; padding: 8px 8px 8px 11px; border: 1px solid var(--ed-line); border-radius: 8px; background: var(--ed-control); outline: none; }
.beeson-comments article:focus-visible, .beeson-comments article.focused { border-color: var(--ed-focus); outline: 2px solid var(--ed-focus); outline-offset: 1px; }
.beeson-comments article.unread { box-shadow: inset 3px 0 0 var(--ed-focus); }
.beeson-comments .item + .item { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--ed-line); }
.beeson-comments .head { display: flex; align-items: center; gap: 6px; min-height: 32px; }
.beeson-comments .avatar { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; font: 600 10px/1 var(--ed-font); }
.beeson-comments .who { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.beeson-comments .time { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ed-muted); }
.beeson-comments .anchor, .beeson-comments .resolved-by { margin: 0 0 4px; color: var(--ed-muted); overflow-wrap: anywhere; }
.beeson-comments .text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.beeson-comments .mention { color: var(--ed-text); font-weight: 600; text-decoration-line: underline; text-decoration-color: var(--ed-select); text-decoration-thickness: 2px; text-underline-offset: 2px; }
.beeson-comments button.icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--ed-muted); }
.beeson-comments button.icon:not(:disabled):hover { background: var(--ed-hover); color: var(--ed-text); }
.beeson-comments :is(button.icon, button.text-button):disabled { color: var(--ed-faint); }
.beeson-comments button.text-button, .beeson-comments .actions button { min-height: 32px; padding: 0 10px; border: 1px solid var(--ed-control-line); border-radius: 6px; background: var(--ed-control); color: var(--ed-text); font: inherit; }
.beeson-comments .actions button.primary { border-color: transparent; background: var(--ed-select); color: var(--ed-on-select); }
.beeson-comments .actions button:disabled { opacity: 0.5; }
.beeson-comments button:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: 1px; }
.beeson-comments .field { position: relative; margin-top: 8px; }
.beeson-comments textarea { display: block; box-sizing: border-box; width: 100%; min-height: 32px; max-height: 160px; padding: 6px 8px; border: 1px solid var(--ed-control-line); border-radius: 6px; background: var(--ed-panel); color: var(--ed-text); font: 16px/1.35 var(--ed-font); resize: none; }
@media (pointer: fine) { .beeson-comments textarea { font-size: 12px; } }
.beeson-comments textarea:focus { outline: 2px solid var(--ed-focus); outline-offset: -1px; }
.beeson-comments .actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px; }
.beeson-comments .reply:not(.open) .actions { display: none; }
.beeson-comments .error { margin: 6px 0 0; color: var(--ed-error); }
.beeson-comments .people { position: absolute; left: 0; right: 0; top: 100%; z-index: 5; margin: 2px 0 0; padding: 4px; border: 1px solid var(--ed-menu-line); border-radius: 8px; background: var(--ed-menu); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2); list-style: none; }
.beeson-comments .people li { display: flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 6px; border-radius: 5px; }
.beeson-comments .people li[aria-selected="true"] { background: var(--ed-select); color: var(--ed-on-select); }
.beeson-comments .people .here { margin-left: auto; font-size: 11px; }
`;

type Filter = 'open' | 'mine' | 'resolved';
const FILTERS: [Filter, string, string][] = [
  ['open', 'Open', 'No open comments.'],
  ['mine', 'For You', 'No open comments for you.'],
  ['resolved', 'Resolved', 'No resolved comments.'],
];

type Mark = { start: number; end: number; person: string };
type Kept = { text: string; marks: Mark[] };
type Field = { box: HTMLElement; area: HTMLTextAreaElement; send: HTMLButtonElement; error: HTMLElement; kept(): Kept; load(kept: Kept): void; reset(): void };

let ids = 0;

class Pane {
  readonly root = make('div', 'beeson-comments');
  private readonly list = make('div', 'list');
  private readonly filters = make('div', 'filters');
  private readonly empty = make('p', 'empty');
  private filter: Filter = 'open';
  private focused: string | null = null;
  private draft: { el: Element | null; slide: Element; box: HTMLElement; label: HTMLElement; field: Field } | null = null;
  private editing: { id: string; reply: string | null; field: Field } | null = null;
  private menu: OpenMenu | null = null;
  private nodes = new Map<string, HTMLElement>();
  private signs = new Map<string, string>();
  private replies = new Map<string, Field>();
  private groups = new Map<Element | string, HTMLElement>();
  private order: string[] = [];
  private drawn = new Map<string, { t: Comment; p: Place | null }>();
  private pending = new Map<string, Kept>();
  private saveTimer = 0;
  private savedAt = -Infinity;
  private restored = false;

  private readonly client: Client;
  private readonly comments: Comments;

  constructor(client: Client, comments: Comments) {
    this.client = client;
    this.comments = comments;
    style('comments', CSS);
    this.filters.setAttribute('role', 'group');
    this.filters.setAttribute('aria-label', 'Show');
    for (const [f, label] of FILTERS) {
      const b = make('button', '', label);
      b.type = 'button';
      b.dataset.filter = f;
      b.addEventListener('click', () => this.setFilter(f));
      this.filters.append(b);
    }
    this.root.append(this.filters, this.list);
    window.addEventListener('pagehide', () => this.write());
    this.root.addEventListener('keydown', (ev) => this.onKey(ev));
    this.root.addEventListener('focusin', (ev) => {
      const article = (ev.target as Element).closest?.('article');
      if (article instanceof HTMLElement && article.dataset.id) this.focus(article.dataset.id, false);
    });
  }

  private get shell() {
    return this.client.shell.comments;
  }

  private nameOf(person: string): string {
    return nameOf(this.client, person);
  }

  private colorOf(person: string): number {
    if (person === this.client.person) return this.client.color;
    return this.client.known.find((k) => k.person === person)?.color ?? 0;
  }

  setFilter(f: Filter): void {
    this.filter = f;
    this.render();
  }

  private visible(t: Comment): boolean {
    if (this.filter === 'resolved') return !!t.resolved;
    if (t.resolved) return this.busy(t);
    return this.filter === 'open' || this.comments.mine(t);
  }

  private busy(t: Comment): boolean {
    const f = this.replies.get(t.id);
    return this.editing?.id === t.id || (!!f && (!!f.area.value.trim() || f.box.contains(document.activeElement)));
  }

  label(t: Comment | null, p: Place | null, el?: Element | null): string {
    if (t?.removed) return t.anchor ? 'On a removed element' : 'On a removed slide';
    const target = el !== undefined ? el : p?.el ?? null;
    if (target) {
      const { kind, text } = this.shell.describe(target);
      return text ? `On ${kind}: ${text}` : `On ${kind}`;
    }
    const n = p ? p.number : null;
    if (t && !t.anchor) return 'On the deck';
    return n === null ? 'On the slide' : `On Slide ${n}`;
  }

  private sorted(places: Map<string, Place>): Comment[] {
    const index = new Map([...document.querySelectorAll('.reveal .slides section')].map((s, i) => [s, i]));
    const key = (t: Comment) => {
      const p = places.get(t.id);
      return p?.slide ? (index.get(p.slide) ?? 0) : -1;
    };
    return [...this.comments.threads.values()].sort((a, b) => key(a) - key(b) || (a.anchor?.start ?? 0) - (b.anchor?.start ?? 0) || a.time - b.time);
  }

  render(): void {
    const had = !!document.activeElement?.closest('.beeson-comments article');
    const give = this.salvage();
    this.retarget();
    for (const b of this.filters.children) {
      const pressed = String((b as HTMLElement).dataset.filter === this.filter);
      if (b.getAttribute('aria-pressed') !== pressed) b.setAttribute('aria-pressed', pressed);
    }
    const places = this.comments.places();
    const shown = this.sorted(places).filter((t) => this.visible(t));
    const want: HTMLElement[] = [];
    if (this.draft) want.push(this.draft.box);
    const groups = new Map<Element | string, HTMLElement>();
    let group: Element | string | null = null;
    for (const t of shown) {
      const p = places.get(t.id) ?? null;
      const g = p?.slide ?? 'On the deck';
      if (g !== group && !groups.has(g)) {
        const text = p?.slide ? (p.number === null ? 'Slide' : `Slide ${p.number}`) : 'On the deck';
        const h = this.groups.get(g) ?? make('h3');
        if (h.textContent !== text) h.textContent = text;
        groups.set(g, h);
        want.push(h);
      }
      group = g;
      want.push(this.thread(t, p));
    }
    this.groups = groups;
    this.empty.textContent = FILTERS.find((f) => f[0] === this.filter)![2];
    if (!shown.length && !this.draft) want.push(this.empty);
    const scroll = this.list.scrollTop;
    const keep = new Set(want);
    for (const child of [...this.list.children]) if (!keep.has(child as HTMLElement)) child.remove();
    const put = (nodes: HTMLElement[], at: Element | null) => {
      for (const node of nodes) {
        if (node === at) at = at.nextElementSibling;
        else this.list.insertBefore(node, at);
      }
    };
    const pin = want.findIndex((n) => n.parentNode === this.list && n.contains(document.activeElement));
    if (pin < 0) put(want, this.list.firstElementChild);
    else {
      put(want.slice(0, pin), this.list.firstElementChild);
      put(want.slice(pin + 1), want[pin].nextElementSibling);
    }
    if (this.list.scrollTop !== scroll) this.list.scrollTop = scroll;
    const before = this.order;
    this.order = shown.map((t) => t.id);
    if (this.focused && !this.order.includes(this.focused)) {
      const at = before.indexOf(this.focused);
      this.focused = at < 0 ? null : this.order[Math.min(at, this.order.length - 1)] ?? null;
    }
    for (const [id, node] of this.nodes) {
      if (!this.comments.threads.has(id)) {
        this.nodes.delete(id);
        this.signs.delete(id);
        this.drawn.delete(id);
      } else {
        const tab = id === (this.focused ?? this.order[0]) ? 0 : -1;
        if (node.tabIndex !== tab) node.tabIndex = tab;
        node.classList.toggle('focused', id === this.focused);
      }
    }
    if (give?.isConnected) give.focus();
    else if (had && !this.list.contains(document.activeElement)) {
      const node = this.focused ? this.nodes.get(this.focused) : null;
      if (node?.isConnected) node.focus({ preventScroll: true });
      else this.filters.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
    }
    this.updateDraft();
  }

  private salvage(): HTMLElement | null {
    let give: HTMLElement | null = null;
    for (const [id, f] of this.replies) {
      if (this.comments.threads.has(id)) continue;
      this.replies.delete(id);
      this.pending.delete(id);
      const edit = this.editing?.id === id ? this.editing.field : null;
      if (edit) this.editing = null;
      const was = this.drawn.get(id);
      const k = [f.kept(), edit?.kept()].find((x) => x && x.text.trim());
      if (!k || !was || was.t.author === this.client.person) continue;
      const focused = f.box.contains(document.activeElement) || !!edit?.box.contains(document.activeElement);
      if (this.draft?.field.area.value.trim()) {
        const d = this.draft.field.kept();
        const at = d.text.length + 2;
        this.draft.field.load({ text: `${d.text}\n\n${k.text}`, marks: [...d.marks, ...k.marks.map((m) => ({ ...m, start: m.start + at, end: m.end + at }))] });
      } else {
        const el = was.p?.el?.isConnected ? was.p.el : null;
        const slide = el?.closest(SLIDES) ?? (was.p?.slide?.isConnected ? was.p.slide : null) ?? this.shell.target().slide;
        if (!slide) continue;
        this.drafted(el, slide);
        this.draft?.field.load(k);
      }
      if (focused) give = this.draft?.field.area ?? null;
      this.keep();
      toast(named(this.nameOf(was.t.author), ' deleted this thread. Your reply is kept as a new comment.'));
    }
    return give;
  }

  private retarget(): void {
    const d = this.draft;
    if (!d || (d.el?.isConnected !== false && d.slide.isConnected)) return;
    const slide = d.slide.isConnected ? d.slide : this.shell.target().slide;
    if (slide) this.drafted(null, slide);
  }

  keep(): void {
    if (this.saveTimer) return;
    this.saveTimer = window.setTimeout(() => this.write(), Math.max(0, this.savedAt + 1000 - performance.now()));
  }

  private write(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    if (!this.restored) return;
    this.savedAt = performance.now();
    const replies: Record<string, Kept> = {};
    for (const [id, k] of this.pending) if (this.comments.threads.has(id)) replies[id] = k;
    for (const [id, f] of this.replies) if (f.area.value.trim()) replies[id] = f.kept();
    const d = this.draft;
    const draft = d?.field.area.value.trim() ? { ...d.field.kept(), ...this.comments.spots(d.el, d.slide) } : null;
    try {
      sessionStorage.setItem(TEXTS, draft || Object.keys(replies).length ? JSON.stringify({ draft, replies }) : '');
    } catch {}
  }

  restore(): void {
    this.restored = true;
    let saved: Saved | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(TEXTS) || 'null') as Saved | null;
    } catch {
      return;
    }
    for (const [id, k] of Object.entries(saved?.replies ?? {})) {
      if (!this.comments.threads.has(id)) continue;
      const f = this.replies.get(id);
      if (!f) this.pending.set(id, k);
      else if (!f.area.value) {
        f.load(k);
        f.box.classList.add('open');
      }
    }
    const d = saved?.draft;
    if (!d?.text || this.draft?.field.area.value) return;
    const el = d.el ? this.comments.spotted(d.el) : null;
    const slide = el?.closest(SLIDES) ?? (d.slide ? this.comments.spotted(d.slide) : null) ?? this.shell.target().slide;
    if (!slide) return;
    this.drafted(el, slide);
    this.draft?.field.load(d);
    this.render();
  }

  private thread(t: Comment, p: Place | null, force = false): HTMLElement {
    let node = this.nodes.get(t.id);
    if (!node) {
      node = make('article');
      node.dataset.id = t.id;
      node.setAttribute('aria-describedby', `beeson-comment-text-${t.id}`);
      node.addEventListener('click', (ev) => {
        if ((ev.target as Element).closest('button, textarea, a, .people')) return;
        this.open(t.id);
      });
      this.nodes.set(t.id, node);
    }
    this.drawn.set(t.id, { t, p });
    const unread = this.comments.unread(t);
    node.classList.toggle('unread', unread);
    node.classList.toggle('focused', this.focused === t.id);
    const aria = `Thread by ${this.nameOf(t.author)}${t.resolved ? ', resolved' : ''}${unread ? ', unread' : ''}`;
    if (node.getAttribute('aria-label') !== aria) node.setAttribute('aria-label', aria);
    const answering = !t.resolved || this.busy(t);
    const names = itemsOf(t).map((i) => `${this.nameOf(i.author)}|${this.colorOf(i.author)}`).join(',');
    const known = this.client.known.map((k) => `${k.person}=${k.name}`).join(',');
    const { anchor: _a, slide: _s, ...shown } = t;
    const sign = JSON.stringify([shown, !!t.anchor, names, known, this.label(t, p), unsent(this.client), answering]);
    if (this.signs.get(t.id) === sign && !force) return node;
    if (this.editing?.id === t.id && !force) return node;
    this.signs.set(t.id, sign);
    const reply = this.replyField(t);
    const parts: HTMLElement[] = [this.item(t, t, true)];
    for (const r of t.replies) parts.push(this.item(t, r, false));
    if (t.resolved) {
      const by = make('p', 'resolved-by', 'Resolved by ');
      by.append(...named(this.nameOf(t.resolved.by), `, ${whenOf(t.resolved.time)}`));
      parts.splice(1, 0, by);
    }
    const keep = answering && node.contains(document.activeElement) && reply.box.contains(document.activeElement);
    const children = [...parts, ...(answering ? [reply.box] : [])];
    if (keep) {
      for (const c of [...node.children]) if (c !== reply.box) c.remove();
      node.prepend(...parts);
    } else node.replaceChildren(...children);
    return node;
  }

  private item(t: Comment, i: Item, root: boolean): HTMLElement {
    const online = this.client.connection === 'online';
    const box = make('div', 'item');
    const head = make('div', 'head');
    const name = this.nameOf(i.author);
    const avatar = make('span', 'avatar', initials(name) || '?');
    avatar.style.background = toneOf(this.colorOf(i.author));
    avatar.style.color = inkOf(this.colorOf(i.author));
    avatar.setAttribute('aria-hidden', 'true');
    const when = make('span', 'time', whenOf(i.time) + (i.edited ? ' (edited)' : ''));
    const who = make('span', 'who', name);
    who.dir = 'auto';
    head.append(avatar, who, when);
    const offline = (b: HTMLButtonElement) => {
      b.disabled = !online;
      if (!online) b.title = unsent(this.client);
      return b;
    };
    if (root) {
      if (t.resolved) head.append(offline(this.button('Reopen', 'Reopen', () => this.act(t.id, 'reopen'), 'text-button')));
      else head.append(offline(this.button('', 'Resolve', () => this.act(t.id, 'resolve'), 'icon resolve', 'check')));
    }
    if (i.author === this.client.person) {
      const items = [
        { label: 'Edit', run: () => this.edit(t, root ? null : i.id) },
        { label: 'Delete', run: () => void this.remove(t, root ? null : i.id) },
      ];
      const more = this.button('⋯', root ? 'Thread actions' : 'Reply actions', (ev) => {
        if (this.menu) return this.menu.close();
        const m = this.client.shell.menu(items, {
          anchor: more.getBoundingClientRect(),
          placement: 'below',
          owner: more,
          keyboard: ev.detail === 0,
          label: more.title,
          onClose: () => {
            if (this.menu === m) this.menu = null;
          },
        });
        this.menu = m;
      }, 'icon more');
      more.setAttribute('aria-haspopup', 'menu');
      head.append(offline(more));
    }
    box.append(head);
    if (root) box.append(make('p', 'anchor', this.label(t, this.comments.places().get(t.id) ?? null)));
    if (this.editing && this.editing.id === t.id && this.editing.reply === (root ? null : i.id)) box.append(this.editing.field.box);
    else {
      const text = this.text(i.text);
      if (root) text.id = `beeson-comment-text-${t.id}`;
      box.append(text);
    }
    return box;
  }

  private button(text: string, label: string, run: (ev: MouseEvent) => void, className: string, icon?: string): HTMLButtonElement {
    const b = make('button', className, text);
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    if (icon) b.append(this.client.shell.icon(icon, 16));
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      run(ev);
    });
    return b;
  }

  private text(raw: string): HTMLElement {
    const p = make('p', 'text');
    p.dir = 'auto';
    raw.split(MENTION).forEach((part, k) => {
      if (k % 2) p.append(make('bdi', 'mention', `@${this.nameOf(part)}`));
      else if (part) p.append(document.createTextNode(part));
    });
    return p;
  }

  private replyField(t: Comment): Field {
    let f = this.replies.get(t.id);
    if (!f) {
      const kept = this.pending.get(t.id);
      this.pending.delete(t.id);
      const leave = () => {
        f!.box.classList.remove('open');
        this.keep();
        this.nodes.get(t.id)?.focus();
      };
      f = this.field('Reply', 'Reply', async (text) => {
        await this.comments.act(t.id, 'reply', { text });
        if (this.comments.threads.get(t.id)?.resolved) await this.comments.act(t.id, 'reopen', {});
        this.comments.markRead(t.id);
      }, () => {
        f!.reset();
        leave();
      }, kept, leave);
      f.box.classList.add('reply');
      if (kept?.text) f.box.classList.add('open');
      const field = f;
      f.area.addEventListener('focus', () => field.box.classList.add('open'));
      f.area.addEventListener('blur', () => setTimeout(() => {
        if (!field.area.value && !field.box.contains(document.activeElement)) field.box.classList.remove('open');
      }, 150));
      this.replies.set(t.id, f);
    }
    return f;
  }

  private field(placeholder: string, sendLabel: string, send: (text: string) => Promise<void>, cancel: () => void, initial: Kept = { text: '', marks: [] }, escape = cancel): Field {
    const box = make('div', 'field');
    const area = make('textarea');
    area.placeholder = placeholder;
    area.setAttribute('aria-label', placeholder);
    area.dir = 'auto';
    area.rows = 1;
    area.dataset.ownKeys = 'Mod+Enter';
    area.maxLength = 2 * COMMENT_MAX;
    const people = make('ul', 'people');
    people.id = `beeson-comment-people-${++ids}`;
    people.setAttribute('role', 'listbox');
    people.setAttribute('aria-label', 'People');
    people.hidden = true;
    area.setAttribute('role', 'combobox');
    area.setAttribute('aria-autocomplete', 'list');
    area.setAttribute('aria-controls', people.id);
    area.setAttribute('aria-expanded', 'false');
    const error = make('p', 'error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const actions = make('div', 'actions');
    const no = make('button', '', 'Cancel');
    no.type = 'button';
    const go = make('button', 'primary', sendLabel);
    go.type = 'button';
    actions.append(no, go);
    box.append(area, people, error, actions);
    let marks: Mark[] = [];
    let last = '';
    let choices: { person: string; name: string }[] = [];
    let active = 0;
    let busy = false;
    let over = false;
    const sent = () => {
      const plain = (s: string) => s.replace(/@\{/g, '@\u2060{');
      let text = '', at = 0;
      for (const m of [...marks].sort((a, b) => a.start - b.start)) {
        text += `${plain(area.value.slice(at, m.start))}@{${m.person}}`;
        at = m.end;
      }
      return (text + plain(area.value.slice(at))).trim();
    };
    const f: Field = {
      box,
      area,
      send: go,
      error,
      kept: () => ({ text: area.value, marks: marks.map((m) => ({ ...m })) }),
      load: (k) => {
        area.value = k.text;
        last = k.text;
        marks = k.marks.filter((m) => m.start >= 0 && m.end <= k.text.length && m.start < m.end).map((m) => ({ ...m }));
        fit();
        sync();
      },
      reset: () => {
        f.load({ text: '', marks: [] });
        error.hidden = true;
        this.keep();
      },
    };
    const fit = () => {
      if (!area.isConnected) return;
      area.style.height = 'auto';
      area.style.height = `${Math.min(160, area.scrollHeight + 2)}px`;
    };
    const sync = () => {
      const online = this.client.connection === 'online';
      const extra = Array.from(sent()).length - COMMENT_MAX;
      const disabled = busy || !online || !area.value.trim() || extra > 0;
      if (go.disabled !== disabled) go.disabled = disabled;
      if (go.title !== unsent(this.client)) go.title = unsent(this.client);
      if (extra > 0) {
        over = true;
        error.textContent = `The text is ${extra} ${extra === 1 ? 'character' : 'characters'} too long.`;
        error.hidden = false;
      } else if (over) {
        over = false;
        error.hidden = true;
      }
    };
    (box as HTMLElement & { sync?: () => void }).sync = () => {
      sync();
      if (!people.hidden) update();
    };
    const move = () => {
      const now = area.value;
      let a = 0;
      while (a < last.length && a < now.length && last[a] === now[a]) a++;
      let b = 0;
      while (b < last.length - a && b < now.length - a && last[last.length - 1 - b] === now[now.length - 1 - b]) b++;
      const shift = now.length - last.length;
      marks = marks.flatMap((m) => (m.end <= a ? [m] : m.start >= last.length - b ? [{ ...m, start: m.start + shift, end: m.end + shift }] : []));
      marks = marks.filter((m) => !/[\p{L}\p{N}_]/u.test(now[m.end] ?? ''));
      last = now;
    };
    const whole = () => {
      const at = area.selectionStart ?? 0;
      const m = marks.find((m) => m.start < at && m.end === at + last.length - area.value.length && area.value.slice(at) === last.slice(m.end));
      if (!m) return;
      area.value = area.value.slice(0, m.start) + area.value.slice(at);
      area.setSelectionRange(m.start, m.start);
    };
    const query = () => /(?:^|\s)@([^\s@]{0,40})$/.exec(area.value.slice(0, area.selectionStart ?? 0));
    let drawn = '';
    const close = () => {
      drawn = '';
      people.hidden = true;
      choices = [];
      area.setAttribute('aria-expanded', 'false');
      area.removeAttribute('aria-activedescendant');
    };
    const draw = () => {
      const sign = JSON.stringify([active, choices.map((c) => [c.person, c.name, this.colorOf(c.person), this.client.people.some((p) => p.person === c.person)])]);
      if (sign === drawn) return;
      drawn = sign;
      people.replaceChildren(...choices.map((c, k) => {
        const li = make('li');
        li.id = `${people.id}-${k}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(k === active));
        const a = make('span', 'avatar', initials(c.name) || '?');
        a.style.background = toneOf(this.colorOf(c.person));
        a.style.color = inkOf(this.colorOf(c.person));
        const name = make('span', '', c.name);
        name.dir = 'auto';
        li.append(a, name);
        if (this.client.people.some((p) => p.person === c.person)) li.append(make('span', 'here', 'Here'));
        li.addEventListener('pointerdown', (ev) => ev.preventDefault());
        li.addEventListener('click', () => pick(k));
        return li;
      }));
      area.setAttribute('aria-activedescendant', `${people.id}-${active}`);
    };
    const update = () => {
      const m = query();
      if (!m) return close();
      const q = m[1].toLowerCase();
      const here = new Set(this.client.people.map((p) => p.person));
      const was = people.hidden ? null : choices[active]?.person;
      choices = this.client.known
        .filter((k) => k.person !== this.client.person && k.name.toLowerCase().includes(q))
        .sort((a, b) => Number(here.has(b.person)) - Number(here.has(a.person)) || Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
        .slice(0, 6);
      if (!choices.length) return close();
      const at = choices.findIndex((c) => c.person === was);
      active = at < 0 ? Math.min(active, choices.length - 1) : at;
      people.hidden = false;
      area.setAttribute('aria-expanded', 'true');
      draw();
    };
    const pick = (k: number) => {
      const c = choices[k];
      const m = query();
      if (!c || !m) return;
      const end = area.selectionStart ?? area.value.length;
      const start = end - m[1].length - 1;
      const put = `@${c.name} `;
      area.value = area.value.slice(0, start) + put + area.value.slice(end);
      area.setSelectionRange(start + put.length, start + put.length);
      move();
      marks.push({ start, end: start + 1 + c.name.length, person: c.person });
      close();
      fit();
      sync();
      this.keep();
      area.focus();
    };
    const submit = async () => {
      sync();
      if (go.disabled) return;
      const text = sent();
      busy = true;
      sync();
      try {
        await send(text);
        f.reset();
      } catch (e) {
        error.textContent = message(e);
        error.hidden = false;
        over = false;
        if (told(e)) toast(error.textContent);
      } finally {
        busy = false;
        sync();
        if (document.activeElement === document.body) (area.value ? area : area.closest('article'))?.focus({ preventScroll: true });
      }
    };
    area.addEventListener('input', (ev) => {
      error.hidden = true;
      over = false;
      if ((ev as InputEvent).inputType === 'deleteContentBackward') whole();
      move();
      fit();
      sync();
      update();
      this.keep();
    });
    area.addEventListener('click', update);
    area.addEventListener('blur', () => setTimeout(() => {
      if (document.activeElement !== area && !people.contains(document.activeElement)) close();
    }, 150));
    area.addEventListener('keydown', (ev) => {
      if (ev.isComposing || ev.keyCode === 229) {
        ev.stopPropagation();
        return;
      }
      if (!people.hidden && choices.length) {
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
          ev.preventDefault();
          active = (active + (ev.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length;
          draw();
          return;
        }
        if (ev.key === 'Enter' || ev.key === 'Tab') {
          ev.preventDefault();
          pick(active);
          return;
        }
        if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          close();
          return;
        }
      }
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        void submit();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        escape();
      }
      ev.stopPropagation();
    });
    no.addEventListener('click', () => cancel());
    go.addEventListener('click', () => void submit());
    f.load(initial);
    return f;
  }

  startDraft(el: Element | null, slide: Element, focus = true): void {
    if (inHistory()) return;
    stopFollowing();
    this.shell.tab.set(true);
    if (this.filter === 'resolved') this.filter = 'open';
    this.drafted(el, slide);
    this.render();
    if (focus) this.draft?.field.area.focus();
  }

  private drafted(el: Element | null, slide: Element): void {
    if (!this.draft) {
      const box = make('div', 'draft');
      const label = make('p', 'anchor');
      const discard = () => {
        this.draft = null;
        this.keep();
        this.render();
      };
      const field = this.field('Comment, or type @ to mention someone', 'Comment', async (text) => {
        this.retarget();
        const d = this.draft!;
        const thread = await this.comments.add(d.el, d.slide, text);
        this.draft = null;
        this.keep();
        this.focused = thread.id;
        this.render();
        this.nodes.get(thread.id)?.focus();
      }, discard, undefined, () => {
        if (field.area.value.trim()) field.area.blur();
        else discard();
      });
      box.append(label, field.box);
      this.draft = { el, slide, box, label, field };
    }
    this.draft.el = el;
    this.draft.slide = slide;
    const n = this.comments.numberAt(slide);
    this.draft.label.textContent = el ? this.label(null, null, el) : n === null ? 'On the slide' : `On Slide ${n}`;
  }

  private updateDraft(): void {
    for (const box of this.root.querySelectorAll('.field')) (box as HTMLElement & { sync?: () => void }).sync?.();
  }

  private edit(t: Comment, reply: string | null): void {
    const item = reply ? t.replies.find((r) => r.id === reply) : t;
    if (!item || this.client.connection !== 'online') return;
    let text = '';
    const marks: Mark[] = [];
    item.text.split(MENTION).forEach((part, k) => {
      if (!(k % 2)) return void (text += part);
      const name = `@${this.nameOf(part)}`;
      marks.push({ start: text.length, end: text.length + name.length, person: part });
      text += name;
    });
    const done = () => {
      this.editing = null;
      this.signs.delete(t.id);
      this.render();
      this.nodes.get(t.id)?.focus();
    };
    const field = this.field('Edit the comment', 'Save', async (value) => {
      await this.comments.act(t.id, 'edit', { text: value, ...(reply ? { reply } : {}) });
      done();
    }, done, { text, marks });
    this.editing = { id: t.id, reply, field };
    this.thread(t, this.comments.places().get(t.id) ?? null, true);
    field.area.focus();
    field.area.setSelectionRange(field.area.value.length, field.area.value.length);
  }

  private async remove(t: Comment, reply: string | null): Promise<void> {
    if (!reply) {
      const dialog = this.client.shell.dialog({
        title: 'Delete this thread?',
        text: t.replies.length ? 'The comment and its replies are deleted for everyone.' : 'The comment is deleted for everyone.',
        buttons: [
          { label: 'Cancel', value: 'cancel' },
          { label: 'Delete', value: 'delete', primary: true },
        ],
      });
      const answer = await dialog.open('cancel');
      dialog.el.remove();
      if (answer !== 'delete') return;
    }
    await this.act(t.id, 'delete', reply ? { reply } : {});
  }

  private async act(id: string, route: 'delete' | 'resolve' | 'reopen', body: Record<string, unknown> = {}): Promise<void> {
    try {
      await this.comments.act(id, route, body);
      this.comments.markRead(id);
    } catch (e) {
      toast(message(e));
    }
  }

  open(id: string): void {
    const t = this.comments.threads.get(id);
    if (!t || inHistory()) return;
    stopFollowing();
    this.shell.tab.set(true);
    if (!this.visible(t)) this.filter = t.resolved ? 'resolved' : 'open';
    this.focus(id, true);
    this.render();
    const p = this.comments.places().get(id);
    if (p) this.shell.frame(p.el, p.slide);
    const node = this.nodes.get(id);
    node?.focus({ preventScroll: true });
    node?.scrollIntoView({ block: 'nearest' });
  }

  private focus(id: string, read: boolean): void {
    if (this.focused !== id) {
      this.focused = id;
      for (const [k, node] of this.nodes) {
        node.classList.toggle('focused', k === id);
        node.tabIndex = k === id ? 0 : -1;
      }
    }
    if (read || this.shell.tab.shown()) this.comments.markRead(id);
  }

  openMine(): void {
    this.filter = 'mine';
    this.shell.tab.set(true);
    this.render();
  }

  openAt(target: Element): void {
    if (inHistory()) return;
    const places = this.comments.places();
    const t = this.sorted(places).find((x) => !x.resolved && (places.get(x.id)?.el ?? places.get(x.id)?.slide) === target);
    if (t) this.open(t.id);
  }

  private onKey(ev: KeyboardEvent): void {
    const target = ev.target as Element;
    if (target.closest('textarea, input') || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const article = target.closest('article');
    const id = (article as HTMLElement | null)?.dataset.id ?? null;
    const key = ev.key.toLowerCase();
    if (!article || !id) return;
    const t = this.comments.threads.get(id);
    if (!t) return;
    const move = (step: number) => {
      const at = this.order.indexOf(id);
      const next = this.order[Math.max(0, Math.min(this.order.length - 1, at + step))];
      if (next) this.open(next);
    };
    if (ev.key === 'Enter' && target === article) this.open(id);
    else if (key === 'j') move(1);
    else if (key === 'k') move(-1);
    else if (key === 'r' && !t.resolved) {
      const f = this.replies.get(id);
      f?.box.classList.add('open');
      f?.area.focus();
    } else if (key === 'e') {
      if (this.client.connection === 'online') void this.act(id, t.resolved ? 'reopen' : 'resolve');
    }
    else if (key === 'u') {
      (document.activeElement as HTMLElement | null)?.blur();
      this.focused = null;
      this.render();
    } else return;
    ev.preventDefault();
    ev.stopPropagation();
  }
}

const inHistory = (): boolean => document.documentElement.classList.contains('beeson-history');

const sentence = (text: string): string => `${text[0].toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? '' : '.'}`;

const told = (e: unknown): e is Failure => e instanceof Failure && e.status === 503 && !!e.message && !e.message.includes('<');

function message(e: unknown): string {
  if (e instanceof Failure && e.status === 0) return 'Not sent. The connection to the host was lost.';
  if (told(e)) return `Not sent. ${sentence(e.message)}`;
  if (e instanceof Failure && e.status >= 500) return 'Not sent. The host did not answer.';
  const text = e instanceof Error ? e.message : String(e);
  return text ? sentence(text) : 'The request failed.';
}

const named = (name: string, after: string): Node[] => [bdi(name), document.createTextNode(after)];

const SLIDES = '.reveal .slides section';
const TEXTS = `beeson-session-comment-texts:${location.pathname}`;

type Saved = { draft: (Kept & { slide: Spot | null; el: Spot | null }) | null; replies: Record<string, Kept> };

const nameOf = (client: Client, person: string): string =>
  person === client.person ? client.name || 'You' : client.known.find((k) => k.person === person)?.name ?? 'Someone';

const PANE_KEY = 'beeson-session-comments-pane';
const TOASTED = `beeson-session-comment-toasted:${location.pathname}`;

const BUTTON_CSS = `
.beeson-edit-titlebar .right button.beeson-session-comments { position: relative; }
.beeson-edit-titlebar .right button.beeson-session-comments::after { content: ''; position: absolute; inset: -5px -2px; }
.beeson-edit-titlebar .right button.beeson-session-comments svg { flex: none; color: var(--ed-muted); }
.beeson-edit-titlebar .right button.beeson-session-comments[aria-pressed="true"] svg { color: var(--ed-select); }
.beeson-session-comments .count { min-width: 14px; height: 14px; padding: 0 3px; box-sizing: border-box; border-radius: 7px; background: var(--ed-select); color: var(--ed-on-select); font: 600 10px/14px var(--ed-font); text-align: center; }
.beeson-session-comments .count:empty:not(.dot) { display: none; }
.beeson-session-comments .count.dot { min-width: 8px; height: 8px; padding: 0; background: var(--ed-focus); }
.beeson-session-comments[inert] { opacity: 0.45; }
`;

export function install(client: Client): void {
  const shell = client.shell.comments;
  const comments = new Comments(client);
  const pane = new Pane(client, comments);
  shell.tab.panel.append(pane.root);
  shell.tab.enable();
  const badges = new Badges(comments, (target) => pane.openAt(target));
  style('comments-button', BUTTON_CSS);
  const button = make('button', 'beeson-session-comments');
  button.type = 'button';
  const count = make('span', 'count');
  button.append(client.shell.icon('comment', 14), count);
  client.shell.bar.append(button);
  button.addEventListener('click', () => !inHistory() && shell.tab.set(!shell.tab.shown()));
  mountToasts();

  let frame = 0;
  const draw = () => {
    const n = comments.unreadCount();
    if (count.textContent !== (n ? String(n) : '')) count.textContent = n ? String(n) : '';
    const dot = !n && comments.anyUnread();
    count.classList.toggle('dot', dot);
    const label = n ? `Comments, ${n} unread` : dot ? 'Comments, unread threads' : 'Comments';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.setAttribute('aria-pressed', String(shell.tab.shown()));
    button.hidden = client.connection === 'ended';
    if (shell.tab.shown()) pane.render();
  };
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  };

  const held: (() => void)[] = [];
  let history = inHistory();
  new MutationObserver(() => {
    if (history === inHistory()) return;
    history = !history;
    button.toggleAttribute('inert', history);
    badges.schedule();
    if (!history) for (const show of held.splice(0)) show();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  button.toggleAttribute('inert', history);

  let received: Set<string> | null = null;
  const toasted = new Set<string>();
  try {
    for (const id of JSON.parse(sessionStorage.getItem(TOASTED) || '[]') as string[]) toasted.add(id);
  } catch {}
  const kind: ToastKind = { key: 'comments', many: (n) => ({ text: `${n} new comments`, button: { label: 'Show', run: () => pane.openMine() } }) };
  comments.onChange(() => {
    schedule();
    badges.schedule();
    if (comments.rev < 0) return;
    const first = !received;
    received ??= new Set();
    const me = `@{${client.person}}`;
    let added = false;
    for (const t of comments.threads.values()) {
      for (const i of itemsOf(t)) {
        const key = `${i.id}:${stamp(i)}`;
        if (received.has(key)) continue;
        received.add(key);
        if (first || i.author === client.person || toasted.has(i.id) || !i.text.includes(me) || stamp(i) <= Math.max(comments.seen, comments.read.get(t.id) ?? 0)) continue;
        toasted.add(i.id);
        added = true;
        const n = comments.numberOf(t);
        const go: ToastButton = { label: 'Show', run: () => pane.open(t.id) };
        const show = () => toast(named(nameOf(client, i.author), ` mentioned you ${n === null ? 'on the deck' : `on slide ${n}`}`), go, kind);
        if (inHistory()) held.push(show);
        else show();
      }
    }
    if (added) {
      try {
        sessionStorage.setItem(TOASTED, JSON.stringify([...toasted].slice(-200)));
      } catch {}
    }
    if (first) pane.restore();
  });
  for (const e of ['known', 'people', 'state', 'applied', 'me', 'tex'] as const) client.on(e, schedule);
  client.app.onRefresh(['structure', 'content'], () => shell.tab.shown() && schedule());
  try {
    if (sessionStorage.getItem(PANE_KEY) === '1') shell.tab.set(true);
  } catch {}
  shell.tab.onShown(() => {
    try {
      sessionStorage.setItem(PANE_KEY, shell.tab.shown() ? '1' : '0');
    } catch {}
    draw();
    badges.schedule();
  });

  const live = () => client.connection !== 'ended';
  client.shell.define({
    id: 'insert.comment',
    label: 'Comment',
    keys: { mac: ['Mod+Alt+M'], other: ['Shift+F2'] },
    in: ['canvas', 'text', 'navigator', 'inspector'],
    inText: true,
    menu: { bar: 'Insert', group: 'comment', order: 40 },
    toolbar: { group: 'insert', order: 30, icon: 'comment', label: 'Comment' },
    context: ['element', 'text', 'canvas', 'slide'],
    enabled: live,
    why: () => (live() ? null : ENDED),
    run: (_app, arg) => {
      const at = arg as { kind?: string; target?: Element | null } | undefined;
      let { el, slide } = shell.target();
      if ((at?.kind === 'text' || at?.kind === 'element') && at.target) {
        el = at.target;
        slide = el.closest(SLIDES);
      } else if (at?.kind === 'canvas' || at?.kind === 'slide') {
        el = null;
        slide = at.target ?? slide;
      }
      if (slide) pane.startDraft(el, slide);
    },
  });
  client.shell.define({
    id: 'view.comments',
    label: 'Comments',
    keys: { mac: ['Ctrl+Mod+4'], other: ['Ctrl+Shift+4'] },
    in: ['canvas', 'text', 'field', 'navigator', 'notes', 'inspector'],
    menu: { bar: 'View', group: 'panes', order: 14 },
    checked: () => shell.tab.shown(),
    run: () => shell.tab.set(!shell.tab.shown()),
  });
  client.shell.define({
    id: 'view.commentBadges',
    label: 'Comment Badges',
    keys: { mac: ['Shift+C'], other: ['Shift+C'] },
    menu: { bar: 'View', group: 'guides', order: 55 },
    checked: () => badges.shown,
    run: () => badges.toggle(),
  });
  draw();
}
