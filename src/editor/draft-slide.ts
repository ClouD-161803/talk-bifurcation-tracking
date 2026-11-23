import type { App } from './app.ts';
import { injectStyle } from './ui/dom.ts';

export const DRAFT = 'data-draft';

export const isDraft = (slide: Element): boolean => slide.hasAttribute(DRAFT);

const CSS = `
.beeson-draft-chip { display: inline-block; padding: 3px 6px; border-radius: 4px; background: var(--trajectory-2, #f08050); color: var(--bg, #050505); font: 600 11px/1 var(--ed-font, system-ui, sans-serif); letter-spacing: 0.02em; white-space: nowrap; pointer-events: none; }
.beeson-draft-chip[hidden], html.beeson-previewing .beeson-draft-chip.on-slide { display: none; }
.beeson-draft-chip.on-slide { position: fixed; z-index: 52; }
`;
const INSET = 8;

export function draftChip(): HTMLElement {
  injectStyle('draft-chip', CSS);
  const chip = document.createElement('span');
  chip.className = 'beeson-draft-chip';
  chip.textContent = 'Draft';
  chip.hidden = true;
  return chip;
}

export function install(app: App): void {
  const chip = draftChip();
  chip.classList.add('on-slide');
  chip.setAttribute('aria-hidden', 'true');
  document.body.append(chip);
  const place = () => {
    const slide = app.current();
    const box = document.querySelector('.reveal:not(.beeson-peek)')?.getBoundingClientRect();
    const cell = document.querySelector('.beeson-edit-canvas')?.getBoundingClientRect();
    chip.hidden = !slide || !isDraft(slide) || !box || !cell || !box.width;
    if (chip.hidden || !box || !cell) return;
    const { width, height } = chip.getBoundingClientRect();
    const x = Math.min(box.right, cell.right) - width;
    const above = box.top - INSET / 2 - height;
    const y = above >= cell.top ? above : Math.max(box.top, cell.top) + INSET;
    Object.assign(chip.style, { left: `${x}px`, top: `${y}px` });
  };
  app.onRefresh(['content', 'slide', 'structure', 'layout'], place);
  window.addEventListener('resize', place);
}
