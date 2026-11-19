import type { App, Selector } from './app.ts';
import type { Pairing } from './render.ts';
import { BY_ITSELF, MOVABLE, OUTSIDE, linesOf, movableOf, movablesOf, pickOf } from './canvas/hit.ts';
import { selectRun } from './text/flow.ts';

export type SelectionKind = 'none' | 'elements' | 'text' | 'slides';

export interface Selection {
  readonly kind: SelectionKind;
  readonly items: readonly Element[];
  set(kind: SelectionKind, items: Element[]): void;
  add(item: Element): void;
  toggle(item: Element): void;
  clear(): void;
  selectAll(): void;
  listen(fn: () => void): void;
  has(item: Element): boolean;
  elements(): Element[];
  only(): Element | null;
  changed(): (el: Element) => void;
}

const inOrder = (items: Element[]): Element[] =>
  [...new Set(items)].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

function mark(pairing: Pairing | null): void {
  for (const el of document.querySelectorAll('.beeson-movable')) {
    el.classList.remove('beeson-movable');
    el.removeAttribute('tabindex');
  }
  if (!pairing) return;
  for (const [el, src] of pairing.elements) {
    if (!src.open || !el.matches(BY_ITSELF) || el.closest(OUTSIDE)) continue;
    const up = el.parentElement?.closest(MOVABLE);
    if (up && el.closest('section')?.contains(up)) continue;
    el.classList.add('beeson-movable');
    el.setAttribute('tabindex', '0');
    if (!el.hasAttribute('aria-label') && !el.hasAttribute('alt')) el.setAttribute('aria-label', 'Figure. Move it with the arrow keys, and deselect it with Esc');
  }
}

function caretAt(x: number, y: number): { node: Text; offset: number } | null {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  const p = d.caretPositionFromPoint?.(x, y);
  if (p) return p.offsetNode instanceof Text ? { node: p.offsetNode, offset: p.offset } : null;
  const r = document.caretRangeFromPoint?.(x, y);
  return r && r.startContainer instanceof Text ? { node: r.startContainer, offset: r.startOffset } : null;
}

export function placeCaretAt(host: Element, x: number, y: number): void {
  const at = caretAt(x, y);
  (host as HTMLElement).focus({ preventScroll: true });
  if (at && host.contains(at.node)) getSelection()?.setBaseAndExtent(at.node, at.offset, at.node, at.offset);
}

function wordAround(node: Text, offset: number): [number, number] | null {
  const words = [...new Intl.Segmenter(document.documentElement.lang || undefined, { granularity: 'word' }).segment(node.data)].filter((w) => w.isWordLike);
  const w = words.find((x) => x.index <= offset && offset < x.index + x.segment.length) ?? words.find((x) => x.index + x.segment.length === offset);
  return w ? [w.index, w.index + w.segment.length] : null;
}

function wholly(s: globalThis.Selection, host: Element): boolean {
  if (!s.rangeCount) return false;
  const r = s.getRangeAt(0);
  const all = document.createRange();
  all.selectNodeContents(host);
  return r.compareBoundaryPoints(Range.START_TO_START, all) <= 0 && r.compareBoundaryPoints(Range.END_TO_END, all) >= 0;
}

function dropRange(app: App): void {
  const s = getSelection();
  const active = document.activeElement;
  if (!s?.rangeCount || (active instanceof HTMLElement && (active.isContentEditable || active.matches('input, textarea')))) return;
  if (app.hostOf(s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement ?? null)) s.removeAllRanges();
}

export function install(app: App): void {
  let kind: SelectionKind = 'none';
  let items: Element[] = [];
  const listeners: (() => void)[] = [];
  const set = (k: SelectionKind, next: Element[]) => {
    let ordered = k === 'none' ? [] : inOrder(next);
    if (k === 'elements' && ordered.length > 1 && ordered.some((el) => el.matches('.backdrop'))) {
      const added = ordered.filter((el) => !items.includes(el) && el.matches('.backdrop')).at(-1);
      ordered = added ? [added] : ordered.filter((el) => !el.matches('.backdrop'));
    }
    const nextKind = ordered.length ? k : 'none';
    if (nextKind === kind && ordered.length === items.length && ordered.every((el, i) => el === items[i])) return;
    items = ordered;
    kind = nextKind;
    if (kind !== 'text') dropRange(app);
    const active = document.activeElement;
    if (kind !== 'text' && active instanceof HTMLElement && active.matches('mjx-container') && !items.some((el) => el.contains(active))) active.blur();
    for (const fn of listeners) fn();
    app.invalidate('selection');
  };
  const caretElement = () => (items[0] ? [movableOf(app, items[0]) ?? items[0]] : []);
  const selection: Selection = {
    get kind() {
      return kind;
    },
    get items() {
      return items;
    },
    set,
    add: (item) => set(kind === 'none' || kind === 'text' ? 'elements' : kind, [...(kind === 'text' ? caretElement() : items), item]),
    toggle: (item) => {
      if (kind === 'text') return set('elements', [...caretElement(), item]);
      set(kind === 'none' ? 'elements' : kind, items.includes(item) ? items.filter((i) => i !== item) : [...items, item]);
    },
    clear: () => set('none', []),
    selectAll: () => {
      if (kind === 'slides') return set('slides', [...app.slides().querySelectorAll(':scope > section')]);
      const host = kind === 'text' ? items[0] : null;
      const s = getSelection();
      if (host && selectRun(app, host)) return;
      if (host && s && !wholly(s, host)) return void s.selectAllChildren(host);
      if (host && host.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      if (host) s?.removeAllRanges();
      set('elements', [...movablesOf(app), ...linesOf(app)]);
    },
    listen: (fn) => void listeners.push(fn),
    has: (item) => items.includes(item),
    elements: () => (kind === 'elements' ? items : []),
    only: () => (kind === 'elements' && items.length === 1 ? items[0] : null),
    changed: () => {
      if (app.region() === 'field' && document.activeElement?.closest('.beeson-edit-inspector')) return () => {};
      const caret = app.hostOf(document.activeElement);
      const was = caret && movableOf(app, caret);
      return (el) => {
        const textEl = el.isConnected && app.current()?.contains(el) && !el.closest('aside.notes') ? movableOf(app, el) : null;
        const host = app.hostOf(document.activeElement);
        const kept = caret && (caret === el || el.contains(caret) || was === textEl || (!caret.isConnected && host && movableOf(app, host) === textEl));
        const held = kind === 'elements' && items.some((i) => i === el || i.contains(el) || el.contains(i));
        if (!textEl || kept || held) return;
        if (host) {
          (host as HTMLElement).blur();
          getSelection()?.removeAllRanges();
        }
        set('elements', [textEl]);
      };
    },
  };
  app.selection = selection;

  const move: Selector = {
    select: (el) => (el ? set('elements', [el]) : set('none', [])),
    movableOf: (target) => pickOf(app, target),
    mark,
    refresh: () => app.invalidate('selection'),
  };
  app.move = move;

  document.addEventListener('focusin', (ev) => {
    const target = ev.target instanceof Element ? ev.target : null;
    const host = app.hostOf(target);
    if (host?.matches('div.math') && target?.matches('mjx-container') && app.current()?.contains(host)) {
      if (!(kind === 'elements' && items.includes(host))) set('elements', [host]);
    } else if (host && app.current()?.contains(host) && !host.closest('aside.notes')) set('text', [host]);
    else if (target?.classList.contains('beeson-movable') && !(kind === 'elements' && items.some((el) => el !== target && target.contains(el)))) set('elements', [target]);
  });
  let before: Range | null = null;
  const onSelected = (ev: MouseEvent) => kind === 'elements' && ev.target instanceof Element && items.includes(pickOf(app, ev.target) as Element);
  document.addEventListener('mousedown', (ev) => {
    if ((ev.button === 2 || (ev.ctrlKey && app.platform === 'mac')) && onSelected(ev)) ev.preventDefault();
    const s = getSelection();
    before = ev.button === 2 && s && s.rangeCount && !s.isCollapsed ? s.getRangeAt(0).cloneRange() : null;
  }, true);
  document.addEventListener('contextmenu', (ev) => {
    const target = ev.target instanceof Element ? ev.target : null;
    const host = app.hostOf(target);
    if (!host || !app.current()?.contains(host) || host.closest('aside.notes') || target?.closest('mjx-container') || onSelected(ev)) return;
    const s = getSelection();
    if (!s) return;
    const kept = before ?? (s.rangeCount && !s.isCollapsed ? s.getRangeAt(0) : null);
    before = null;
    const inside = (r: Range) => [...r.getClientRects()].some((b) => ev.clientX >= b.left && ev.clientX <= b.right && ev.clientY >= b.top && ev.clientY <= b.bottom);
    if (kept && host.contains(kept.commonAncestorContainer) && inside(kept)) {
      s.removeAllRanges();
      s.addRange(kept);
      return;
    }
    const at = caretAt(ev.clientX, ev.clientY);
    if (!at || !host.contains(at.node)) return;
    if (document.activeElement !== host && !host.contains(document.activeElement)) (host as HTMLElement).focus({ preventScroll: true });
    const word = app.platform === 'mac' ? wordAround(at.node, at.offset) : null;
    if (word) s.setBaseAndExtent(at.node, word[0], at.node, word[1]);
    else s.setBaseAndExtent(at.node, at.offset, at.node, at.offset);
  }, true);
  app.listen('slide', () => {
    if (kind !== 'slides') set('none', []);
  });
  app.onRefresh(['content', 'structure', 'slide'], () => {
    if (kind === 'slides' || kind === 'none') return;
    const slide = app.current();
    const kept = items.filter((el) => el.isConnected && !!slide?.contains(el));
    if (kept.length !== items.length) set(kind, kept);
  });
}
