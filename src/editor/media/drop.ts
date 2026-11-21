import type { App } from '../app.ts';
import { onCanvas } from '../canvas/hit.ts';
import { injectStyle, make } from '../ui/dom.ts';
import { insertFiles, isEmptySlot, isSlot, kindOfElement, mediaIn, pairMode, replaceFile } from './actions.ts';
import { install as installPlaceholder } from './placeholder.ts';
import { kindOf } from './store.ts';

const CSS = `
.beeson-drop { position: fixed; z-index: 30; pointer-events: none; box-sizing: border-box; border: 2px solid var(--ed-select, #7048e8); background: color-mix(in srgb, var(--ed-select, #7048e8) 12%, transparent); border-radius: 4px; }
.beeson-drop[hidden] { display: none; }
.beeson-drop span { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 4px 10px; border-radius: 6px; background: var(--ed-select, #7048e8); color: #fff; font: 600 13px/18px system-ui, sans-serif; white-space: nowrap; }
`;

export type Target = { replace: HTMLImageElement | HTMLVideoElement } | { fill: Element } | { add: Element };

export function targetAt(app: App, x: number, y: number): Target | null {
  const slide = app.current();
  if (!slide || !app.pairing?.root || app.region() === 'dialog') return null;
  const under = document.elementsFromPoint(x, y);
  for (const el of under) {
    if (!slide.contains(el) || el === slide || el.closest('aside.notes')) continue;
    if (el.closest('[data-locked]')) break;
    const m = el.closest('img, video');
    const replace = m && slide.contains(m) ? mediaIn(app, m) : null;
    if (replace) return { replace };
    const slot = el.closest('figure, .figure-box, .plate');
    if (slot && slide.contains(slot) && isSlot(app, slot)) {
      if (isEmptySlot(app, slot)) return { fill: slot };
      const shown = mediaIn(app, slot);
      if (shown) return { replace: shown };
    }
  }
  return onCanvas(under[0] ?? null, app, { x, y }) ? { add: slide } : null;
}

function draggedKind(dt: DataTransfer): 'image' | 'video' | null {
  const types = [...dt.items].filter((i) => i.kind === 'file').map((i) => kindOf({ type: i.type, name: '' }));
  return types.length && types.every((t) => t === types[0]) ? types[0] : null;
}

const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');

const noMedia = (dt: DataTransfer) => {
  const files = [...dt.items].filter((i) => i.kind === 'file');
  return files.length > 0 && files.every((i) => i.type && !kindOf({ type: i.type, name: '' }));
};

export function install(app: App): void {
  injectStyle('media-drop', CSS);
  installPlaceholder(app);
  const box = make('div', 'beeson-drop');
  const tag = make('span');
  box.append(tag);
  box.hidden = true;
  document.body.append(box);

  const marked = () => document.querySelectorAll('.beeson-placeholder.dropping');
  const hide = () => {
    box.hidden = true;
    for (const p of marked()) p.classList.remove('dropping');
  };
  const show = (t: Target, kind: 'image' | 'video' | null) => {
    const pair = 'replace' in t ? pairMode(app, t.replace) : null;
    const el = 'replace' in t ? (pair && t.replace.parentElement) || t.replace : 'fill' in t ? t.fill : t.add;
    const holder = 'fill' in t ? t.fill.querySelector(':scope > .beeson-placeholder') : null;
    for (const p of marked()) if (p !== holder) p.classList.remove('dropping');
    holder?.classList.add('dropping');
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    const noun = kind === 'video' ? 'Video' : kind === 'image' ? 'Image' : 'Media';
    const what = 'replace' in t && kindOfElement(t.replace) === 'video' ? 'Video' : 'Image';
    tag.textContent = pair ? `Add ${what} for ${pair === 'dark' ? 'Dark' : 'Light'} Mode` : 'replace' in t ? `Replace ${what}` : 'fill' in t ? `Add ${noun} Here` : `Add ${noun}`;
    box.hidden = false;
  };

  window.addEventListener(
    'dragover',
    (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const t = noMedia(e.dataTransfer!) ? null : targetAt(app, e.clientX, e.clientY);
      e.dataTransfer!.dropEffect = t ? 'copy' : 'none';
      if (t) show(t, draggedKind(e.dataTransfer!));
      else hide();
    },
    true,
  );
  window.addEventListener('dragleave', (e) => {
    if (hasFiles(e) && !e.relatedTarget) hide();
  });
  window.addEventListener(
    'drop',
    (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      hide();
      const files = [...(e.dataTransfer?.files ?? [])];
      const t = targetAt(app, e.clientX, e.clientY);
      if (!t || !files.length) return;
      const run = 'replace' in t && files.length === 1 ? replaceFile(app, t.replace, files[0]) : insertFiles(app, files, 'fill' in t ? t.fill : null);
      void Promise.resolve(run).catch((err) => app.fail(err));
    },
    true,
  );
}
