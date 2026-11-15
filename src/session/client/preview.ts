// the preview of a version or of a text set aside: the deck as the edit command serves it with
// version=<id> or aside=<id>, in an iframe over the canvas, under a bar with the date, the authors,
// a button per changed slide, what was removed, Show changes, and the actions. the text is read
// once and given to the iframe as srcdoc, with a base of the address that serves it. the page in
// the iframe is a deck without the editor, of the same origin, hence the outlines of the changed
// elements are drawn into it from here, from the marks of the version

import { tokenize, type Token } from '../../editor/tokens.ts';
import type { AsideInfo, Mark, VersionDetail, VersionInfo } from '../protocol.ts';
import { slidesOf, VOID, type Slide } from '../slides.ts';
import type { Client } from './client.ts';
import { make, style } from './dom.ts';
import { authorsOf, dayLabel, personOf, slidesText, timeOf } from './labels.ts';
import { openMenu, type MenuItem } from './menu.ts';

const CSS = `
.beeson-session-preview { position: fixed; z-index: 55; display: flex; flex-direction: column; box-sizing: border-box; background: var(--ed-canvas); color: var(--ed-text); font: 12px/1.35 var(--ed-font); }
.beeson-session-preview[hidden] { display: none; }
.beeson-session-preview .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 6px 10px; background: var(--ed-panel); border-bottom: 1px solid var(--ed-line); }
.beeson-session-preview .bar > div { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; }
.beeson-session-preview .info { flex: 0 1 auto; }
.beeson-session-preview .date { font-weight: 600; overflow-wrap: anywhere; }
.beeson-session-preview .who { display: inline-flex; flex-wrap: wrap; gap: 2px 10px; }
.beeson-session-preview .bar > .slides { flex: 1 1 120px; flex-wrap: nowrap; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: thin; }
.beeson-session-preview .slides > * { flex: none; }
.beeson-session-preview .removed { color: var(--ed-muted); white-space: nowrap; }
.beeson-session-preview .removed:empty { display: none; }
.beeson-session-preview .actions { flex: none; margin-left: auto; }
.beeson-session-preview.two .info { max-width: 55%; flex-wrap: nowrap; overflow: hidden; }
.beeson-session-preview.two .date { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.beeson-session-preview.two .who { flex: none; flex-wrap: nowrap; white-space: nowrap; }
.beeson-session-preview.two .bar > .slides { flex-basis: 0; }
.beeson-session-preview.two .actions { flex: 1 0 100%; margin-left: 0; }
.beeson-session-preview.two .actions .name { display: none; }
.beeson-session-preview label.changes { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; white-space: nowrap; }
.beeson-session-preview label.changes input { margin: 0; width: 16px; height: 16px; }
.beeson-session-preview .bar button.slide { padding: 0 8px; }
.beeson-session-preview .bar button.more { min-width: 32px; padding: 0 6px; }
.beeson-session-preview iframe { flex: 1; min-height: 0; width: 100%; border: 0; background: var(--ed-canvas); }
`;

// drawn into the page of the iframe
const FRAME_CSS = `
[data-beeson-changed] { outline: 6px solid var(--beeson-changed) !important; outline-offset: 6px !important; }
section[data-beeson-changed] { outline-offset: -6px !important; }
html.beeson-hide-changes [data-beeson-changed] { outline: none !important; }
`;

// the bar is wrapped onto two rows, with Name this version in More, below this width in px
const TWO_ROWS = 600;

// text with a base element at the start of its head, so that its relative addresses resolve as in
// a page loaded from href. the address of the page is about:srcdoc, which may not be changed to one
// of http, hence the history of the page is not written, e.g. the hash of the slide by reveal.js
function withBase(text: string, tokens: Token[], href: string): string {
  const head = tokens.find((t) => t.type === 'start' && t.name === 'head');
  const at = head ? head.end : (tokens.find((t) => t.type === 'start')?.start ?? 0);
  const base = `<base href="${href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"><script>history.pushState = history.replaceState = () => {};</script>`;
  return text.slice(0, at) + base + text.slice(at);
}

type Child = { start: number; end: number; name: string };

// the direct children of an element given as its text, with their ranges and names
function childrenOf(html: string): Child[] {
  const out: Child[] = [];
  const stack: { name: string; start: number }[] = [];
  for (const t of tokenize(html)) {
    if (t.type === 'start') {
      const leaf = VOID.has(t.name) || t.selfClosing;
      if (stack.length === 1 && leaf) out.push({ start: t.start, end: t.end, name: t.name });
      if (!leaf) stack.push({ name: t.name, start: t.start });
    } else if (t.type === 'end') {
      const at = stack.map((s) => s.name).lastIndexOf(t.name);
      if (at < 0) continue;
      if (at === 1) out.push({ start: stack[1].start, end: t.end, name: stack[1].name });
      stack.length = at;
    }
  }
  return out;
}

// a changed element: the child of a slide by its name and its place among the children of this
// name, or the slide itself when name is null, with the person id of who changed it
export type Target = { slide: number; name: string | null; nth: number; author: string };

const touches = (m: Mark, start: number, end: number) => (m.start < m.end ? m.start < end && start < m.end : start < m.start && m.start < end);

// the elements of the slides that the marks of a version touch. a mark between the children of a
// slide is of an element removed, which the bar names instead
export function targetsOf(text: string, slides: Slide[], marks: Mark[]): Target[] {
  const out = new Map<string, Target>();
  slides.forEach((s, k) => {
    const mine = marks.filter((m) => touches(m, s.start, s.end));
    if (!mine.length) return;
    const tag = mine.find((m) => touches(m, s.start, s.open));
    if (tag) {
      out.set(`${k}`, { slide: k, name: null, nth: 0, author: tag.author });
      return;
    }
    const counts = new Map<string, number>();
    for (const c of childrenOf(text.slice(s.start, s.end))) {
      const nth = counts.get(c.name) ?? 0;
      counts.set(c.name, nth + 1);
      const m = mine.find((x) => touches(x, s.start + c.start, s.start + c.end));
      if (m) out.set(`${k} ${c.name} ${nth}`, { slide: k, name: c.name, nth, author: m.author });
    }
  });
  return [...out.values()];
}

// the sections of the page that are slides, by the index of the slide in the text. reveal.js takes
// a hidden slide out of the page, hence the hidden slides are skipped when the counts differ
function sectionsOf(doc: Document, text: string, slides: Slide[]): (Element | null)[] {
  const leaves = [...doc.querySelectorAll('.reveal .slides section')].filter((s) => !s.querySelector('section'));
  if (leaves.length === slides.length) return leaves;
  let i = 0;
  return slides.map((s) => (/\sdata-visibility\s*=\s*["']?hidden/i.test(text.slice(s.start, s.open)) ? null : leaves[i++] ?? null));
}

type RevealLike = { isReady?(): boolean; on?(type: string, fn: () => void): void; getIndices(el: Element): { h: number; v?: number }; slide(h: number, v?: number): void };

// the parts of the bar of a version, built once and changed where a version differs
type VersionBar = { info: HTMLElement; date: HTMLElement; who: HTMLElement; slides: HTMLElement; shown: string; failed: HTMLElement; actions: HTMLElement };

export type Actions = {
  restore(v: VersionInfo, text: string | null): Promise<void>;
  name(v: VersionInfo): void;
};

export class Preview {
  readonly el: HTMLElement;
  private readonly client: Client;
  private readonly pane: HTMLElement;
  private readonly actions: Actions;
  private readonly bar: HTMLElement;
  private versionBar: VersionBar | null = null;
  private frame: HTMLIFrameElement;
  private changes = true;
  // the key of what is shown, e.g. version:<id>
  private key = '';
  private version: VersionInfo | null = null;
  private texts = new Map<string, Promise<string>>();
  private text: string | null = null;
  private slides: Slide[] = [];
  private sections: (Element | null)[] = [];

  constructor(client: Client, pane: HTMLElement, actions: Actions) {
    style('preview', CSS);
    this.client = client;
    this.pane = pane;
    this.actions = actions;
    this.el = make('div', 'beeson-session-preview');
    this.el.setAttribute('role', 'region');
    this.el.setAttribute('aria-label', 'Preview');
    this.el.hidden = true;
    this.bar = make('div', 'bar');
    this.frame = make('iframe');
    this.el.append(this.bar, this.frame);
    pane.after(this.el);
    const layout = () => this.layout();
    window.addEventListener('resize', layout);
    window.visualViewport?.addEventListener('resize', layout);
    new ResizeObserver(layout).observe(pane);
  }

  // over the canvas, and above the pane where the pane is a sheet over the bottom of the canvas
  layout(): void {
    if (this.el.hidden) return;
    const c = this.client.shell.history.canvas();
    const p = this.pane.getBoundingClientRect();
    const bottom = !this.pane.hidden && p.left < c.right && c.left < p.right && c.top < p.top && p.top < c.bottom ? p.top : c.bottom;
    Object.assign(this.el.style, { left: `${c.left}px`, top: `${c.top}px`, width: `${c.width}px`, height: `${Math.max(0, bottom - c.top)}px` });
    this.el.classList.toggle('two', c.width < TWO_ROWS);
  }

  hide(): void {
    this.el.hidden = true;
    this.key = '';
    const blank = make('iframe');
    this.frame.replaceWith(blank);
    this.frame = blank;
  }

  private url(kind: 'version' | 'aside', id: string): string {
    const url = new URL(location.href);
    url.search = `?${kind}=${encodeURIComponent(id)}`;
    url.hash = '';
    return url.href;
  }

  // the text of what is shown, read once for its page and its download
  private textOf(kind: 'version' | 'aside', id: string): Promise<string> {
    const key = `${kind}:${id}`;
    let p = this.texts.get(key);
    if (!p) {
      p = fetch(this.url(kind, id), { cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error(`The ${kind === 'version' ? 'version' : 'text'} could not be read`);
        return r.text();
      });
      p.catch(() => this.texts.delete(key));
      this.texts.set(key, p);
    }
    return p;
  }

  // a new iframe for each page, since a second page in one iframe would add an entry to the history
  // of the tab
  private frameFor(kind: 'version' | 'aside'): HTMLIFrameElement {
    const frame = make('iframe');
    frame.title = kind === 'version' ? 'The deck at this version' : 'The text set aside';
    this.frame.replaceWith(frame);
    this.frame = frame;
    this.el.hidden = false;
    this.layout();
    return frame;
  }

  // the page of text in frame, resolved with its window once it is loaded
  private write(frame: HTMLIFrameElement, text: string, tokens: Token[], href: string): Promise<Window | null> {
    const loaded = new Promise<Window | null>((done) => frame.addEventListener('load', () => done(frame.contentWindow), { once: true }));
    frame.srcdoc = withBase(text, tokens, href);
    return loaded;
  }

  private button(label: string, run: () => void, className = ''): HTMLButtonElement {
    const b = make('button', className, label);
    b.type = 'button';
    b.addEventListener('click', run);
    return b;
  }

  private buildVersionBar(): VersionBar {
    const info = make('div', 'info');
    const date = make('span', 'date');
    const who = make('span', 'who');
    info.append(date, who);
    const actions = make('div', 'actions');
    const label = make('label', 'changes');
    const box = make('input');
    box.type = 'checkbox';
    box.checked = this.changes;
    box.addEventListener('change', () => {
      this.changes = box.checked;
      this.frame.contentDocument?.documentElement.classList.toggle('beeson-hide-changes', !this.changes);
    });
    label.append(box, document.createTextNode('Show changes'));
    const more = this.button('⋯', () => this.more(more), 'more');
    more.setAttribute('aria-label', 'More');
    more.setAttribute('aria-haspopup', 'menu');
    const restore = () => this.version && void this.actions.restore(this.version, this.text);
    const name = () => this.version && this.actions.name(this.version);
    actions.append(label, this.button('Restore this version', restore), this.button('Name this version', name, 'name'), more);
    return { info, date, who, slides: make('div', 'slides'), shown: '', failed: make('span', 'removed'), actions };
  }

  // the menu of More, which holds Name this version where the bar is narrow
  private more(button: HTMLElement): void {
    const v = this.version;
    if (!v) return;
    const items: MenuItem[] = [];
    if (this.el.classList.contains('two')) items.push({ label: 'Name this version', run: () => this.actions.name(v) });
    items.push({ label: 'Download This Version', run: () => void this.download('version', v.id) });
    openMenu(button, items);
  }

  // the bar of version v, where only what differs from the bar shown is changed, so that the focus
  // and an open menu of More stay at a new read of the list
  showVersion(v: VersionInfo): void {
    const key = `version:${v.id}`;
    const fresh = key !== this.key;
    this.key = key;
    this.version = v;
    const b = (this.versionBar ??= this.buildVersionBar());
    if (b.info.parentNode !== this.bar) this.bar.replaceChildren(b.info, b.slides, b.actions);
    const date = v.name ? `${v.name}, ${dayLabel(v.time)}, ${timeOf(v.time)}` : `${dayLabel(v.time)}, ${timeOf(v.time)}`;
    if (b.date.textContent !== date) b.date.textContent = date;
    const who = authorsOf(this.client, v.authors);
    if (!who.isEqualNode(b.who)) {
      b.who.replaceWith(who);
      b.who = who;
    }
    if (fresh) b.failed.textContent = '';
    const shown = JSON.stringify([v.slides, v.removed ?? null]);
    if (shown !== b.shown) {
      b.shown = shown;
      const focused = b.slides.contains(document.activeElement) ? document.activeElement!.textContent : null;
      const nodes: Node[] = v.slides.map((n) => this.button(slidesText([n]), () => this.go(n), 'slide'));
      const removed: string[] = [];
      if (v.removed?.slides.length) removed.push(`${slidesText(v.removed.slides)} removed`);
      if (v.removed?.elements) removed.push(`${v.removed.elements} ${v.removed.elements > 1 ? 'elements' : 'element'} removed`);
      if (removed.length) nodes.push(make('span', 'removed', removed.join(', ')));
      b.slides.replaceChildren(...nodes, b.failed);
      if (focused !== null) [...b.slides.querySelectorAll('button')].find((x) => x.textContent === focused)?.focus();
    }
    if (fresh) {
      b.slides.scrollLeft = 0;
      void this.fill(v);
    }
  }

  showAside(a: AsideInfo): void {
    const key = `aside:${a.id}`;
    if (key === this.key) return;
    this.key = key;
    this.version = null;
    const info = make('div', 'info');
    info.append(make('span', 'date', `Set aside, ${dayLabel(a.time)}, ${timeOf(a.time)}`), authorsOf(this.client, [a.author]));
    const actions = make('div', 'actions');
    actions.append(this.button('Download', () => void this.download('aside', a.id)));
    this.bar.replaceChildren(info, actions);
    this.text = null;
    void this.fillAside(a.id, info);
  }

  private async fillAside(id: string, info: HTMLElement): Promise<void> {
    const key = this.key;
    const frame = this.frameFor('aside');
    try {
      const text = await this.textOf('aside', id);
      if (key !== this.key) return;
      await this.write(frame, text, tokenize(text), this.url('aside', id));
    } catch (e) {
      if (key === this.key) info.append(make('span', 'removed', (e as Error).message));
    }
  }

  private async download(kind: 'version' | 'aside', id: string): Promise<void> {
    try {
      this.client.shell.download(await this.textOf(kind, id));
    } catch (e) {
      const d = this.client.shell.dialog({ title: 'The deck could not be downloaded', text: (e as Error).message, buttons: [{ label: 'OK', value: 'ok', primary: true }] });
      void d.open('ok').then(() => d.el.remove());
    }
  }

  // the page of the version, with the outlines of the changed elements, at the first changed slide
  // that is shown
  private async fill(v: VersionInfo): Promise<void> {
    const key = this.key;
    this.text = null;
    const frame = this.frameFor('version');
    let detail: VersionDetail;
    let text: string;
    try {
      [detail, text] = await Promise.all([this.client.transport.get<VersionDetail>(`history/${encodeURIComponent(v.id)}`, { token: this.client.token }), this.textOf('version', v.id)]);
    } catch {
      if (key === this.key && this.versionBar) this.versionBar.failed.textContent = 'The version could not be read';
      return;
    }
    if (key !== this.key) return;
    const tokens = tokenize(text);
    const w = await this.write(frame, text, tokens, this.url('version', v.id));
    const doc = w?.document;
    if (key !== this.key || !doc) return;
    this.text = text;
    this.slides = slidesOf(text, tokens);
    this.sections = sectionsOf(doc, text, this.slides);
    const css = doc.createElement('style');
    css.textContent = FRAME_CSS;
    doc.head.append(css);
    doc.documentElement.classList.toggle('beeson-hide-changes', !this.changes);
    const targets = targetsOf(text, this.slides, detail.marks);
    for (const t of targets) {
      const section = this.sections[t.slide];
      const el = !section || t.name === null ? section : [...section.children].filter((c) => c.localName === t.name)[t.nth];
      if (!el) continue;
      el.setAttribute('data-beeson-changed', t.author);
      (el as HTMLElement).style.setProperty('--beeson-changed', personOf(this.client, t.author)?.color ?? 'var(--muted)');
    }
    // a slide with a changed element first, and of a number without one, a slide of this number
    const marked = (k: number) => targets.some((t) => t.slide === k);
    const first = this.slides.findIndex((s, k) => this.sections[k] && v.slides.includes(s.number) && (marked(k) || !this.slides.some((o, j) => o.number === s.number && marked(j))));
    if (first >= 0) this.show(this.sections[first]!);
    else if (v.slides.length) this.go(v.slides[0]);
  }

  // the slide numbered n shown in the preview. a hidden slide has the number of the slide after it,
  // and it is not in the page
  go(n: number): void {
    const k = this.slides.findIndex((s, i) => s.number === n && this.sections[i]);
    if (k >= 0) this.show(this.sections[k]!);
  }

  // section shown in the preview, once reveal.js is ready there
  private show(section: Element): void {
    const reveal = (this.frame.contentWindow as (Window & { Reveal?: RevealLike }) | null)?.Reveal;
    if (!reveal) return;
    const show = () => {
      const { h, v } = reveal.getIndices(section);
      reveal.slide(h, v);
    };
    if (!reveal.isReady || reveal.isReady()) show();
    else reveal.on?.('ready', show);
  }
}
