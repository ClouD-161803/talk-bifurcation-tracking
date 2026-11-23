const OWN = ['title', 'section', 'closing'];

function sourceText(el: Element): string {
  const items = window.MathJax?.startup?.document?.getMathItemsWithin([el]) ?? [];
  if (!items.length) return el.textContent ?? '';
  const tex = new Map(items.filter((i) => i.typesetRoot).map((i) => [i.typesetRoot!, `${i.start.delim ?? ''}${i.math}${i.end.delim ?? ''}`]));
  const copy = el.cloneNode(true) as Element;
  const roots = [...el.querySelectorAll('mjx-container')];
  [...copy.querySelectorAll('mjx-container')].forEach((m, k) => m.replaceWith(tex.get(roots[k]) ?? m.textContent ?? ''));
  return copy.textContent ?? '';
}

const headingOf = (slide: HTMLElement): HTMLElement | null => slide.querySelector('h2') ?? slide.querySelector('h1');

const title = (slide: HTMLElement): string => {
  const h = headingOf(slide);
  return h ? sourceText(h).trim() : '';
};

export const appendixLetter = (slide: HTMLElement): string | undefined => (slide.classList.contains('section') ? headingOf(slide)?.dataset.appendixLetter : undefined);

export const heading = (slide: HTMLElement): string => slide.dataset.run ?? title(slide);

const letterOf = (k: number): string => (k < 26 ? '' : letterOf(Math.floor(k / 26) - 1)) + String.fromCharCode(65 + (k % 26));

function letterAppendix(slides: HTMLElement[]): void {
  const lettered = new Set<HTMLElement>();
  let appendix = false;
  for (const slide of slides) {
    if (appendix && slide.classList.contains('section') && slide.dataset.visibility !== 'hidden') {
      const h = headingOf(slide);
      if (!h) continue;
      const letter = letterOf(lettered.size);
      lettered.add(h);
      if (h.dataset.appendixLetter !== letter) h.dataset.appendixLetter = letter;
    }
    if (slide.classList.contains('closing')) appendix = true;
  }
  for (const h of document.querySelectorAll<HTMLElement>('.reveal .slides [data-appendix-letter]')) if (!lettered.has(h)) delete h.dataset.appendixLetter;
}

const APPENDIX = 'Appendix slides';

const made = new WeakMap<Element, string>();

function typeset(nodes: Element[]): void {
  const mj = window.MathJax;
  if (!nodes.length || !mj?.typesetPromise) return;
  void Promise.resolve(mj.startup?.promise).then(() => mj.typesetPromise(nodes.filter((n) => n.isConnected)));
}

function untypeset(nodes: Element[]): void {
  if (nodes.length) window.MathJax?.typesetClear?.(nodes);
}

function fill(): void {
  const slides = [...document.querySelectorAll<HTMLElement>('.reveal .slides section:not(:has(> section))')];
  const sections = slides.filter((s) => s.classList.contains('section'));
  const fresh: Element[] = [];
  const gone: Element[] = [];
  letterAppendix(slides);
  let text = '';
  for (const slide of slides) {
    if (slide.classList.contains('section')) {
      const letter = appendixLetter(slide);
      text = letter ? `Appendix ${letter}: ${heading(slide)}` : heading(slide);
    }
    if (slide.classList.contains('closing')) text = APPENDIX;
    const old = slide.querySelector<HTMLElement>(':scope > div.run[data-generated]');
    const wanted = !OWN.some((c) => slide.classList.contains(c)) && !slide.querySelector('.run:not([data-generated])') && !!text;
    if (old && wanted && made.get(old) === text) {
      if (old.nextElementSibling) slide.append(old);
      continue;
    }
    if (old) {
      gone.push(old);
      old.remove();
    }
    if (!wanted) continue;
    const run = document.createElement('div');
    run.className = 'run';
    run.dataset.generated = '';
    run.textContent = text;
    made.set(run, text);
    slide.append(run);
    fresh.push(run);
  }
  const names = sections.map((s) => {
    const letter = appendixLetter(s);
    return letter ? `Appendix ${letter}: ${title(s)}` : title(s);
  });
  for (const list of document.querySelectorAll<HTMLElement>('.reveal :is(ul, ol).outline[data-auto]')) {
    const home = list.closest('section');
    const items = [...list.children];
    const same = items.length === names.length && items.every((li, k) => made.get(li) === names[k]);
    if (same) {
      items.forEach((li, k) => li.classList.toggle('now', sections[k] === home));
      continue;
    }
    gone.push(...items);
    const lis = sections.map((s, k) => {
      const li = document.createElement('li');
      li.textContent = names[k];
      made.set(li, names[k]);
      li.classList.toggle('now', s === home);
      li.classList.toggle('appendix', !!appendixLetter(s));
      return li;
    });
    list.replaceChildren(...lis);
    fresh.push(...lis);
  }
  untypeset(gone);
  typeset(fresh);
}

export function initChrome(): void {
  fill();
}

export function refreshChrome(): void {
  fill();
}
