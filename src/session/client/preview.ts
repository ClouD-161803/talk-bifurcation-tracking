import { tokenize, type Token } from '../../editor/tokens.ts';
import type { AsideInfo, Mark, Removal, VersionDetail, VersionInfo } from '../protocol.ts';
import { slidesOf, VOID, type Slide } from '../slides.ts';
import type { Client } from './client.ts';
import { make, style } from './dom.ts';
import type { MenuItem, OpenMenu } from '../../editor/ui/menu.ts';
import { authorsOf, dayLabel, personOf, slidesText, timeOf } from './labels.ts';

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
.beeson-session-preview :is(.removed, .notes) { color: var(--ed-muted); white-space: nowrap; }
.beeson-session-preview :is(.removed, .notes):empty { display: none; }
.beeson-session-preview .actions { flex: none; margin-left: auto; }
.beeson-session-preview.two .info { flex: 1 1 0; max-width: max-content; overflow: hidden; }
.beeson-session-preview.two .date { flex: 1 1 0; min-width: 6.5em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.beeson-session-preview.two .bar > .slides { flex: none; max-width: 45%; }
.beeson-session-preview.two .actions { flex: 1 0 100%; margin-left: 0; }
.beeson-session-preview.two .actions .name { display: none; }
.beeson-session-preview label.changes { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; white-space: nowrap; }
.beeson-session-preview label.changes input { margin: 0; width: 16px; height: 16px; accent-color: var(--ed-select); }
.beeson-session-preview .bar button.slide { padding: 0 8px; }
.beeson-session-preview .bar button.more { min-width: 32px; padding: 0 6px; }
.beeson-session-preview iframe { flex: 1; min-height: 0; width: 100%; border: 0; background: var(--ed-canvas); }
`;

const FRAME_CSS = `
.reveal :is(.progress, .scrub, .slide-number), .theme-switch { display: none !important; }
[data-beeson-changed] { outline: 6px solid var(--beeson-changed) !important; outline-offset: 6px !important; }
section[data-beeson-changed] { outline-offset: -6px !important; }
html.beeson-hide-changes [data-beeson-changed] { outline: none !important; }
del[data-beeson-removed] { color: var(--beeson-removed); text-decoration: line-through; }
html.beeson-hide-changes del[data-beeson-removed] { display: none; }
html:not(.beeson-hide-changes) :is([data-beeson-changed].fragment, [data-beeson-changed] .fragment) { opacity: 1 !important; visibility: visible !important; }
`;

const TWO_ROWS = 600;

const NAVIGATION = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

function withBase(text: string, tokens: Token[], href: string): string {
  const head = tokens.find((t) => t.type === 'start' && t.name === 'head');
  const at = head ? head.end : (tokens.find((t) => t.type === 'start')?.start ?? 0);
  const base = `<base href="${href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"><script>history.pushState = history.replaceState = () => {};</script><style>${FRAME_CSS}</style>`;
  return text.slice(0, at) + base + text.slice(at);
}

type Child = { start: number; end: number; name: string };

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

export type Target = { slide: number; name: string | null; nth: number; of: number; author: string; start: number; end: number };

const touches = (m: Mark, start: number, end: number) => (m.start < m.end ? m.start < end && start < m.end : start < m.start && m.start < end);

export function targetsOf(text: string, slides: Slide[], marks: Mark[]): Target[] {
  const out = new Map<string, Target>();
  slides.forEach((s, k) => {
    const mine = marks.filter((m) => touches(m, s.start, s.end));
    if (!mine.length) return;
    const tag = mine.find((m) => touches(m, s.start, s.open));
    if (tag) {
      out.set(`${k}`, { slide: k, name: null, nth: 0, of: 1, author: tag.author, start: s.start, end: s.end });
      return;
    }
    const counts = new Map<string, number>();
    const children = childrenOf(text.slice(s.start, s.end));
    for (const c of children) {
      const nth = counts.get(c.name) ?? 0;
      counts.set(c.name, nth + 1);
      const m = mine.find((x) => touches(x, s.start + c.start, s.start + c.end));
      if (m) out.set(`${k} ${c.name} ${nth}`, { slide: k, name: c.name, nth, of: children.filter((x) => x.name === c.name).length, author: m.author, start: s.start + c.start, end: s.start + c.end });
    }
  });
  return [...out.values()];
}

type Struck = { removal: Removal; node: Text | Element; offset: number };

function addedIn(el: Element, text: string, tokens: Token[], start: number, end: number, marks: Mark[], removals: Removal[], out: Map<string, Range[]> | null, struck: Struck[]): void {
  if (/\\[([\\$]|\\(?:begin|(?:eq)?ref)\b|<(script|math)\b/i.test(text.slice(start, end))) return;
  let lo = 0;
  for (let hi = tokens.length; lo < hi; ) {
    const mid = (lo + hi) >> 1;
    if (tokens[mid].start < start) lo = mid + 1;
    else hi = mid;
  }
  const texts: Token[] = [];
  for (let k = lo; k < tokens.length && tokens[k].end <= end; k++) if (tokens[k].type === 'text') texts.push(tokens[k]);
  const nodes: Text[] = [];
  const walk = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) nodes.push(walk.currentNode as Text);
  if (nodes.length !== texts.length || texts.some((t, i) => text.slice(t.start, t.end) !== nodes[i].data)) return;
  for (const r of removals) {
    if (r.at <= start || r.at >= end) continue;
    const i = texts.findIndex((t, k) => t.start <= r.at && r.at <= t.end && /\S/.test(nodes[k].data));
    if (i >= 0) struck.push({ removal: r, node: nodes[i], offset: r.at - texts[i].start });
    else if (!texts.length) struck.push({ removal: r, node: el, offset: 0 });
  }
  if (!out) return;
  const mine = marks.filter((m) => m.start < end && start < m.end);
  texts.forEach((t, i) => {
    for (const m of mine) {
      if (m.end <= t.start || t.end <= m.start) continue;
      const r = el.ownerDocument.createRange();
      r.setStart(nodes[i], Math.max(m.start, t.start) - t.start);
      r.setEnd(nodes[i], Math.min(m.end, t.end) - t.start);
      if (!out.has(m.author)) out.set(m.author, []);
      out.get(m.author)!.push(r);
    }
  });
}

function sectionsOf(doc: Document, text: string, slides: Slide[]): (Element | null)[] {
  const shown = [...doc.querySelectorAll('.reveal .slides section')].filter((s) => !s.querySelector('section') && !/^hidden/i.test(s.getAttribute('data-visibility') ?? ''));
  let i = 0;
  return slides.map((s) => (/\sdata-visibility\s*=\s*["']?hidden/i.test(text.slice(s.start, s.open)) ? null : shown[i++] ?? null));
}

type RevealLike = { isReady?(): boolean; on?(type: string, fn: () => void): void; getIndices(el: Element): { h: number; v?: number }; slide(h: number, v?: number): void };

type VersionBar = { info: HTMLElement; date: HTMLElement; who: HTMLElement; slides: HTMLElement; shown: string; notes: HTMLElement; failed: HTMLElement; actions: HTMLElement };

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
  private frame: HTMLIFrameElement | null = null;
  private changes = true;
  private key = '';
  private version: VersionInfo | null = null;
  private read: { key: string; text: Promise<string> } | null = null;
  private text: string | null = null;
  private slides: Slide[] = [];
  private sections: (Element | null)[] = [];
  private asked: number | null = null;
  private menu: OpenMenu | null = null;

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
    this.el.append(this.bar);
    pane.after(this.el);
    const layout = () => this.layout();
    window.addEventListener('resize', layout);
    window.visualViewport?.addEventListener('resize', layout);
    new ResizeObserver(layout).observe(pane);
  }

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
    this.version = null;
    this.read = null;
    this.text = null;
    this.slides = [];
    this.sections = [];
    this.frame?.remove();
    this.frame = null;
  }

  private url(kind: 'version' | 'aside', id: string): string {
    const url = new URL(location.href);
    url.search = `?${kind}=${encodeURIComponent(id)}`;
    url.hash = '';
    return url.href;
  }

  private textOf(kind: 'version' | 'aside', id: string): Promise<string> {
    const key = `${kind}:${id}`;
    if (this.read?.key === key) return this.read.text;
    const text = fetch(this.url(kind, id), { cache: 'no-store' }).then((r) => {
      if (!r.ok) throw new Error(`The ${kind === 'version' ? 'version' : 'text'} could not be read`);
      return r.text();
    });
    const read = { key, text };
    text.catch(() => {
      if (this.read === read) this.read = null;
    });
    this.read = read;
    return text;
  }

  private frameFor(kind: 'version' | 'aside'): HTMLIFrameElement {
    const frame = make('iframe');
    frame.title = kind === 'version' ? 'The deck at this version' : 'The text set aside';
    if (this.frame) this.frame.replaceWith(frame);
    else this.el.append(frame);
    this.frame = frame;
    this.slides = [];
    this.sections = [];
    this.asked = null;
    this.el.hidden = false;
    this.layout();
    return frame;
  }

  private write(frame: HTMLIFrameElement, text: string, tokens: Token[], href: string): Promise<Window | null> {
    const loaded = new Promise<Window | null>((done) => frame.addEventListener('load', () => done(frame.contentWindow), { once: true }));
    frame.srcdoc = withBase(text, tokens, href);
    return loaded;
  }

  private keys(w: Window): void {
    w.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      } else if (!NAVIGATION.has(ev.key) || ev.ctrlKey || ev.metaKey || ev.altKey) ev.stopImmediatePropagation();
    }, true);
    w.addEventListener('keypress', (ev) => ev.stopImmediatePropagation(), true);
  }

  private button(label: string, run: (ev: MouseEvent) => void, className = ''): HTMLButtonElement {
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
      this.frame?.contentDocument?.documentElement.classList.toggle('beeson-hide-changes', !this.changes);
    });
    label.append(box, document.createTextNode('Show changes'));
    const more = this.button('⋯', (ev) => this.more(more, ev.detail === 0), 'more');
    more.setAttribute('aria-label', 'More');
    more.setAttribute('aria-haspopup', 'menu');
    const restore = () => this.version && void this.actions.restore(this.version, this.text);
    const name = () => this.version && this.actions.name(this.version);
    actions.append(label, this.button('Restore this version', restore), this.button('Tag this version', name, 'name'), more);
    return { info, date, who, slides: make('div', 'slides'), shown: '', notes: make('span', 'notes'), failed: make('span', 'removed'), actions };
  }

  private more(button: HTMLElement, keyboard: boolean): void {
    const v = this.version;
    if (this.menu) return this.menu.close();
    if (!v) return;
    const items: MenuItem[] = [];
    if (this.el.classList.contains('two')) items.push({ label: 'Tag this version', run: () => this.actions.name(v) });
    items.push({ label: 'Download This Version', run: () => void this.download('version', v.id) });
    const m = this.client.shell.menu(items, {
      anchor: button.getBoundingClientRect(),
      placement: 'below',
      owner: button,
      keyboard,
      label: 'More',
      onClose: () => {
        if (this.menu === m) this.menu = null;
      },
    });
    this.menu = m;
  }

  showVersion(v: VersionInfo): void {
    const key = `version:${v.id}`;
    const fresh = key !== this.key;
    this.key = key;
    this.version = v;
    const b = (this.versionBar ??= this.buildVersionBar());
    if (b.info.parentNode !== this.bar) this.bar.replaceChildren(b.info, b.slides, b.actions);
    const date = v.name ? `${v.name}, ${dayLabel(v.time)}, ${timeOf(v.time)}` : `${dayLabel(v.time)}, ${timeOf(v.time)}`;
    if (b.date.textContent !== date) b.date.textContent = date;
    const who = v.start ? make('span', 'who', 'Start of the history') : authorsOf(this.client, v.authors);
    if (!who.isEqualNode(b.who)) {
      b.who.replaceWith(who);
      b.who = who;
    }
    if (fresh) b.notes.textContent = b.failed.textContent = '';
    const shown = JSON.stringify([v.slides, v.removed ?? null]);
    if (shown !== b.shown) {
      b.shown = shown;
      const focused = b.slides.contains(document.activeElement) ? document.activeElement!.textContent : null;
      const nodes: Node[] = v.slides.map((n) => this.button(slidesText([n]), () => this.go(n), 'slide'));
      const removed: string[] = [];
      if (v.removed?.slides.length) removed.push(`${slidesText(v.removed.slides)} removed`);
      if (v.removed?.elements) removed.push(`${v.removed.elements} ${v.removed.elements > 1 ? 'elements' : 'element'} removed`);
      if (removed.length) nodes.push(make('span', 'removed', removed.join(', ')));
      b.slides.replaceChildren(...nodes, b.notes, b.failed);
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
    const slides = make('div', 'slides');
    this.bar.replaceChildren(info, slides, actions);
    this.text = null;
    void this.fillAside(a.id, info, slides);
  }

  private async fillAside(id: string, info: HTMLElement, bar: HTMLElement): Promise<void> {
    const key = this.key;
    const frame = this.frameFor('aside');
    try {
      const text = await this.textOf('aside', id);
      if (key !== this.key) return;
      const tokens = tokenize(text);
      const slides = slidesOf(text, tokens);
      const now = this.client.snapshot()?.mine ?? text;
      const current = slidesOf(now).map((s) => now.slice(s.start, s.end));
      const kept = new Set(current);
      const placed = current.length === slides.length;
      const differs = (s: (typeof slides)[number], k: number): boolean => {
        const t = text.slice(s.start, s.end);
        return !kept.has(t) || (placed && current[k] !== t);
      };
      const differ = [...new Set(slides.filter(differs).map((s) => s.number))];
      bar.replaceChildren(...differ.map((n) => this.button(slidesText([n]), () => this.go(n), 'slide')));
      const w = await this.write(frame, text, tokens, this.url('aside', id));
      if (key !== this.key || !w) return;
      this.keys(w);
      this.slides = slides;
      this.sections = sectionsOf(w.document, text, slides);
      if (differ.length) this.go(differ[0]);
      if (this.asked !== null) this.go(this.asked);
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
    if (key !== this.key || !w || !doc) return;
    this.keys(w);
    this.text = text;
    this.slides = slidesOf(text, tokens);
    this.sections = sectionsOf(doc, text, this.slides);
    doc.documentElement.classList.toggle('beeson-hide-changes', !this.changes);
    const targets = targetsOf(text, this.slides, detail.marks);
    const notes = new Set<number>();
    const added = new Map<string, Range[]>();
    const struck: Struck[] = [];
    const tone = (author: string) => personOf(this.client, author)?.color ?? 'var(--muted)';
    const css = (w as Window & typeof globalThis).CSS?.highlights ? (w as Window & typeof globalThis) : null;
    for (const t of targets) {
      const section = this.sections[t.slide];
      const same = !section || t.name === null ? [section] : [...section.children].filter((c) => c.localName === t.name && !c.matches('[data-generated], [data-restore]'));
      const el = same[t.nth];
      if (!el) continue;
      el.setAttribute('data-beeson-changed', t.author);
      (el as HTMLElement).style.setProperty('--beeson-changed', tone(t.author));
      if (same.length === t.of) addedIn(el, text, tokens, t.start, t.end, detail.marks, detail.removals ?? [], css && added, struck);
      if (el.matches('aside.notes')) notes.add(this.slides[t.slide].number);
    }
    let rules = '';
    [...added].forEach(([author, ranges], k) => {
      css!.CSS.highlights.set(`beeson-changed-${k}`, new css!.Highlight(...ranges));
      const probe = doc.body.appendChild(doc.createElement('span'));
      probe.style.color = tone(author);
      rules += `html:not(.beeson-hide-changes) ::highlight(beeson-changed-${k}) { background-color: color-mix(in srgb, ${w.getComputedStyle(probe).color} 35%, transparent); }\n`;
      probe.remove();
    });
    if (rules) doc.head.appendChild(doc.createElement('style')).textContent = rules;
    for (const s of struck.sort((a, b) => b.removal.at - a.removal.at)) {
      const del = doc.createElement('del');
      del.setAttribute('data-beeson-removed', s.removal.author);
      del.style.setProperty('--beeson-removed', tone(s.removal.author));
      const who = personOf(this.client, s.removal.author);
      del.title = who ? `Removed by ${who.name}` : 'Removed in index.html outside the editor';
      const parsed = doc.createElement('template');
      parsed.innerHTML = s.removal.text;
      del.textContent = parsed.content.textContent;
      if (!del.textContent) continue;
      if (s.node.nodeType === Node.TEXT_NODE) (s.node as Text).splitText(s.offset).before(del);
      else (s.node as Element).append(del);
    }
    if (notes.size && this.versionBar) this.versionBar.notes.textContent = `Notes of ${slidesText([...notes].sort((x, y) => x - y))} changed`;
    const marked = (k: number) => targets.some((t) => t.slide === k);
    const first = this.slides.findIndex((s, k) => this.sections[k] && v.slides.includes(s.number) && (marked(k) || !this.slides.some((o, j) => o.number === s.number && marked(j))));
    if (first >= 0) this.show(this.sections[first]!);
    else if (v.slides.length) this.go(v.slides[0]);
    if (this.asked !== null) this.go(this.asked);
  }

  go(n: number): void {
    if (!this.slides.length) this.asked = n;
    const k = this.slides.findIndex((s, i) => s.number === n && this.sections[i]);
    if (k >= 0) this.show(this.sections[k]!);
  }

  private show(section: Element): void {
    const reveal = (this.frame?.contentWindow as (Window & { Reveal?: RevealLike }) | null | undefined)?.Reveal;
    if (!reveal) return;
    const show = () => {
      const { h, v } = reveal.getIndices(section);
      reveal.slide(h, v);
    };
    if (!reveal.isReady || reveal.isReady()) show();
    else reveal.on?.('ready', show);
  }
}
