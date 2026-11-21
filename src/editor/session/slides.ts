import type { App } from '../app.ts';
import type { Edit } from '../merge.ts';
import { showPlaces, type Navigator } from '../navigator/navigator.ts';
import { tileSlide } from '../navigator/sorter.ts';

export type SlideHooks = {
  row(slide: Element): HTMLElement | null;
  tiles(): Map<Element, HTMLElement>;
  onRefresh(fn: () => void): void;
  numberOf(slide: Element): number;
  marked(): number[];
  mark(numbers: number[]): void;
  slidesIn(ranges: Edit[]): Element[];
};

export function slideHooks(app: App): SlideHooks {
  const nav = () => app.nav as Navigator;
  const slides = () => [...app.slides().querySelectorAll(':scope > section')];
  const fns: (() => void)[] = [];
  return {
    row: (slide) => nav().rowOf(slide),
    tiles() {
      const out = new Map<Element, HTMLElement>();
      if (nav().table?.shown) for (const t of document.querySelectorAll<HTMLElement>('.beeson-edit-sorter .tile')) {
        const s = tileSlide.get(t);
        if (s) out.set(s, t);
      }
      return out;
    },
    onRefresh(fn) {
      fns.push(fn);
      nav().refreshed = () => fns.forEach((f) => f());
    },
    numberOf(slide) {
      const all = slides();
      return showPlaces(all)[all.indexOf(slide)] ?? 0;
    },
    marked: () => nav().marked,
    mark: (numbers) => nav().mark(numbers),
    slidesIn(ranges) {
      const p = app.pairing;
      if (!p || !ranges.length) return [];
      return slides().filter((s) => {
        const src = p.elements.get(s);
        if (!src?.open || src.source !== app.source) return false;
        const start = src.open.start, end = src.close?.end ?? src.open.end;
        return ranges.some((r) => r.start < end && start < Math.max(r.end, r.start + 1));
      });
    },
  };
}
