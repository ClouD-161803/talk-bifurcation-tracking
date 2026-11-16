// the badges of the comments on the canvas and the counts on the rows of the navigator. a badge holds
// the count of the open threads of an element, 4 px outside its upper right corner, or 18 px while
// the element is selected or holds the caret, so that the grips of its frame stay free, or of a
// slide, inside its upper right corner, and it is filled violet while one of them is unread. a badge
// whose area of a tap would meet the one of a badge above it is drawn below it, and the badge of a
// turned element is outside its own upper right corner. the boxes of the elements are read in one
// requestAnimationFrame after a change of the deck, of the slide, or of the threads, and they are
// kept in px of the slide. a scroll or a zoom then moves the badges by the origin and the scale of
// the stage alone, without reading the box of any element

import type { Comments } from './comments.ts';
import { make, style } from './dom.ts';

// the reach in px of the area around a badge that takes a tap, which two badges do not share
const TAP = 7;

const CSS = `
.beeson-comment-badges { visibility: visible; }
.beeson-comment-badges[hidden] { display: none; }
.beeson-comment-badge { position: absolute; left: 0; top: 0; min-width: 20px; height: 20px; padding: 0 6px; box-sizing: border-box; border: 1.5px solid var(--ed-select, #8a2be2); border-radius: 10px 10px 10px 2px; background: var(--ed-panel, #fff); color: var(--ed-text, #1d1d1f); font: 600 11px/17px var(--ed-font, system-ui); text-align: center; pointer-events: auto; cursor: pointer; }
.beeson-comment-badge.slide { border-radius: 10px 10px 2px 10px; }
.beeson-comment-badge.unread { background: var(--ed-select, #8a2be2); color: var(--ed-on-select, #fff); }
.beeson-comment-badge::after { content: ''; position: absolute; inset: -${TAP}px; }
.beeson-comment-badge:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: 2px; }
.beeson-edit-nav .row .frame .beeson-comment-count { position: absolute; left: -6px; top: -6px; z-index: 1; min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: 8px; background: var(--ed-panel); color: var(--ed-text); box-shadow: 0 0 0 1.5px var(--ed-select); font: 600 10px/16px var(--ed-font); text-align: center; pointer-events: none; }
.beeson-edit-nav .row .frame .beeson-comment-count.unread { background: var(--ed-select); color: var(--ed-on-select); }
html.beeson-history .beeson-comment-badges, html.beeson-history .beeson-edit-nav .beeson-comment-count { display: none; }
`;

const KEY = 'beeson-comment-badges';
const H = 20;

// out is the outward diagonal of the upper right corner of a turned element, of length 1
type Box = { target: Element; slide: boolean; selected: boolean; x: number; y: number; w: number; out: [number, number] | null; badge: HTMLButtonElement };

export class Badges {
  readonly layer = make('div', 'beeson-badges beeson-comment-badges');
  shown = true;
  private boxes: Box[] = [];
  private frame = 0;
  private readonly comments: Comments;
  private readonly open: (target: Element) => void;

  constructor(comments: Comments, open: (target: Element) => void) {
    this.comments = comments;
    this.open = open;
    style('badges', CSS);
    try {
      this.shown = localStorage.getItem(KEY) !== '0';
    } catch {
      // a page without storage shows the badges
    }
    this.layer.hidden = !this.shown;
    document.body.append(this.layer);
    const app = comments.client.app;
    app.onRefresh(['content', 'selection', 'slide', 'structure'], () => this.schedule());
    app.listen('slide', () => this.schedule());
    app.listen('resize', () => this.place());
    comments.client.on('applied', () => this.schedule());
    comments.client.on('tex', () => this.schedule());
  }

  toggle(): void {
    this.shown = !this.shown;
    this.layer.hidden = !this.shown;
    try {
      localStorage.setItem(KEY, this.shown ? '1' : '0');
    } catch {
      // kept for this page only
    }
    this.schedule();
  }

  schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.measure();
    });
  }

  // the open threads of each element and slide, with the unread among them
  private groups(): Map<Element, { n: number; unread: boolean; slide: boolean }> {
    const places = this.comments.places();
    const groups = new Map<Element, { n: number; unread: boolean; slide: boolean }>();
    for (const t of this.comments.threads.values()) {
      const p = places.get(t.id);
      const target = p?.el ?? p?.slide;
      if (t.resolved || !target) continue;
      const g = groups.get(target) ?? { n: 0, unread: false, slide: !p!.el };
      g.n++;
      g.unread ||= this.comments.unread(t);
      groups.set(target, g);
    }
    return groups;
  }

  private measure(): void {
    const groups = this.groups();
    this.counts(groups);
    const app = this.comments.client.app;
    const current = app.current();
    // the mode of Version History shows another version of the deck, without the badges
    const here = current ? [...groups].filter(([target]) => current.contains(target)) : [];
    // the origin of the stage is a read of layout, which a drag on a slide without threads does not make
    if (!this.shown || !here.length || app.state !== 'loaded' || document.documentElement.classList.contains('beeson-history')) {
      this.layer.replaceChildren();
      this.boxes = [];
      return;
    }
    const { origin, scale } = app.stage;
    const old = new Map(this.boxes.map((b) => [b.target, b.badge]));
    const boxes: Box[] = [];
    for (const [target, g] of here) {
      const r = target.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      // the upper right corner of a turned element is its own and not that of its bounding box
      const deg = target instanceof HTMLElement ? parseFloat(target.style.rotate) || 0 : 0;
      let x = r.right;
      let y = r.top;
      let out: [number, number] | null = null;
      if (deg) {
        const a = (deg * Math.PI) / 180;
        const w = ((target as HTMLElement).offsetWidth * scale) / 2;
        const h = ((target as HTMLElement).offsetHeight * scale) / 2;
        x = (r.left + r.right) / 2 + w * Math.cos(a) + h * Math.sin(a);
        y = (r.top + r.bottom) / 2 + w * Math.sin(a) - h * Math.cos(a);
        out = [(Math.cos(a) + Math.sin(a)) / Math.SQRT2, (Math.sin(a) - Math.cos(a)) / Math.SQRT2];
      }
      const badge = old.get(target) ?? this.badge(target);
      const label = `${g.n} ${g.n === 1 ? 'thread' : 'threads'}${g.unread ? ', unread' : ''}`;
      if (badge.textContent !== String(g.n)) badge.textContent = String(g.n);
      badge.setAttribute('aria-label', label);
      badge.title = label;
      badge.classList.toggle('unread', g.unread);
      badge.classList.toggle('slide', g.slide);
      // the text element of the caret is framed with its grips too, see caretElement() of frames.ts
      const sel = app.selection;
      const selected = sel.kind === 'elements' ? sel.has(target) : sel.kind === 'text' && target.contains(sel.items[0]);
      boxes.push({ target, slide: g.slide, selected, x: (x - origin.x) / scale, y: (y - origin.y) / scale, w: 20 + 7 * (String(g.n).length - 1), out, badge });
    }
    this.boxes = boxes;
    this.layer.replaceChildren(...boxes.map((b) => b.badge));
    this.place();
  }

  private badge(target: Element): HTMLButtonElement {
    const b = make('button', 'beeson-comment-badge');
    b.type = 'button';
    b.tabIndex = -1;
    b.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.open(target);
    });
    return b;
  }

  // the badges moved to the stage as it is now, inside the viewport of the canvas
  private place(): void {
    if (!this.boxes.length) return;
    const stage = this.comments.client.app.stage;
    const { origin: o, scale: s, viewport: v } = stage;
    const bottom = v.bottom - H - 2;
    const at = this.boxes.map((b) => {
      const gap = b.selected ? 18 : 4;
      let left = b.slide ? o.x + b.x * s - b.w - 6 : o.x + b.x * s + gap;
      let top = b.slide ? o.y + b.y * s + 6 : o.y + b.y * s - 4 - H;
      // the badge of a turned element is centered on the outward diagonal of its corner, as far out
      // as the upright badge is at 0 degrees and clear of the element at every angle
      if (b.out) {
        const [dx, dy] = b.out;
        const far = gap * Math.SQRT2 + (Math.abs(dx) * b.w + Math.abs(dy) * H) / 2;
        left = o.x + b.x * s + dx * far - b.w / 2;
        top = o.y + b.y * s + dy * far - H / 2;
      }
      // moved into the viewport first, so that the overlaps are read on the places drawn
      return { b, left: Math.max(v.left + 2, Math.min(left, v.right - b.w - 2)), top: Math.max(v.top + 2, Math.min(top, bottom)) };
    });
    // a badge whose area of a tap meets the one of a badge placed above it is pushed down below
    // it, and not past the bottom of the viewport, where it may then meet another
    const gap = 2 * TAP;
    at.sort((p, q) => p.top - q.top);
    for (let k = 0; k < at.length; k++) {
      const { b, left } = at[k];
      let { top } = at[k];
      for (let j = 0; j < k; j++) {
        const p = at[j];
        if (left < p.left + p.b.w + gap && p.left < left + b.w + gap && top < p.top + H + gap) top = p.top + H + gap;
      }
      at[k].top = top = Math.min(top, bottom);
      b.badge.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    }
  }

  // the count of the open threads of each slide on its row of the navigator
  private counts(groups: Map<Element, { n: number; unread: boolean }>): void {
    const per = new Map<Element, { n: number; unread: boolean }>();
    for (const [target, g] of groups) {
      const slide = target.closest('section') ?? target;
      const c = per.get(slide) ?? { n: 0, unread: false };
      c.n += g.n;
      c.unread ||= g.unread;
      per.set(slide, c);
    }
    for (const old of document.querySelectorAll('.beeson-edit-nav .beeson-comment-count')) {
      const row = old.closest('.row');
      if (![...per.keys()].some((s) => this.comments.client.shell.comments.row(s) === row)) old.remove();
    }
    for (const [slide, c] of per) {
      const frame = this.comments.client.shell.comments.row(slide)?.querySelector('.frame');
      if (!frame) continue;
      let span = frame.querySelector<HTMLElement>('.beeson-comment-count');
      if (!span) {
        span = make('span', 'beeson-comment-count');
        span.setAttribute('aria-hidden', 'true');
        frame.append(span);
      }
      if (span.textContent !== String(c.n)) span.textContent = String(c.n);
      span.classList.toggle('unread', c.unread);
    }
  }
}
