import type { Deck } from './reveal.d.ts';

export const OWN = [
  'a[href]', 'button', 'input', 'select', 'textarea', 'label', 'summary', 'iframe', 'video', 'audio',
  '[contenteditable]:not([contenteditable="false"])', '.plot', '.surface', 'tycho-viewer', '.qr',
  '.run', '.foot', '.slide-number', '.scrub', '.theme-switch', '.r-overlay',
].join(', ');

const SLOP = 4;

const selected = () => String(window.getSelection() ?? '');

export function initClick(deck: Deck, cue: () => void, end?: () => void): void {
  const root = deck.getRevealElement() as HTMLElement;
  let down: { x: number; y: number; text: string } | null = null;
  document.addEventListener('pointerdown', (ev) => {
    down = ev.isPrimary && ev.button === 0 ? { x: ev.clientX, y: ev.clientY, text: selected() } : null;
  }, true);
  document.addEventListener('click', (ev) => {
    const from = down;
    down = null;
    if (!from || ev.button !== 0 || ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
    if (Math.hypot(ev.clientX - from.x, ev.clientY - from.y) > SLOP) return;
    const text = selected();
    if (text && text !== from.text) return;
    const target = ev.target instanceof Element ? ev.target : null;
    if (!target || !root.contains(target)) return;
    const own = target.closest(OWN);
    if (own instanceof HTMLMediaElement && !own.controls) {
      if (own.paused) void own.play().catch(() => {});
      else own.pause();
    }
    if (own || deck.isOverview() || deck.isPaused()) return;
    if (end && deck.isLastSlide() && !deck.availableFragments().next) return end();
    deck.next();
    cue();
  });
}
