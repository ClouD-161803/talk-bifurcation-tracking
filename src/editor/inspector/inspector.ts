import type { App } from '../app.ts';
import { hasText } from '../canvas/hit.ts';
import { install as installAlign } from '../commands/align.ts';
import { install as installFigure, onAltRequest, paneImageOf, paneVideoOf, qrOf } from '../commands/figure.ts';
import { make } from '../ui/dom.ts';
import { arrangePane } from './arrange.ts';
import { installStyle, keepFocus, runner, type Control } from './controls.ts';
import { imagePane, qrPane, videoPane } from './media.ts';
import { commands as slideCommands, paneLayout, slidePane } from './slide.ts';
import { tablePane } from './table.ts';
import { textPane } from './text.ts';
import { formulaPane, formulaView } from './formula.ts';
import { codePane } from './code.ts';
import { surfacePane, surfaceOf } from './surface.ts';
import { backdropPane } from './backdrop.ts';
import { selectedBackdrop } from '../commands/backdrop.ts';
import { linePane } from './line.ts';
import { selectedLines } from '../commands/line.ts';
import { shapePane } from './shape.ts';
import { selectedShapes } from '../commands/shape.ts';
import { lockedSelection } from '../commands/order.ts';
import { citationOf, citationPane, tikzPane } from '../tex/install.ts';

export type PaneKind = 'slide' | 'table' | 'text' | 'citation' | 'image' | 'video' | 'qr' | 'formula' | 'code' | 'surface' | 'line' | 'shape' | 'backdrop' | 'tikz' | 'arrange';
const TAB_NAMES: Record<PaneKind, string> = { slide: 'Slide', table: 'Table', text: 'Text', citation: 'Citation', image: 'Image', video: 'Video', qr: 'QR Code', formula: 'Formula', code: 'Code', surface: 'Surface', line: 'Line', shape: 'Shape', backdrop: 'Backdrop', tikz: 'TikZ Figure', arrange: 'Arrange' };
const isCode = (el: Element | undefined) => !!el?.closest('pre')?.querySelector(':scope > code');
const TEXT_ELEMENT = 'h1, h2, h3, p, ul, ol, div.foot';

function viewOf(app: App): { tabs: PaneKind[]; items: readonly Element[] } {
  const sel = app.selection;
  const cite = citationOf(app);
  if (cite) return { tabs: ['citation', 'text', 'arrange'], items: [sel.items[0], cite] };
  const formula = formulaView(app);
  if (formula) return formula;
  if (sel.kind === 'text') return { tabs: sel.items[0]?.matches('td, th') ? ['table', 'text', 'arrange'] : isCode(sel.items[0]) ? ['code', 'text', 'arrange'] : ['text', 'arrange'], items: sel.items };
  const els = sel.elements();
  if (!els.length) return { tabs: ['slide'], items: [app.current()].filter((s): s is Element => !!s) };
  if (selectedLines(app).length === els.length) return { tabs: ['line', 'arrange'], items: els };
  if (selectedShapes(app).length) return { tabs: els.some(hasText) ? ['shape', 'text', 'arrange'] : ['shape', 'arrange'], items: els };
  if (els.length > 1) return { tabs: els.every((el) => el.matches(TEXT_ELEMENT) && hasText(el)) ? ['text', 'arrange'] : ['arrange'], items: els };
  const el = els[0];
  if (el.localName === 'table') return { tabs: ['table', 'arrange'], items: els };
  if (selectedBackdrop(app) === el) return { tabs: ['backdrop'], items: els };
  if (el.matches('.tikz')) return { tabs: ['tikz', 'arrange'], items: els };
  const img = paneImageOf(app), video = paneVideoOf(app), qr = qrOf(app);
  if (img) return { tabs: ['image', 'arrange'], items: [el, img] };
  if (video) return { tabs: ['video', 'arrange'], items: [el, video] };
  if (qr) return { tabs: ['qr', 'arrange'], items: [el, qr] };
  if (el.localName === 'pre' && isCode(el)) return { tabs: ['code', 'text', 'arrange'], items: els };
  const surface = surfaceOf(app);
  if (surface) return { tabs: ['surface', 'arrange'], items: [el, surface] };
  if (hasText(el)) return { tabs: ['text', 'arrange'], items: els };
  return { tabs: ['arrange'], items: els };
}

let chosen: PaneKind | null = null;
let shown: { key: string; items: readonly Element[]; panel: HTMLElement; root: HTMLElement; parts: Control[] } | null = null;

function paneOf(app: App, kind: PaneKind, run: ReturnType<typeof runner>): Control[] {
  switch (kind) {
    case 'slide': return slidePane(app, run);
    case 'table': return tablePane(app, run);
    case 'text': return textPane(app, run);
    case 'citation': return citationPane(app);
    case 'image': return imagePane(app, run);
    case 'video': return videoPane(app, run);
    case 'qr': return qrPane(app, run);
    case 'formula': return formulaPane(app, run);
    case 'code': return codePane(app, run);
    case 'surface': return surfacePane(app, run);
    case 'line': return linePane(app, run);
    case 'shape': return shapePane(app, run);
    case 'backdrop': return backdropPane(app, run);
    case 'tikz': return tikzPane(app);
    case 'arrange': return arrangePane(app, run);
  }
}

export function fillFormat(app: App, panel: HTMLElement): void {
  const view = viewOf(app);
  const tab = chosen && view.tabs.includes(chosen) ? chosen : view.tabs[0];
  const key = `${view.tabs.join(',')}:${tab}${tab === 'slide' ? `:${paneLayout(app)}` : ''}`;
  const same = shown && shown.panel === panel && shown.key === key && panel.contains(shown.root) &&
    shown.items.length === view.items.length && shown.items.every((el, i) => el === view.items[i]);
  if (same && shown) {
    for (const p of shown.parts) p.sync();
    return;
  }
  for (const p of shown?.parts ?? []) p.flush?.();
  const root = make('div', 'ed-panes');
  root.dataset.pane = tab;
  const sync = () => {
    if (shown?.root === root) for (const p of shown.parts) p.sync();
  };
  const run = runner(app, () => {
    app.flush();
    sync();
  });
  if (view.tabs.length > 1) {
    const tabs = make('div', 'ed-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Format');
    for (const kind of view.tabs) {
      const b = make('button', '', TAB_NAMES[kind]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(kind === tab));
      b.tabIndex = kind === tab ? 0 : -1;
      keepFocus(b);
      b.addEventListener('click', () => {
        chosen = kind;
        fillFormat(app, panel);
      });
      tabs.append(b);
    }
    tabs.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      ev.preventDefault();
      ev.stopPropagation();
      const i = view.tabs.indexOf(tab) + (ev.key === 'ArrowRight' ? 1 : -1);
      chosen = view.tabs[(i + view.tabs.length) % view.tabs.length];
      fillFormat(app, panel);
      (panel.querySelector('.ed-tabs [aria-selected="true"]') as HTMLElement | null)?.focus();
    });
    root.append(tabs);
  } else {
    root.append(make('div', 'ed-title', TAB_NAMES[tab]));
  }
  const parts = paneOf(app, tab, run);
  parts[0]?.el.classList.add('first');
  root.append(...parts.map((p) => p.el));
  panel.replaceChildren(root);
  const lock: Control = { el: root, sync: () => lockFields(app, root) };
  shown = { key, items: view.items, panel, root, parts: [...parts, lock] };
  lock.sync();
}

function lockFields(app: App, root: HTMLElement): void {
  const on = lockedSelection(app);
  for (const el of root.querySelectorAll<HTMLInputElement>('input:not([data-command]), textarea, select, button:not([data-command]):not([role="tab"])')) {
    if (on && !el.disabled) {
      el.disabled = true;
      el.dataset.lockedOff = '';
    } else if (!on && el.dataset.lockedOff !== undefined) {
      el.disabled = false;
      delete el.dataset.lockedOff;
    }
  }
}

export function showFormat(app: App, tab: PaneKind): void {
  chosen = tab;
  if (!app.commands.state('shell.format').checked) void app.commands.run('shell.format');
  const panel = document.getElementById('beeson-edit-panel-format');
  if (panel && !panel.hidden) fillFormat(app, panel);
}

export function install(app: App): void {
  installStyle();
  installAlign(app);
  installFigure(app);
  for (const c of slideCommands()) app.commands.define(c);
  let pending = false;
  document.addEventListener('selectionchange', () => {
    if (pending || !shown?.root.isConnected) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (shown?.root.isConnected) for (const p of shown.parts) p.sync();
    });
  });
  onAltRequest(() => {
    showFormat(app, 'image');
    const field = document.querySelector<HTMLTextAreaElement>('#beeson-edit-panel-format textarea[name="alt"]');
    field?.focus();
    field?.select();
  });
}
