import { referenceLink, referenceParts, type Reference } from './reference.ts';

export type Cited = { labels: string[]; missing: boolean[]; keys: string[] };

export function citedOf(citations: string[][], known: (key: string) => boolean): Cited {
  const keys: string[] = [];
  const labels: string[] = [];
  const missing: boolean[] = [];
  for (const cited of citations) {
    const numbers = new Set<number>();
    const lost = new Set<string>();
    for (const key of cited) {
      if (!known(key)) {
        lost.add(key);
        continue;
      }
      if (!keys.includes(key)) keys.push(key);
      numbers.add(keys.indexOf(key) + 1);
    }
    labels.push([...[...numbers].sort((a, b) => a - b), ...lost].join(','));
    missing.push(lost.size > 0);
  }
  return { labels, missing, keys };
}

const keysOf = (cite: HTMLElement): string[] => (cite.dataset.key ?? '').split(',').map((key) => key.trim()).filter(Boolean);
const citesOf = (slide: HTMLElement): HTMLElement[] => [...slide.querySelectorAll<HTMLElement>('cite[data-key]')].filter((cite) => !cite.closest('aside.notes'));
const refsOf = (slide: HTMLElement): HTMLElement | null => slide.querySelector<HTMLElement>(':scope > div.refs[data-generated]');
const slides = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.reveal .slides section:not(:has(> section))')];
const cited = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.reveal .slides section > div.refs[data-generated]')].map((refs) => refs.parentElement as HTMLElement);

const made = new WeakMap<Element, string>();

function referenceEl(number: number, key: string, reference: Reference): HTMLElement {
  const ref = document.createElement('span');
  ref.className = 'ref';
  ref.dataset.key = key;
  const sup = document.createElement('sup');
  sup.textContent = String(number);
  ref.append(sup);
  const [before, italic, after] = referenceParts(reference);
  const venue = document.createElement('em');
  venue.textContent = italic;
  const link = referenceLink(reference);
  let words: HTMLElement = ref;
  if (link) {
    const a = document.createElement('a');
    a.href = link;
    a.target = '_blank';
    a.rel = 'noopener';
    ref.append(a);
    words = a;
  }
  words.append(before, ...(italic ? [venue] : []), after);
  return ref;
}

function mount(slide: HTMLElement, references: Record<string, Reference>): void {
  const cites = citesOf(slide);
  const { labels, missing, keys } = citedOf(cites.map(keysOf), (key) => Object.hasOwn(references, key));
  cites.forEach((cite, k) => {
    if (cite.dataset.n !== labels[k]) cite.dataset.n = labels[k];
    cite.toggleAttribute('data-missing', missing[k]);
  });
  let refs = refsOf(slide);
  if (!keys.length) {
    refs?.remove();
    slide.style.removeProperty('--refs');
    return;
  }
  const text = JSON.stringify(keys.map((key) => [key, references[key]]));
  if (!refs) {
    refs = document.createElement('div');
    refs.className = 'refs';
    refs.dataset.generated = '';
    slide.append(refs);
  }
  if (made.get(refs) !== text) {
    refs.replaceChildren(...keys.map((key, k) => referenceEl(k + 1, key, references[key])));
    made.set(refs, text);
  }
}

function sync(slides: HTMLElement[]): void {
  const listed = slides.flatMap((slide) => {
    const refs = refsOf(slide);
    return refs ? [{ slide, refs }] : [];
  });
  const shown = listed.map(({ slide }) => new Set(citesOf(slide).filter((cite) => getComputedStyle(cite).visibility !== 'hidden').flatMap(keysOf)));
  listed.forEach(({ refs }, i) => {
    for (const ref of refs.children) ref.classList.toggle('off', !shown[i].has((ref as HTMLElement).dataset.key ?? ''));
  });
  const heights = listed.map(({ refs }) => refs.offsetHeight);
  listed.forEach(({ slide }, i) => {
    const height = `${heights[i]}px`;
    if (heights[i] && slide.style.getPropertyValue('--refs') !== height) slide.style.setProperty('--refs', height);
  });
}

export function mountCitations(): void {
  const references = (window as unknown as { beesonTex?: { references?: Record<string, Reference> } }).beesonTex?.references ?? {};
  for (const slide of slides()) mount(slide, references);
  sync(slides());
}

export function syncCitations(slide?: HTMLElement | null): void {
  sync(slide ? [slide] : cited());
}
