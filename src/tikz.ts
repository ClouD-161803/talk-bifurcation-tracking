export type FigureOutput = { hash: string; width: number; height: number; scale: number; parts: string[]; inputs: string[]; dark: string; light: string };

declare global {
  interface Window {
    beesonFigures?: Record<string, FigureOutput>;
  }
}

type Mode = 'dark' | 'light';

const loads = new Map<string, Promise<void>>();

function load(name: string): Promise<void> {
  if (window.beesonFigures?.[name] || !/^[\w-]+$/.test(name)) return Promise.resolve();
  let loading = loads.get(name);
  if (!loading) {
    loading = new Promise((done) => {
      const script = document.createElement('script');
      script.src = `figures/${name}.js`;
      script.onload = script.onerror = () => done();
      document.head.append(script);
    });
    loads.set(name, loading);
  }
  return loading;
}

const drawn = new WeakMap<Element, { n: number; key: string }>();
let instances = 0;

const figuresUnder = (root: ParentNode): HTMLElement[] => [
  ...(root instanceof HTMLElement && root.matches('.tikz') ? [root] : []),
  ...root.querySelectorAll<HTMLElement>('.tikz'),
];

function syncParts(el: HTMLElement): void {
  const shown = new Map<string, boolean>();
  for (const span of el.querySelectorAll<HTMLElement>(':scope > [data-part]')) {
    const name = span.dataset.part ?? '';
    shown.set(name, !!shown.get(name) || !span.classList.contains('fragment') || span.classList.contains('visible'));
  }
  for (const g of el.querySelectorAll<SVGGElement>(':scope > svg g[data-part]')) g.classList.toggle('tikz-later', shown.get(g.dataset.part ?? '') === false);
}

const watcher = typeof MutationObserver === 'undefined' ? null : new MutationObserver((records) => {
  const figures = new Set<HTMLElement>();
  for (const r of records) {
    const target = r.target as Element;
    if (r.type === 'childList' && target.matches('.tikz')) figures.add(target as HTMLElement);
    else if (target.parentElement?.matches('.tikz') && target.matches('[data-part]')) figures.add(target.parentElement);
  }
  for (const el of figures) syncParts(el);
});

const previews = new Map<string, FigureOutput>();
let compiling: string | null = null;

function draw(el: HTMLElement, mode: Mode): void {
  const name = el.dataset.figure ?? '';
  const key = `${name} ${mode}`;
  const state = drawn.get(el);
  if (state?.key === key && el.querySelector(':scope > svg, :scope > .tikz-error')) return;
  const n = state?.n ?? ++instances;
  if (!state) watcher?.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-part'] });
  drawn.set(el, { n, key });
  for (const old of el.querySelectorAll(':scope > svg, :scope > .tikz-error')) old.remove();
  const output = previews.get(name) ?? window.beesonFigures?.[name];
  if (!output) {
    const box = document.createElement('div');
    box.className = 'tikz-error';
    box.textContent = !name ? 'a TikZ figure without a name in data-figure' : name === compiling ? `figure ${name} is being compiled` : `figure ${name} is not compiled: run npm run tex`;
    el.prepend(box);
    return;
  }
  const prefix = `tikz-${name}-${mode}-`;
  el.insertAdjacentHTML('afterbegin', output[mode].split(prefix).join(`${prefix}${n}-`));
  const svg = el.firstElementChild as SVGSVGElement;
  svg.style.width = `${output.width}px`;
  svg.style.height = `${output.height}px`;
  svg.setAttribute('aria-hidden', 'true');
  syncParts(el);
}

let pending: Promise<void> = Promise.resolve();
let latest: Mode = 'dark';

export function mountFigures(root: ParentNode, mode: Mode): Promise<void> {
  latest = mode;
  const done = Promise.all(figuresUnder(root).map(async (el) => {
    await load(el.dataset.figure ?? '');
    draw(el, latest);
  })).then(() => undefined);
  pending = Promise.all([pending, done]).then(() => undefined);
  return done;
}

export const figuresReady = (): Promise<void> => pending;

export async function reloadFigure(name: string, hash: string): Promise<boolean> {
  if (!/^[\w-]+$/.test(name)) return false;
  await loads.get(name);
  if (window.beesonFigures?.[name]?.hash === hash) return true;
  const was = window.beesonFigures?.[name];
  const loading = new Promise<void>((done) => {
    const script = document.createElement('script');
    script.src = `figures/${name}.js?v=${encodeURIComponent(hash)}`;
    script.onload = script.onerror = () => {
      script.remove();
      done();
    };
    document.head.append(script);
  });
  loads.set(name, loading);
  await loading;
  if (window.beesonFigures?.[name] !== was) {
    previews.delete(name);
    drawAgain(name);
  }
  return window.beesonFigures?.[name]?.hash === hash;
}

function drawAgain(name: string): void {
  for (const el of figuresUnder(document)) {
    const state = drawn.get(el);
    if (el.dataset.figure !== name || !state) continue;
    state.key = '';
    draw(el, latest);
  }
}

export function previewFigure(name: string, output: FigureOutput | null): void {
  if (output) previews.set(name, output);
  else previews.delete(name);
  drawAgain(name);
}

export function compilingFigure(name: string | null): void {
  if (name === compiling) return;
  const was = compiling;
  compiling = name;
  for (const n of [was, name]) if (n && !previews.has(n) && !window.beesonFigures?.[n]) drawAgain(n);
}

export function redrawFigures(mode: Mode): void {
  latest = mode;
  for (const el of figuresUnder(document)) if (drawn.has(el)) draw(el, mode);
}
