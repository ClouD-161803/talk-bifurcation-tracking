// the preview of a version or of a text set aside: the deck as the edit command serves it with
// version=<id> or aside=<id>, in an iframe over the canvas, under a bar with the date, the authors,
// a button per changed slide, what was removed, Show changes, and the actions. the page in the
// iframe is a deck without the editor, of the same origin, hence the outlines of the changed
// elements are drawn into it from here, from the marks of the version

import { tokenize } from '../../editor/tokens.ts';
import type { AsideInfo, Mark, VersionDetail, VersionInfo } from '../protocol.ts';
import { slidesOf, VOID, type Slide } from '../slides.ts';
import type { Client } from './client.ts';
import { make, style } from './dom.ts';
import { authorsOf, dayLabel, personOf, slidesText, timeOf } from './labels.ts';

const CSS = `
.beeson-session-preview { position: fixed; z-index: 55; display: flex; flex-direction: column; box-sizing: border-box; background: var(--ed-canvas); color: var(--ed-text); font: 12px/1.35 var(--ed-font); }
.beeson-session-preview[hidden] { display: none; }
.beeson-session-preview .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 6px 10px; background: var(--ed-panel); border-bottom: 1px solid var(--ed-line); }
.beeson-session-preview .bar > div { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; }
.beeson-session-preview .info { flex: 1 1 auto; }
.beeson-session-preview .date { font-weight: 600; overflow-wrap: anywhere; }
.beeson-session-preview .who { display: inline-flex; flex-wrap: wrap; gap: 2px 10px; }
.beeson-session-preview .removed { color: var(--ed-muted); }
.beeson-session-preview .actions { margin-left: auto; }
.beeson-session-preview.two .actions { flex: 1 0 100%; margin-left: 0; }
.beeson-session-preview label.changes { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; white-space: nowrap; }
.beeson-session-preview label.changes input { margin: 0; width: 16px; height: 16px; }
.beeson-session-preview .bar button.slide { padding: 0 8px; }
.beeson-session-preview iframe { flex: 1; min-height: 0; width: 100%; border: 0; background: var(--ed-canvas); }
`;

// drawn into the page of the iframe
const FRAME_CSS = `
[data-beeson-changed] { outline: 6px solid var(--beeson-changed) !important; outline-offset: 6px !important; }
section[data-beeson-changed] { outline-offset: -6px !important; }
html.beeson-hide-changes [data-beeson-changed] { outline: none !important; }
`;

// the bar is wrapped onto two rows below this width in px
const TWO_ROWS = 600;

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
  private frame: HTMLIFrameElement;
  private changes = true;
  // the key of what is shown, e.g. version:<id>
  private key = '';
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

  // a new iframe for each page, since a change of src would add an entry to the history of the tab
  private load(kind: 'version' | 'aside', id: string): Promise<Window | null> {
    const frame = make('iframe');
    frame.title = kind === 'version' ? 'The deck at this version' : 'The text set aside';
    const loaded = new Promise<Window | null>((done) => frame.addEventListener('load', () => done(frame.contentWindow), { once: true }));
    frame.src = this.url(kind, id);
    this.frame.replaceWith(frame);
    this.frame = frame;
    this.el.hidden = false;
    this.layout();
    return loaded;
  }

  private button(label: string, run: () => void, className = ''): HTMLButtonElement {
    const b = make('button', className, label);
    b.type = 'button';
    b.addEventListener('click', run);
    return b;
  }

  showVersion(v: VersionInfo): void {
    const key = `version:${v.id}`;
    const fresh = key !== this.key;
    this.key = key;
    const info = make('div', 'info');
    info.append(make('span', 'date', v.name ? `${v.name}, ${dayLabel(v.time)}, ${timeOf(v.time)}` : `${dayLabel(v.time)}, ${timeOf(v.time)}`), authorsOf(this.client, v.authors));
    const slides = make('div', 'slides');
    for (const n of v.slides) slides.append(this.button(slidesText([n]), () => this.go(n), 'slide'));
    const removed: string[] = [];
    if (v.removed?.slides.length) removed.push(`${slidesText(v.removed.slides)} removed`);
    if (v.removed?.elements) removed.push(`${v.removed.elements} ${v.removed.elements > 1 ? 'elements' : 'element'} removed`);
    if (removed.length) slides.append(make('span', 'removed', removed.join(', ')));
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
    const text = () => this.text;
    actions.append(label, this.button('Restore this version', () => void this.actions.restore(v, text())), this.button('Name this version', () => this.actions.name(v)));
    this.bar.replaceChildren(info, slides, actions);
    if (fresh) void this.fill(v);
  }

  showAside(a: AsideInfo): void {
    const key = `aside:${a.id}`;
    if (key === this.key) return;
    this.key = key;
    const info = make('div', 'info');
    info.append(make('span', 'date', `Set aside, ${dayLabel(a.time)}, ${timeOf(a.time)}`), authorsOf(this.client, [a.author]));
    this.bar.replaceChildren(info);
    this.text = null;
    void this.load('aside', a.id);
  }

  // the page of the version, with the outlines of the changed elements, at the first changed slide
  private async fill(v: VersionInfo): Promise<void> {
    const key = this.key;
    this.text = null;
    const win = this.load('version', v.id);
    let detail: VersionDetail;
    let text: string;
    try {
      [detail, text] = await Promise.all([this.client.transport.get<VersionDetail>(`history/${encodeURIComponent(v.id)}`, { token: this.client.token }), this.textOf('version', v.id)]);
    } catch {
      return;
    }
    const w = await win;
    const doc = w?.document;
    if (key !== this.key || !doc) return;
    this.text = text;
    this.slides = slidesOf(text);
    this.sections = sectionsOf(doc, text, this.slides);
    const css = doc.createElement('style');
    css.textContent = FRAME_CSS;
    doc.head.append(css);
    doc.documentElement.classList.toggle('beeson-hide-changes', !this.changes);
    for (const t of targetsOf(text, this.slides, detail.marks)) {
      const section = this.sections[t.slide];
      const el = !section || t.name === null ? section : [...section.children].filter((c) => c.localName === t.name)[t.nth];
      if (!el) continue;
      el.setAttribute('data-beeson-changed', t.author);
      (el as HTMLElement).style.setProperty('--beeson-changed', personOf(this.client, t.author)?.color ?? 'var(--muted)');
    }
    if (v.slides.length) this.go(v.slides[0]);
  }

  // the slide numbered n shown in the preview, once reveal.js is ready there
  go(n: number): void {
    const section = this.sections[this.slides.findIndex((s) => s.number === n)];
    const reveal = (this.frame.contentWindow as (Window & { Reveal?: RevealLike }) | null)?.Reveal;
    if (!section || !reveal) return;
    const show = () => {
      const { h, v } = reveal.getIndices(section);
      reveal.slide(h, v);
    };
    if (!reveal.isReady || reveal.isReady()) show();
    else reveal.on?.('ready', show);
  }
}
