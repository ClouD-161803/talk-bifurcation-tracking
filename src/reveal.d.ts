import type { RevealApi, RevealConfig, RevealPlugin } from 'reveal.js';

export type RevealOptions = RevealConfig;

export type Deck = RevealApi & { isPrintView(): boolean };

export type SlideEvent = Event & { currentSlide: HTMLElement; previousSlide?: HTMLElement | null };

declare global {
  interface Window {
    Reveal: Deck;
    RevealNotes?: () => RevealPlugin;
    RevealHighlight?: () => RevealPlugin;
  }
  const __VERSION__: string;
}
