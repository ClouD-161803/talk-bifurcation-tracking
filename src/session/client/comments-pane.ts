// the pane Comments, the third tab of the inspector. it lists the threads in slide order under the
// filters Open, For You, and Resolved, with On the deck on top, and it holds the draft of a new
// comment and the list of people at an @. with the focus on a thread, J and K move it to the next
// and the previous thread, R opens the reply, E resolves or reopens the thread, and U leaves it.
// every text of a person is written as text, and never as HTML

import { COMMENT_MAX, type Comment } from '../protocol.ts';
import type { Client } from './client.ts';
import { Badges } from './comments-badges.ts';
import { Comments, MENTION, itemsOf, stamp, type Item, type Place, type Spot } from './comments.ts';
import { bdi, make, style } from './dom.ts';
import { stopFollowing } from './follow.ts';
import { whenOf } from './labels.ts';
import type { OpenMenu } from '../../editor/ui/menu.ts';
import { initials, inkOf, toneOf } from './people.ts';
import { presenceOf } from './presence.ts';
import { mountToasts, toast, type ToastButton, type ToastKind } from './toast.ts';
import { Failure } from './transport.ts';

const OFFLINE = 'Comments can be sent once you are back online';

// the hit area of every control is 32 px or more, also on a phone
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

// a mention picked from the list, as the range of its @name in the field and the id of its person
type Mark = { start: number; end: number; person: string };
// the text of a field and its mentions, as kept through a reload of the page
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
  // the open menu of a thread or of a reply
  private menu: OpenMenu | null = null;
  private nodes = new Map<string, HTMLElement>();
  private signs = new Map<string, string>();
  private replies = new Map<string, Field>();
  private groups = new Map<Element | string, HTMLElement>();
  private order: string[] = [];
  // each thread and its place as last drawn, read when another person deletes it
  private drawn = new Map<string, { t: Comment; p: Place | null }>();
  // the replies kept through a reload whose thread is not drawn yet
  private pending = new Map<string, Kept>();
  private saveTimer = 0;
  private savedAt = -Infinity;
  // the texts are written once those kept before a reload are read
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

  // a reply being typed or a comment in edit, which keeps its thread in Open when another person
  // resolves it
  private busy(t: Comment): boolean {
    const f = this.replies.get(t.id);
    return this.editing?.id === t.id || (!!f && (!!f.area.value.trim() || f.box.contains(document.activeElement)));
  }

  // the label of the place of a thread, e.g. On Heading: Low-thrust transfers
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

  // the threads in slide order, those on the deck first. a slide of a stack shares its number with
  // the slides of the stack, hence the order is that of the slides in the deck
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
    // a heading per slide, which reads the number of the slide in the status bar
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
    // the nodes are put in place one by one around the node of the focus, which keeps its place,
    // since a node taken out of the page loses the focus
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
    // a focused thread that leaves the list hands the focus to the thread at its place
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

  // a reply being typed in a thread that another person deleted becomes the draft of a new comment
  // on the same element, or on its slide when the element is gone. a draft with text keeps its
  // place, and the reply is added under its text. the field to focus is given back
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

  // a draft whose element or slide left the deck, e.g. deleted by another person, moves to its
  // slide, or to the slide shown, as a reply does in salvage()
  private retarget(): void {
    const d = this.draft;
    if (!d || (d.el?.isConnected !== false && d.slide.isConnected)) return;
    const slide = d.slide.isConnected ? d.slide : this.shell.target().slide;
    if (slide) this.drafted(null, slide);
  }

  // the draft and the replies being typed written to sessionStorage, at most once a second
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
    } catch {
      // kept for this page only
    }
  }

  // the draft and the replies kept before the page loaded again, once the threads are read
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
    // an element that was changed or removed meanwhile is not found, and neither is its slide
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
    // an attribute written with its own value still invalidates the style of the pane
    if (node.getAttribute('aria-label') !== aria) node.setAttribute('aria-label', aria);
    // a reply being typed stays in a thread that another person resolves
    const answering = !t.resolved || this.busy(t);
    const names = itemsOf(t).map((i) => `${this.nameOf(i.author)}|${this.colorOf(i.author)}`).join(',');
    const known = this.client.known.map((k) => `${k.person}=${k.name}`).join(',');
    // the offsets of the anchors move with each letter typed before them, and the label stands for
    // the place in the sign
    const { anchor: _a, slide: _s, ...shown } = t;
    const sign = JSON.stringify([shown, !!t.anchor, names, known, this.label(t, p), this.client.connection === 'online', answering]);
    if (this.signs.get(t.id) === sign && !force) return node;
    // a thread in edit is drawn again once the edit ends
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
    // offline, an action is not sent later, hence its button is disabled
    const offline = (b: HTMLButtonElement) => {
      b.disabled = !online;
      if (!online) b.title = OFFLINE;
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
      // a second press closes the menu
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

  // the text of a comment, with each mention as @ and the current name of the person
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
      // Cancel discards the text, and Esc keeps it, as in a draft
      f = this.field('Reply', 'Reply', async (text, mentions) => {
        await this.comments.act(t.id, 'reply', { text, mentions });
        // a reply to a thread that another person resolved while it was typed reopens it
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

  // a field of a comment, with the list of people at an @, Cancel, and a button that sends it. a
  // name picked from the list is a mention, kept as a mark on its @name until a change of the text
  // touches it or a letter follows it, and a name typed by hand is text
  private field(placeholder: string, sendLabel: string, send: (text: string, mentions: string[]) => Promise<void>, cancel: () => void, initial: Kept = { text: '', marks: [] }, escape = cancel): Field {
    const box = make('div', 'field');
    const area = make('textarea');
    area.placeholder = placeholder;
    area.setAttribute('aria-label', placeholder);
    area.dir = 'auto';
    area.rows = 1;
    // Mod+Enter sends, and is not Present of the editor here
    area.dataset.ownKeys = 'Mod+Enter';
    // a mention is longer when it is sent than in the field, and the count is checked in sync()
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
    // the text as it is sent, with each mark written as the id of its person
    const sent = () => {
      let text = area.value;
      for (const m of [...marks].sort((a, b) => b.start - a.start)) text = `${text.slice(0, m.start)}@{${m.person}}${text.slice(m.end)}`;
      return text.trim();
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
      // a field out of the page has no height to read
      if (!area.isConnected) return;
      area.style.height = 'auto';
      area.style.height = `${Math.min(160, area.scrollHeight + 2)}px`;
    };
    const sync = () => {
      const online = this.client.connection === 'online';
      const extra = Array.from(sent()).length - COMMENT_MAX;
      const disabled = busy || !online || !area.value.trim() || extra > 0;
      if (go.disabled !== disabled) go.disabled = disabled;
      if (go.title !== (online ? '' : OFFLINE)) go.title = online ? '' : OFFLINE;
      if (extra > 0) {
        over = true;
        error.textContent = `The text is ${extra} ${extra === 1 ? 'character' : 'characters'} too long.`;
        error.hidden = false;
      } else if (over) {
        over = false;
        error.hidden = true;
      }
    };
    (box as HTMLElement & { sync?: () => void }).sync = sync;
    // the marks moved by the change from last to the value of the field, and those that the change
    // touches dropped
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
    // a delete that ends at the end of a mark takes out the rest of its @Name as well, since the field
    // would keep it as plain text. it reads the input event, which a phone keyboard sends too
    const whole = () => {
      const at = area.selectionStart ?? 0;
      const m = marks.find((m) => m.start < at && m.end === at + last.length - area.value.length && area.value.slice(at) === last.slice(m.end));
      if (!m) return;
      area.value = area.value.slice(0, m.start) + area.value.slice(at);
      area.setSelectionRange(m.start, m.start);
    };
    const query = () => /(?:^|\s)@([^\s@]{0,40})$/.exec(area.value.slice(0, area.selectionStart ?? 0));
    const close = () => {
      people.hidden = true;
      choices = [];
      area.setAttribute('aria-expanded', 'false');
      area.removeAttribute('aria-activedescendant');
    };
    const draw = () => {
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
      choices = this.client.known
        .filter((k) => k.person !== this.client.person && k.name.toLowerCase().includes(q))
        .sort((a, b) => Number(here.has(b.person)) - Number(here.has(a.person)) || Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
        .slice(0, 6);
      if (!choices.length) return close();
      active = Math.min(active, choices.length - 1);
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
      const mentions = [...new Set([...text.matchAll(MENTION)].map((m) => m[1]))];
      busy = true;
      sync();
      try {
        await send(text, mentions);
        f.reset();
      } catch (e) {
        error.textContent = message(e);
        error.hidden = false;
        over = false;
        if (told(e)) toast(error.textContent);
      } finally {
        busy = false;
        sync();
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
    // the field may have the focus again by then, e.g. after a click on a scroll bar
    area.addEventListener('blur', () => setTimeout(() => {
      if (document.activeElement !== area && !people.contains(document.activeElement)) close();
    }, 150));
    area.addEventListener('keydown', (ev) => {
      // a key of an input method that composes a text is its own
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

  // a new comment on el, or on slide when el is null, as a draft at the top of the pane
  startDraft(el: Element | null, slide: Element, focus = true): void {
    if (inHistory()) return;
    // a comment is an edit, and a person who edits does not follow
    stopFollowing();
    this.shell.tab.set(true);
    if (this.filter === 'resolved') this.filter = 'open';
    this.drafted(el, slide);
    this.render();
    if (focus) this.draft?.field.area.focus();
  }

  // the draft on el or slide, made without a render
  private drafted(el: Element | null, slide: Element): void {
    if (!this.draft) {
      const box = make('div', 'draft');
      const label = make('p', 'anchor');
      const discard = () => {
        this.draft = null;
        this.keep();
        this.render();
      };
      const field = this.field('Comment, or type @ to mention someone', 'Comment', async (text, mentions) => {
        // the tab may be hidden, and render() then did not move the draft
        this.retarget();
        const d = this.draft!;
        const thread = await this.comments.add(d.el, d.slide, text, mentions);
        this.draft = null;
        this.keep();
        this.focused = thread.id;
        this.render();
        this.nodes.get(thread.id)?.focus();
      }, discard, undefined, () => {
        // Esc keeps a draft with text, as it keeps a reply, and Cancel discards it
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
    // the mentions of the record, each a mark on the @name of its person
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
    const field = this.field('Edit the comment', 'Save', async (value, mentions) => {
      await this.comments.act(t.id, 'edit', { text: value, mentions, ...(reply ? { reply } : {}) });
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

  // the thread of id shown in the pane and framed on its slide
  open(id: string): void {
    const t = this.comments.threads.get(id);
    if (!t || inHistory()) return;
    // a Show on the slide that following shows changes neither the slide nor the selection
    stopFollowing();
    this.shell.tab.set(true);
    if (!this.visible(t)) this.filter = t.resolved ? 'resolved' : 'open';
    this.focus(id, true);
    this.render();
    const p = this.comments.places().get(id);
    // an element that another person holds is shown on its slide without a selection, which the
    // floor rule refuses
    if (p) this.shell.frame(p.el && presenceOf(this.client)?.lockOf(p.el) ? null : p.el, p.slide);
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

  // the comments for the person, from the button Show of a joined toast
  openMine(): void {
    this.filter = 'mine';
    this.shell.tab.set(true);
    this.render();
  }

  // the first open thread on the element or slide target
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

// a 503 of the edit command gives its reason, e.g. that the comments are read only, and the answer
// of a proxy is markup
const told = (e: unknown): e is Failure => e instanceof Failure && e.status === 503 && !!e.message && !e.message.includes('<');

// the message of a failed request for the person, which is not sent later
function message(e: unknown): string {
  if (e instanceof Failure && e.status === 0) return 'Not sent. The connection to the host was lost.';
  if (told(e)) return `Not sent. ${sentence(e.message)}`;
  if (e instanceof Failure && e.status >= 500) return 'Not sent. The host did not answer.';
  const text = e instanceof Error ? e.message : String(e);
  return text ? sentence(text) : 'The request failed.';
}

// a name isolated from the text around it, e.g. a name written right to left, and the text after it
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
.beeson-session-comments .count.dot { min-width: 8px; height: 8px; padding: 0; }
.beeson-session-comments[inert] { opacity: 0.45; }
`;

// the comments of a session: the pane in the inspector, the badges, the commands Comment, Comments,
// and Comment Badges, the button Comments in the title bar with the count of unread comments, and
// a toast for a mention of the person
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
  // the mode of Version History shows another version, hence the button is out of reach
  button.addEventListener('click', () => !inHistory() && shell.tab.set(!shell.tab.shown()));
  mountToasts();

  let frame = 0;
  const draw = () => {
    const n = comments.unreadCount();
    if (count.textContent !== (n ? String(n) : '')) count.textContent = n ? String(n) : '';
    // a dot in place of the number while only threads outside For You are unread
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

  // the toasts of mentions wait while the mode of Version History is on
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

  // a comment is a candidate for a toast once, when the page first receives it. the comments of the
  // first answer are not toasted, and the toasted ones are kept through a reload of the page
  let received: Set<string> | null = null;
  const toasted = new Set<string>();
  try {
    for (const id of JSON.parse(sessionStorage.getItem(TOASTED) || '[]') as string[]) toasted.add(id);
  } catch {
    // a page without storage toasts again after a reload
  }
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
      } catch {
        // kept for this page only
      }
    }
    if (first) pane.restore();
  });
  for (const e of ['known', 'people', 'state', 'applied', 'me', 'tex'] as const) client.on(e, schedule);
  client.app.onRefresh(['structure', 'content'], () => shell.tab.shown() && schedule());
  // the pane is shown again when the page loads again, e.g. for a change of the deck that it does
  // not take
  try {
    if (sessionStorage.getItem(PANE_KEY) === '1') shell.tab.set(true);
  } catch {
    // a page without storage opens with the pane closed
  }
  shell.tab.onShown(() => {
    try {
      sessionStorage.setItem(PANE_KEY, shell.tab.shown() ? '1' : '0');
    } catch {
      // kept for this page only
    }
    draw();
    badges.schedule();
  });

  const online = () => client.connection === 'online';
  shell.define({
    id: 'insert.comment',
    label: 'Comment',
    keys: { mac: ['Mod+Alt+M'], other: ['Shift+F2'] },
    in: ['canvas', 'text', 'navigator', 'inspector'],
    inText: true,
    menu: { bar: 'Insert', group: 'comment', order: 40 },
    toolbar: { group: 'insert', order: 30, icon: 'comment', label: 'Comment' },
    context: ['element', 'text', 'canvas', 'slide'],
    enabled: online,
    why: () => (online() ? null : OFFLINE),
    // a context menu names its element or slide, which may be one that another person holds and
    // that the selection drops
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
  shell.define({
    id: 'view.comments',
    label: 'Comments',
    keys: { mac: ['Ctrl+Mod+4'], other: ['Ctrl+Shift+4'] },
    in: ['canvas', 'text', 'field', 'navigator', 'notes', 'inspector'],
    menu: { bar: 'View', group: 'panes', order: 14 },
    checked: () => shell.tab.shown(),
    run: () => shell.tab.set(!shell.tab.shown()),
  });
  shell.define({
    id: 'view.commentBadges',
    label: 'Comment Badges',
    keys: { mac: ['Shift+C'], other: ['Shift+C'] },
    menu: { bar: 'View', group: 'guides', order: 55 },
    checked: () => badges.shown,
    run: () => badges.toggle(),
  });
  draw();
}
