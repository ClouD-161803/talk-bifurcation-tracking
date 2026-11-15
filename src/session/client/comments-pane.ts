// the pane Comments, the third tab of the inspector. it lists the threads in slide order under the
// filters Open, For You, and Resolved, with On the deck on top, and it holds the draft of a new
// comment and the list of people at an @. with the focus on a thread, J and K move it to the next
// and the previous thread, R opens the reply, E resolves or reopens the thread, and U leaves it.
// every text of a person is written as text, and never as HTML

import { COLORS, COMMENT_MAX, type Comment } from '../protocol.ts';
import type { Client } from './client.ts';
import { Badges } from './comments-badges.ts';
import { Comments, MENTION, itemsOf, stamp, type Item, type Place } from './comments.ts';
import { make, style } from './dom.ts';
import { closeMenu, openMenu } from './menu.ts';
import { toast } from './toast.ts';
import { Failure } from './transport.ts';

// the tone and the initials of a person, until people.ts of the avatars gives them
function tone(color: number): { bg: string; fg: string } {
  const v = COLORS[((color % COLORS.length) + COLORS.length) % COLORS.length];
  return { bg: `var(${v})`, fg: v === '--data-5' ? '#fff' : '#1d1d1f' };
}
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).map((w) => Array.from(w));
  if (!words.length) return '?';
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2).join('')).toUpperCase();
}

const OFFLINE = 'Comments are sent once you are back online';

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
.beeson-comments article:focus-visible, .beeson-comments article.focused { border-color: var(--ed-focus); }
.beeson-comments article.unread { box-shadow: inset 3px 0 0 var(--ed-select); }
.beeson-comments .item + .item { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--ed-line); }
.beeson-comments .head { display: flex; align-items: center; gap: 6px; min-height: 32px; }
.beeson-comments .avatar { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; font: 600 10px/1 var(--ed-font); }
.beeson-comments .who { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.beeson-comments .time { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ed-muted); }
.beeson-comments .anchor, .beeson-comments .resolved-by { margin: 0 0 4px; color: var(--ed-muted); overflow-wrap: anywhere; }
.beeson-comments .text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.beeson-comments .mention { color: var(--ed-select); font-weight: 600; }
.beeson-comments button.icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--ed-muted); }
.beeson-comments button.icon:hover { background: var(--ed-hover); color: var(--ed-text); }
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
.beeson-comments .people .here { margin-left: auto; font-size: 11px; opacity: 0.8; }
`;

type Filter = 'open' | 'mine' | 'resolved';
const FILTERS: [Filter, string, string][] = [
  ['open', 'Open', 'No open comments.'],
  ['mine', 'For You', 'No open comments for you.'],
  ['resolved', 'Resolved', 'No resolved comments.'],
];

type Field = { box: HTMLElement; area: HTMLTextAreaElement; send: HTMLButtonElement; error: HTMLElement; names: Map<string, string>; reset(): void };

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
  private nodes = new Map<string, HTMLElement>();
  private signs = new Map<string, string>();
  private replies = new Map<string, Field>();
  private groups = new Map<string, HTMLElement>();
  private order: string[] = [];

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
    this.list.setAttribute('role', 'list');
    this.list.setAttribute('aria-label', 'Comments');
    this.root.append(this.filters, this.list);
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
    if (t.resolved) return false;
    return this.filter === 'open' || this.comments.mine(t);
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

  // the threads in slide order, those on the deck first
  private sorted(places: Map<string, Place>): Comment[] {
    const key = (t: Comment) => {
      const p = places.get(t.id);
      return p?.slide ? (p.number ?? 0) : -1;
    };
    return [...this.comments.threads.values()].sort((a, b) => key(a) - key(b) || (a.anchor?.start ?? 0) - (b.anchor?.start ?? 0) || a.time - b.time);
  }

  render(): void {
    for (const b of this.filters.children) b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.filter === this.filter));
    const places = this.comments.places();
    const shown = this.sorted(places).filter((t) => this.visible(t));
    const want: HTMLElement[] = [];
    if (this.draft) want.push(this.draft.box);
    let group: string | null = null;
    for (const t of shown) {
      const p = places.get(t.id) ?? null;
      const g = p?.slide ? (p.number === null ? 'Slide' : `Slide ${p.number}`) : 'On the deck';
      if (g !== group) {
        group = g;
        let h = this.groups.get(g);
        if (!h) this.groups.set(g, (h = make('h3', '', g)));
        want.push(h);
      }
      want.push(this.thread(t, p));
    }
    this.empty.textContent = FILTERS.find((f) => f[0] === this.filter)![2];
    if (!shown.length && !this.draft) want.push(this.empty);
    // the nodes are put in place one by one, so that a focused field that keeps its place is not
    // taken out of the page, which would take its focus
    const keep = new Set(want);
    for (const child of [...this.list.children]) if (!keep.has(child as HTMLElement)) child.remove();
    let at = this.list.firstElementChild;
    for (const node of want) {
      if (node === at) at = at.nextElementSibling;
      else this.list.insertBefore(node, at);
    }
    this.order = shown.map((t) => t.id);
    for (const [id, node] of this.nodes) {
      if (!this.comments.threads.has(id)) {
        this.nodes.delete(id);
        this.replies.delete(id);
        this.signs.delete(id);
      } else node.tabIndex = id === (this.focused ?? this.order[0]) ? 0 : -1;
    }
    this.updateDraft();
  }

  private thread(t: Comment, p: Place | null, force = false): HTMLElement {
    let node = this.nodes.get(t.id);
    if (!node) {
      node = make('article');
      node.dataset.id = t.id;
      node.setAttribute('role', 'listitem');
      node.addEventListener('click', (ev) => {
        if ((ev.target as Element).closest('button, textarea, a, .people')) return;
        this.open(t.id);
      });
      this.nodes.set(t.id, node);
    }
    const unread = this.comments.unread(t);
    node.classList.toggle('unread', unread);
    node.classList.toggle('focused', this.focused === t.id);
    const names = itemsOf(t).map((i) => `${this.nameOf(i.author)}|${this.colorOf(i.author)}`).join(',');
    const known = this.client.known.map((k) => `${k.person}=${k.name}`).join(',');
    const sign = JSON.stringify([t, names, known, this.label(t, p), this.client.connection === 'online']);
    if (this.signs.get(t.id) === sign && !force) return node;
    // a thread in edit is drawn again once the edit ends
    if (this.editing?.id === t.id && !force) return node;
    this.signs.set(t.id, sign);
    const reply = this.replyField(t);
    const parts: HTMLElement[] = [this.item(t, t, true)];
    for (const r of t.replies) parts.push(this.item(t, r, false));
    node.setAttribute('aria-label', `Comment by ${this.nameOf(t.author)}${t.resolved ? ', resolved' : ''}${unread ? ', unread' : ''}`);
    if (t.resolved) {
      const by = make('p', 'resolved-by', `Resolved by ${this.nameOf(t.resolved.by)}, ${time(t.resolved.time)}`);
      parts.splice(1, 0, by);
    }
    const keep = node.contains(document.activeElement) && reply.box.contains(document.activeElement);
    const children = [...parts, ...(t.resolved ? [] : [reply.box])];
    if (keep) {
      for (const c of [...node.children]) if (c !== reply.box) c.remove();
      node.prepend(...parts);
    } else node.replaceChildren(...children);
    return node;
  }

  private item(t: Comment, i: Item, root: boolean): HTMLElement {
    const box = make('div', 'item');
    const head = make('div', 'head');
    const avatar = make('span', 'avatar', initials(this.nameOf(i.author)));
    const { bg, fg } = tone(this.colorOf(i.author));
    avatar.style.background = bg;
    avatar.style.color = fg;
    avatar.setAttribute('aria-hidden', 'true');
    const when = make('span', 'time', time(i.time) + (i.edited ? ' (edited)' : ''));
    head.append(avatar, make('span', 'who', this.nameOf(i.author)), when);
    if (root) {
      if (t.resolved) head.append(this.button('Reopen', 'Reopen', () => this.act(t.id, 'reopen'), 'text-button'));
      else head.append(this.button('', 'Resolve', () => this.act(t.id, 'resolve'), 'icon resolve', 'check'));
    }
    if (i.author === this.client.person) {
      const more = this.button('', root ? 'Thread actions' : 'Reply actions', () => {
        if (closeMenu()) return;
        openMenu(more, [
          { label: 'Edit', run: () => this.edit(t, root ? null : i.id) },
          { label: 'Delete', run: () => void this.remove(t, root ? null : i.id) },
        ]);
      }, 'icon more', 'more');
      more.setAttribute('aria-haspopup', 'menu');
      head.append(more);
    }
    box.append(head);
    if (root) box.append(make('p', 'anchor', this.label(t, this.comments.places().get(t.id) ?? null)));
    if (this.editing && this.editing.id === t.id && this.editing.reply === (root ? null : i.id)) box.append(this.editing.field.box);
    else box.append(this.text(i.text));
    return box;
  }

  private button(text: string, label: string, run: () => void, className: string, icon?: string): HTMLButtonElement {
    const b = make('button', className, text);
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    if (icon) b.append(this.client.shell.icon(icon, 16));
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      run();
    });
    return b;
  }

  // the text of a comment, with each mention as @ and the current name of the person
  private text(raw: string): HTMLElement {
    const p = make('p', 'text');
    raw.split(MENTION).forEach((part, k) => {
      if (k % 2) p.append(make('span', 'mention', `@${this.nameOf(part)}`));
      else if (part) p.append(document.createTextNode(part));
    });
    return p;
  }

  private replyField(t: Comment): Field {
    let f = this.replies.get(t.id);
    if (!f) {
      f = this.field('Reply', 'Reply', async (text, mentions) => {
        await this.comments.act(t.id, 'reply', { text, mentions });
        this.comments.markRead(t.id);
      }, () => {
        f!.box.classList.remove('open');
        this.nodes.get(t.id)?.focus();
      });
      f.box.classList.add('reply');
      const field = f;
      f.area.addEventListener('focus', () => field.box.classList.add('open'));
      f.area.addEventListener('blur', () => setTimeout(() => {
        if (!field.area.value && !field.box.contains(document.activeElement)) field.box.classList.remove('open');
      }, 150));
      this.replies.set(t.id, f);
    }
    return f;
  }

  // a field of a comment, with the list of people at an @, Cancel, and a button that sends it
  private field(placeholder: string, sendLabel: string, send: (text: string, mentions: string[]) => Promise<void>, cancel: () => void, initial = ''): Field {
    const box = make('div', 'field');
    const area = make('textarea');
    area.placeholder = placeholder;
    area.setAttribute('aria-label', placeholder);
    area.rows = 1;
    area.maxLength = COMMENT_MAX;
    const people = make('ul', 'people');
    people.id = `beeson-comment-people-${++ids}`;
    people.setAttribute('role', 'listbox');
    people.setAttribute('aria-label', 'People');
    people.hidden = true;
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
    const names = new Map<string, string>();
    let choices: { person: string; name: string }[] = [];
    let active = 0;
    let busy = false;
    const f: Field = {
      box,
      area,
      send: go,
      error,
      names,
      reset: () => {
        area.value = '';
        names.clear();
        error.hidden = true;
        fit();
        sync();
      },
    };
    const fit = () => {
      area.style.height = 'auto';
      area.style.height = `${Math.min(160, area.scrollHeight + 2)}px`;
    };
    const sync = () => {
      const online = this.client.connection === 'online';
      go.disabled = busy || !online || !area.value.trim();
      go.title = online ? '' : OFFLINE;
    };
    (box as HTMLElement & { sync?: () => void }).sync = sync;
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
        const a = make('span', 'avatar', initials(c.name));
        const { bg, fg } = tone(this.colorOf(c.person));
        a.style.background = bg;
        a.style.color = fg;
        li.append(a, make('span', '', c.name));
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
      names.set(c.name, c.person);
      close();
      fit();
      sync();
      area.focus();
    };
    const submit = async () => {
      sync();
      if (go.disabled) return;
      let text = area.value.trim();
      for (const name of [...names.keys()].sort((a, b) => b.length - a.length)) text = text.split(`@${name}`).join(`@{${names.get(name)}}`);
      const mentions = [...new Set([...text.matchAll(MENTION)].map((m) => m[1]))];
      busy = true;
      sync();
      try {
        await send(text, mentions);
        f.reset();
      } catch (e) {
        error.textContent = message(e);
        error.hidden = false;
      } finally {
        busy = false;
        sync();
      }
    };
    area.value = initial;
    area.addEventListener('input', () => {
      error.hidden = true;
      fit();
      sync();
      update();
    });
    area.addEventListener('click', update);
    area.addEventListener('blur', () => setTimeout(close, 150));
    area.addEventListener('keydown', (ev) => {
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
        cancel();
      }
      ev.stopPropagation();
    });
    no.addEventListener('click', () => cancel());
    go.addEventListener('click', () => void submit());
    sync();
    return f;
  }

  // a new comment on el, or on slide when el is null, as a draft at the top of the pane
  startDraft(el: Element | null, slide: Element): void {
    this.shell.tab.set(true);
    if (this.filter === 'resolved') this.filter = 'open';
    if (!this.draft) {
      const box = make('div', 'draft');
      const label = make('p', 'anchor');
      const field = this.field('Comment, or type @ to mention someone', 'Comment', async (text, mentions) => {
        const d = this.draft!;
        const thread = await this.comments.add(d.el, d.slide, text, mentions);
        this.draft = null;
        this.focused = thread.id;
        this.render();
        this.nodes.get(thread.id)?.focus();
      }, () => {
        this.draft = null;
        this.render();
      });
      box.append(label, field.box);
      this.draft = { el, slide, box, label, field };
    }
    this.draft.el = el;
    this.draft.slide = slide;
    const n = this.comments.numberAt(slide);
    this.draft.label.textContent = el ? this.label(null, null, el) : n === null ? 'On the slide' : `On Slide ${n}`;
    this.render();
    this.draft.field.area.focus();
  }

  private updateDraft(): void {
    for (const box of this.root.querySelectorAll('.field')) (box as HTMLElement & { sync?: () => void }).sync?.();
  }

  private edit(t: Comment, reply: string | null): void {
    const item = reply ? t.replies.find((r) => r.id === reply) : t;
    if (!item) return;
    let text = item.text;
    const names = new Map<string, string>();
    text = text.replace(MENTION, (_, id: string) => {
      const name = this.nameOf(id);
      names.set(name, id);
      return `@${name}`;
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
    }, done, text);
    for (const [k, v] of names) field.names.set(k, v);
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
    if (!t) return;
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

  // the first open thread on the element or slide target
  openAt(target: Element): void {
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
    } else if (key === 'e') void this.act(id, t.resolved ? 'reopen' : 'resolve');
    else if (key === 'u') {
      (document.activeElement as HTMLElement | null)?.blur();
      this.focused = null;
      this.render();
    } else return;
    ev.preventDefault();
    ev.stopPropagation();
  }
}

function time(t: number): string {
  const d = new Date(t);
  const hm = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? hm : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${hm}`;
}

// the message of a failed request for the person
function message(e: unknown): string {
  if (e instanceof Failure && (e.status === 0 || e.status >= 500)) return OFFLINE;
  const text = e instanceof Error ? e.message : String(e);
  return text ? `${text[0].toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? '' : '.'}` : 'The request failed.';
}

const nameOf = (client: Client, person: string): string =>
  person === client.person ? client.name || 'You' : client.known.find((k) => k.person === person)?.name ?? 'Someone';

const PANE_KEY = 'beeson-session-comments-pane';

const BUTTON_CSS = `
.beeson-edit-titlebar .right button.beeson-session-comments { position: relative; }
.beeson-edit-titlebar .right button.beeson-session-comments::after { content: ''; position: absolute; inset: -5px -2px; }
.beeson-edit-titlebar .right button.beeson-session-comments svg { flex: none; color: var(--ed-muted); }
.beeson-edit-titlebar .right button.beeson-session-comments[aria-pressed="true"] svg { color: var(--ed-select); }
.beeson-session-comments .count { min-width: 14px; height: 14px; padding: 0 3px; box-sizing: border-box; border-radius: 7px; background: var(--ed-select); color: var(--ed-on-select); font: 600 10px/14px var(--ed-font); text-align: center; }
.beeson-session-comments .count:empty { display: none; }
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
  button.addEventListener('click', () => shell.tab.set(!shell.tab.shown()));

  let frame = 0;
  const draw = () => {
    const n = comments.unreadCount();
    if (count.textContent !== (n ? String(n) : '')) count.textContent = n ? String(n) : '';
    const label = n ? `Comments, ${n} unread` : 'Comments';
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
  const toasted = new Set<string>();
  comments.onChange((fresh) => {
    schedule();
    badges.schedule();
    const me = `@{${client.person}}`;
    for (const t of fresh) {
      for (const i of itemsOf(t)) {
        if (i.author === client.person || toasted.has(i.id) || !i.text.includes(me) || stamp(i) <= Math.max(comments.seen, comments.read.get(t.id) ?? 0)) continue;
        toasted.add(i.id);
        const n = comments.numberOf(t);
        toast(`${nameOf(client, i.author)} mentioned you ${n === null ? 'on the deck' : `on slide ${n}`}`, { label: 'Show', run: () => pane.open(t.id) });
      }
    }
  });
  for (const e of ['known', 'people', 'state', 'applied', 'me'] as const) client.on(e, schedule);
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
    keys: { mac: ['Mod+Alt+M'], other: ['Alt+Shift+C'] },
    in: ['canvas', 'text', 'navigator'],
    inText: true,
    menu: { bar: 'Insert', group: 'comment', order: 40 },
    toolbar: { group: 'insert', order: 30, icon: 'comment', label: 'Comment' },
    context: ['element', 'text', 'canvas', 'slide'],
    enabled: online,
    why: () => (online() ? null : OFFLINE),
    run: () => {
      const { el, slide } = shell.target();
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
