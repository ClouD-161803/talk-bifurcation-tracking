import type { App } from '../app.ts';
import { ask, host } from '../ui/dialog.ts';
import { make } from '../ui/dom.ts';
import { firstFrame } from './poster.ts';
import { REVEAL_CLASSES } from '../model/scope.ts';
import { placeNew } from '../commands/place.ts';
import { checkOverlaps } from '../overflow.ts';
import { overShapes } from '../commands/order.ts';
import { twinOf } from '../canvas/hit.ts';
import { kindOf, media, type Kind, type MediaFile } from './store.ts';
import { isPdf, pageOfFigure, pdfBytes, renderPdf } from './pdf.ts';
import type { Mode } from '../../pdffigure.ts';

export const ACCEPT: Record<Kind | 'any', string> = {
  image: 'image/*,application/pdf,.pdf',
  video: 'video/*,.mp4,.m4v,.webm,.mov',
  any: 'image/*,application/pdf,.pdf,video/*,.mp4,.m4v,.webm,.mov',
};

const SLOT = 'figure, .figure-box, .plate';
const DRAWN = '[data-plot], .tikz, tycho-viewer, .surface, .backdrop';

const KEPT = ['data-fragment-index', 'data-autoslide', 'data-final', 'data-id', 'data-group', 'data-locked'];
const PLACE = ['translate', 'width', 'height', 'rotate'];

const kindName = (k: Kind) => (k === 'image' ? 'Image' : 'Video');
const stemOf = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '');
const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const paired = (app: App, el: Element) => !!app.pairing?.elements.get(el)?.open && !app.pairing.byLive.has(el);

export const isSlot = (app: App, el: Element): boolean => el.matches(SLOT) && !el.matches(DRAWN) && paired(app, el);

export const isEmptySlot = (app: App, el: Element): boolean =>
  isSlot(app, el) && ![...el.children].some((c) => !c.hasAttribute('data-generated')) && !el.textContent?.trim();

export const emptySlot = (app: App, slide: Element): Element | null =>
  [...slide.querySelectorAll(':scope > .figure-box, :scope > .plate, :scope > figure')].find((el) => isEmptySlot(app, el)) ?? null;

export function mediaIn(app: App, el: Element): HTMLImageElement | HTMLVideoElement | null {
  const ok = (m: Element) => m.matches('img, video') && paired(app, m);
  if (ok(el)) return el as HTMLImageElement;
  if (!isSlot(app, el)) return null;
  const all = [...el.children].filter(ok);
  const found = all.filter((m) => m.getBoundingClientRect().width > 0);
  if (!found.length && all.length === 1 && pairMode(app, all[0])) return all[0] as HTMLImageElement;
  return found.length === 1 ? (found[0] as HTMLImageElement | HTMLVideoElement) : null;
}

export function pairMode(app: App, el: Element): 'dark' | 'light' | null {
  if (el.getBoundingClientRect().width > 0 || twinOf(app, el)) return null;
  return el.classList.contains('for-dark') ? 'light' : el.classList.contains('for-light') ? 'dark' : null;
}

export const kindOfElement = (el: Element): Kind => (el.localName === 'video' ? 'video' : 'image');

let chooser: HTMLInputElement | null = null;
export function chooseFiles(accept: string, multiple = false): Promise<File[]> {
  chooser?.remove();
  return new Promise((done) => {
    const input = make('input', 'beeson-media-input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    chooser = input;
    const finish = (files: File[]) => {
      input.remove();
      if (chooser === input) chooser = null;
      done(files);
    };
    input.addEventListener('change', () => finish([...(input.files ?? [])]));
    input.addEventListener('cancel', () => finish([]));
    host().append(input);
    input.click();
  });
}

export function taken(app: App): (path: string) => boolean {
  let text = app.source?.text ?? '';
  try {
    text += app.files.render();
  } catch {}
  return (path) => text.includes(path);
}

type Pdf = { path: string; page: number; renders: { mode: Mode; file: MediaFile }[] };
type Ready = { kind: Kind; file: MediaFile; poster: MediaFile | null; problem: string | null; pdf?: Pdf };

export async function preparePdf(app: App, bytes: Uint8Array, page: number, modes: Mode[], at: { path: string } | { name: string }): Promise<Pdf> {
  const path = 'path' in at ? at.path : media.add(new Blob([bytes as BlobPart], { type: 'application/pdf' }), at.name, taken(app), 'figure').path;
  const { files } = await renderPdf(bytes, path, page, modes, taken(app));
  return { path, page, renders: files };
}

const BOTH: Mode[] = ['dark', 'light'];

async function prepare(app: App, files: File[]): Promise<Ready[]> {
  const usable = files.filter((f) => kindOf(f));
  if (!usable.length && files.length) throw new Error(`${files[0].name} is not an image, a PDF, or a video`);
  for (const f of usable) {
    const refused = media.refuse?.(f);
    if (refused) throw new Error(refused);
  }
  const out: Ready[] = [];
  for (const blob of usable) {
    const kind = kindOf(blob)!;
    if (isPdf(blob)) {
      const pdf = await preparePdf(app, new Uint8Array(await blob.arrayBuffer()), 1, BOTH, { name: blob.name });
      out.push({ kind, file: pdf.renders[0].file, poster: null, problem: null, pdf });
      continue;
    }
    const file = media.add(blob, blob.name, taken(app), kind);
    let poster: MediaFile | null = null;
    let problem: string | null = null;
    if (kind === 'video') {
      try {
        poster = media.add(await firstFrame(file.url), `${stemOf(file.path)}.png`, taken(app), 'poster');
      } catch (e) {
        problem = `the poster of ${blob.name} could not be captured: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    out.push({ kind, file, poster, problem });
  }
  return out;
}

export const pdfAttrs = (pdf: Pdf, file: MediaFile): Record<string, string | null> => ({ src: file.path, 'data-pdf': pdf.path, 'data-page': pdf.page > 1 ? String(pdf.page) : null });

export const pdfText = (pdf: Pdf, attrs: Record<string, string> = {}, classes: string[] = []): string[] =>
  pdf.renders.map(({ mode, file }) => {
    const a = { ...attrs, ...Object.fromEntries(Object.entries(pdfAttrs(pdf, file)).filter(([, v]) => v !== null) as [string, string][]) };
    const more = Object.entries(a).filter(([k]) => k !== 'src').map(([k, v]) => ` ${k}="${attr(v)}"`).join('');
    const cls = [...(mode ? [`for-${mode}`] : []), ...classes];
    return `<img${cls.length ? ` class="${cls.join(' ')}"` : ''} src="${attr(file.path)}"${more}>`;
  });

const OWN_CLASSES = ['for-dark', 'for-light', 'white-figure', 'invert'];

function twinText(app: App, el: Element, mode: 'dark' | 'light', files: Record<string, string | null>): string {
  const state = app.doc.tagState(el);
  const attrs: Record<string, string | null> = { ...state.attrs, class: [`for-${mode}`, ...state.classes.filter((c) => !OWN_CLASSES.includes(c))].join(' '), srcset: null, ...files };
  const text = Object.entries(attrs).filter(([, v]) => v !== null).map(([k, v]) => (v ? ` ${k}="${attr(v)}"` : ` ${k}`)).join('');
  return el.localName === 'video' ? `<video${text}></video>` : `<img${text}>`;
}

function mediaText(r: Ready, classes: string[] = [], attrs: Record<string, string> = {}): string {
  const cls = classes.length ? ` class="${classes.join(' ')}"` : '';
  const src = attr(r.file.path);
  const more = Object.entries(attrs).map(([k, v]) => (v ? ` ${k}="${attr(v)}"` : ` ${k}`)).join('');
  if (r.kind === 'image') return `<img${cls} src="${src}"${more}>`;
  return `<video${cls} src="${src}"${r.poster ? ` poster="${attr(r.poster.path)}"` : ''} muted loop data-autoplay${more}></video>`;
}

function watch(app: App, root: Element): void {
  for (const el of [root, ...root.querySelectorAll('img, video')]) {
    if (el instanceof HTMLImageElement) el.addEventListener('load', () => app.invalidate('content'), { once: true });
    else if (el instanceof HTMLVideoElement) el.addEventListener('loadedmetadata', () => app.invalidate('content'), { once: true });
  }
}

async function fill(app: App, slot: Element, r: Ready, label: string): Promise<Element> {
  const pending = app.doc.insert(r.pdf ? pdfText(r.pdf) : mediaText(r), slot, null, label);
  media.resolve(slot);
  for (const node of await pending) {
    media.resolve(node);
    watch(app, node);
  }
  return slot;
}

async function addFigureBox(app: App, slide: Element, r: Ready): Promise<Element> {
  const before = slide.querySelector(':scope > .foot, :scope > aside.notes');
  const options = r.pdf ? { pictures: pdfText(r.pdf) } : r.kind === 'image' ? { src: r.file.path, alt: '' } : { src: r.file.path, poster: r.poster?.path ?? '' };
  const pending = app.doc.insertElement(r.kind, slide, before, options);
  media.resolve(slide);
  const [figureBox] = await pending;
  const el = figureBox.querySelector('img, video');
  if (el?.localName === 'img' && !r.pdf) app.doc.setTag(el, { attrs: { alt: null } }, 'alt');
  else if (el && !r.poster) app.doc.setTag(el, { attrs: { poster: null } }, 'poster');
  media.resolve(figureBox);
  watch(app, figureBox);
  if (el) await sized(el);
  if (el instanceof HTMLElement) placeNew(app, figureBox, el);
  return figureBox;
}

const sized = (el: Element): Promise<void> => new Promise((done) => {
  const known = el instanceof HTMLImageElement ? el.complete && el.naturalWidth > 0 : el instanceof HTMLVideoElement && el.readyState >= 1;
  if (known) return done();
  el.addEventListener(el.localName === 'img' ? 'load' : 'loadedmetadata', () => done(), { once: true });
  el.addEventListener('error', () => done(), { once: true });
  setTimeout(done, 3000);
});

const report = (app: App, ready: Ready[]) => {
  const problems = ready.map((r) => r.problem).filter(Boolean);
  if (problems.length) app.fail(new Error(problems.join('. ')));
};

export async function insertFiles(app: App, files: File[], into: Element | null = null): Promise<Element[]> {
  const slide = app.current();
  if (!slide || !app.pairing?.root || !files.length) return [];
  const ready = await prepare(app, files);
  const label = ready.length > 1 ? 'Media' : kindName(ready[0].kind);
  const nodes: Element[] = [];
  await app.history.selecting(`Insert ${label}`, async () => {
    for (const [i, r] of ready.entries()) {
      const slot = i === 0 && into && slide.contains(into) && isEmptySlot(app, into) ? into : emptySlot(app, slide);
      nodes.push(slot ? await fill(app, slot, r, label) : await addFigureBox(app, slide, r));
    }
    for (const node of nodes) await overShapes(app, node);
    for (const node of nodes) checkOverlaps(app, slide, node);
    app.selection.set('elements', nodes);
  });
  report(app, ready);
  return nodes;
}

function setFiles(app: App, el: Element, attrs: Record<string, string | null>, label: string, classes?: Record<string, boolean>): void {
  media.resolve(el);
  app.doc.setTag(el, { attrs, ...(classes ? { classes } : {}) }, label.toLowerCase());
  watch(app, el);
}

export async function setPdf(app: App, el: HTMLImageElement, pdf: Pdf, label: string): Promise<void> {
  const twin = twinOf(app, el);
  const shared = { 'data-pdf': pdf.path, 'data-page': pdf.page > 1 ? String(pdf.page) : null };
  const own = pdf.renders.find((r) => r.mode === null);
  const plain = { invert: false, 'white-figure': false };
  if (own) {
    setFiles(app, el, { ...shared, src: own.file.path }, label, { 'for-dark': false, 'for-light': false });
    if (twin) await app.doc.remove(twin, label);
    return;
  }
  const mode: 'dark' | 'light' = el.classList.contains('for-light') ? 'light' : 'dark';
  const other = mode === 'dark' ? 'light' : 'dark';
  const file = (m: Mode) => pdf.renders.find((r) => r.mode === m)!.file;
  setFiles(app, el, { ...shared, src: file(mode).path }, label, { ...plain, 'for-dark': mode === 'dark', 'for-light': mode === 'light' });
  if (twin) return setFiles(app, twin, { src: file(other).path }, label, plain);
  const pending = app.doc.insert(twinText(app, el, other, { src: file(other).path }), el.parentElement!, el.nextElementSibling, label);
  media.resolve(el.parentElement!);
  for (const node of await pending) {
    media.resolve(node);
    watch(app, node);
  }
}

export const ownColors = (el: Element): boolean => el.hasAttribute('data-pdf') && !el.classList.contains('for-dark') && !el.classList.contains('for-light');

export async function rerenderPdf(app: App, el: HTMLImageElement, change: { page?: number; own?: boolean }, label: string): Promise<void> {
  const path = el.getAttribute('data-pdf');
  const bytes = path ? await pdfBytes(path) : null;
  if (!path || !bytes) return;
  const own = change.own ?? ownColors(el);
  const pdf = await preparePdf(app, bytes, change.page ?? pageOfFigure(el), own ? [null] : BOTH, { path });
  await app.history.selecting(label, () => setPdf(app, el, pdf, label));
  app.invalidate('content');
}

export async function replaceFile(app: App, el: HTMLImageElement | HTMLVideoElement, file: File): Promise<void> {
  if (!kindOf(file)) throw new Error(`${file.name} is not an image, a PDF, or a video`);
  if (isPdf(file) && el instanceof HTMLImageElement) {
    const refused = media.refuse?.(file);
    if (refused) throw new Error(refused);
    const pdf = await preparePdf(app, new Uint8Array(await file.arrayBuffer()), 1, ownColors(el) ? [null] : BOTH, { name: file.name });
    await app.history.selecting('Replace Image', () => setPdf(app, el, pdf, 'Replace Image'));
    app.invalidate('content');
    return;
  }
  const [r] = await prepare(app, [file]);
  const pair = r.kind === kindOfElement(el) ? pairMode(app, el) : null;
  const label = pair ? `Add ${kindName(r.kind)} for ${pair === 'dark' ? 'Dark' : 'Light'} Mode` : `Replace ${kindName(kindOfElement(el))}`;
  const held = app.selection.kind === 'elements' && app.selection.elements().some((s) => s !== el && s.contains(el));
  const select = (node: Element) => {
    if (!held) app.selection.set('elements', [node]);
  };
  await app.history.selecting(label, async () => {
    if (pair && el.parentElement) {
      const files = { src: r.file.path, poster: r.poster?.path ?? null, 'data-pdf': null, 'data-page': null };
      const pending = app.doc.insert(twinText(app, el, pair, files), el.parentElement, el.nextElementSibling, label);
      media.resolve(el.parentElement);
      const [node] = await pending;
      media.resolve(node);
      watch(app, node);
      select(node);
      return;
    }
    if (r.kind === kindOfElement(el)) {
      setFiles(app, el, r.kind === 'image' ? { src: r.file.path, ...(el.hasAttribute('data-pdf') ? { 'data-pdf': null, 'data-page': null } : {}) } : { src: r.file.path, poster: r.poster?.path ?? null }, label);
      select(el);
      return;
    }
    const parent = el.parentElement;
    if (!parent) throw new Error('the figure is not on the page');
    const own = app.doc.tagState(el);
    const classes = own.classes.filter((c) => c === 'for-dark' || c === 'for-light' || c === 'faint' || REVEAL_CLASSES.includes(c));
    const kept = Object.fromEntries(Object.entries(own.attrs).filter(([k]) => KEPT.includes(k)));
    const place = Object.entries(own.style).filter(([k]) => PLACE.includes(k)).map(([k, v]) => `${k}: ${v}`).join('; ');
    if (place) kept.style = place;
    const twin = r.pdf ? twinOf(app, el) : null;
    const pending = app.doc.insert(r.pdf ? pdfText(r.pdf, kept, classes.filter((c) => !OWN_CLASSES.includes(c))) : mediaText(r, classes, kept), parent, el, label);
    media.resolve(parent);
    const nodes = await pending;
    for (const node of nodes) {
      media.resolve(node);
      watch(app, node);
    }
    const node = nodes[0];
    await app.doc.remove(el, label);
    if (twin) await app.doc.remove(twin, label);
    select(node);
  });
  app.invalidate('content');
  report(app, [r]);
}

const chosen = new Map<string, string>();
const fileName = (url: string): string => decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() ?? '');

export const unreadable = (el: HTMLVideoElement): boolean => {
  const url = el.currentSrc || el.src;
  return location.protocol === 'file:' && !!url && !/^(blob|data):/.test(url) && !chosen.has(url);
};

export async function askForFile(url: string, noun: string, accept: string): Promise<string | null> {
  const kept = chosen.get(url);
  if (kept) return kept;
  const name = fileName(url);
  let picked: Promise<File[]> | null = null;
  await ask({
    title: `Choose the ${noun} File`,
    text: `The files next to a deck opened from a file cannot be read until you choose them. Choose ${name} once in the file chooser, and it can be read until the deck is closed.`,
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: `Choose ${name}…`, value: 'choose', primary: true },
    ],
    className: 'beeson-poster-ask',
    onButton: (value) => {
      if (value === 'choose') picked = chooseFiles(accept);
    },
  }, 'choose');
  const files = await (picked ?? Promise.resolve([] as File[]));
  if (!files.length) return null;
  if (files[0].name !== name) throw new Error(`the chosen file ${files[0].name} is not ${name}`);
  const copy = URL.createObjectURL(files[0]);
  chosen.set(url, copy);
  return copy;
}

const times = new WeakMap<HTMLVideoElement, number>();
export const posterTime = (el: HTMLVideoElement): number => times.get(el) ?? 0;
export const setPosterTime = (el: HTMLVideoElement, time: number): void => void times.set(el, Math.max(0, time));

export async function capturePoster(app: App, el: HTMLVideoElement): Promise<void> {
  const url = el.currentSrc || el.src;
  if (!url) throw new Error('the video does not have a file');
  const source = chosen.get(url) ?? (unreadable(el) ? await askForFile(url, 'Video', ACCEPT.video) : url);
  if (!source) return;
  const blob = await firstFrame(source, posterTime(el));
  const name = stemOf(media.pathOf(el.getAttribute('src')) ?? 'video');
  const poster = media.add(blob, `${name}.png`, taken(app), 'poster');
  await app.history.transact('Poster Frame', () => setFiles(app, el, { poster: poster.path }, 'poster'));
  app.invalidate('content');
}
