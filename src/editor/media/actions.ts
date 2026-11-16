// the changes of the deck made with a media file: an image or a video inserted, the file of a
// figure replaced, and the poster of a video captured from its first frame. each is one entry of
// the history made through app.doc, and the new files are kept in the store of store.ts until a
// save. a file is put where Keynote puts a file dropped onto a media placeholder: into an empty
// figure box or plate of the slide, and else into a new figure box of its own, i.e. the figure.figure-box of the
// template of model/templates.ts

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

// a box of the layout that takes a figure, i.e. a figure box, a plate, or a figure, other than a plot,
// a TikZ figure, a viewer of tycho, a surface, or a backdrop, which are drawn by the theme
const SLOT = 'figure, .figure-box, .plate';
const DRAWN = '[data-plot], .tikz, tycho-viewer, .surface, .backdrop';

// the attributes and the declarations of an image or a video that the element of the other kind
// put in its place keeps: its step, its id, its group, its lock, and its place. the alt text, the
// classes, and the mask of an image are those of the image alone
const KEPT = ['data-fragment-index', 'data-autoslide', 'data-final', 'data-id', 'data-group', 'data-locked'];
const PLACE = ['translate', 'width', 'height', 'rotate'];

const kindName = (k: Kind) => (k === 'image' ? 'Image' : 'Video');
const stemOf = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '');
const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const paired = (app: App, el: Element) => !!app.pairing?.elements.get(el)?.open && !app.pairing.byLive.has(el);

export const isSlot = (app: App, el: Element): boolean => el.matches(SLOT) && !el.matches(DRAWN) && paired(app, el);

// a slot without content, which a new file fills
export const isEmptySlot = (app: App, el: Element): boolean =>
  isSlot(app, el) && ![...el.children].some((c) => !c.hasAttribute('data-generated')) && !el.textContent?.trim();

export const emptySlot = (app: App, slide: Element): Element | null =>
  [...slide.querySelectorAll(':scope > .figure-box, :scope > .plate, :scope > figure')].find((el) => isEmptySlot(app, el)) ?? null;

// the image or the video that el is, or the one shown in the slot el, e.g. of a pair for the two
// modes the one of the mode of the slide
export function mediaIn(app: App, el: Element): HTMLImageElement | HTMLVideoElement | null {
  const ok = (m: Element) => m.matches('img, video') && paired(app, m);
  if (ok(el)) return el as HTMLImageElement;
  if (!isSlot(app, el)) return null;
  const all = [...el.children].filter(ok);
  const found = all.filter((m) => m.getBoundingClientRect().width > 0);
  if (!found.length && all.length === 1 && pairMode(app, all[0])) return all[0] as HTMLImageElement;
  return found.length === 1 ? (found[0] as HTMLImageElement | HTMLVideoElement) : null;
}

// the mode of the twin that a file put onto el gets, when the mode of the slide hides el and el
// does not have a twin, and else null
export function pairMode(app: App, el: Element): 'dark' | 'light' | null {
  if (el.getBoundingClientRect().width > 0 || twinOf(app, el)) return null;
  return el.classList.contains('for-dark') ? 'light' : el.classList.contains('for-light') ? 'dark' : null;
}

export const kindOfElement = (el: Element): Kind => (el.localName === 'video' ? 'video' : 'image');

// the file chooser of the browser, as Insert > Choose… of Keynote. the input is put into an open
// dialog, if any, since the rest of the page is then inert
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

// a new path is not one that the file or the page already names
export function taken(app: App): (path: string) => boolean {
  let text = app.source?.text ?? '';
  try {
    text += app.files.render();
  } catch {
    // the source alone is read when the page cannot be rendered
  }
  return (path) => text.includes(path);
}

// a PDF is kept with its renders, one for each mode, or one in the colors of the PDF
type Pdf = { path: string; page: number; renders: { mode: Mode; file: MediaFile }[] };
type Ready = { kind: Kind; file: MediaFile; poster: MediaFile | null; problem: string | null; pdf?: Pdf };

// a PDF kept in the store with the renders of page in each of modes
// a PDF of the deck at path, or else a new file of the store, with the renders of page in each of modes
export async function preparePdf(app: App, bytes: Uint8Array, page: number, modes: Mode[], at: { path: string } | { name: string }): Promise<Pdf> {
  const path = 'path' in at ? at.path : media.add(new Blob([bytes as BlobPart], { type: 'application/pdf' }), at.name, taken(app), 'figure').path;
  const { files } = await renderPdf(bytes, path, page, modes, taken(app));
  return { path, page, renders: files };
}

const BOTH: Mode[] = ['dark', 'light'];

// the files kept in the store, each video with the poster of its first frame
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

// the attributes of an image of a PDF figure that shows the render file
export const pdfAttrs = (pdf: Pdf, file: MediaFile): Record<string, string | null> => ({ src: file.path, 'data-pdf': pdf.path, 'data-page': pdf.page > 1 ? String(pdf.page) : null });

// the tags of the renders of a PDF figure, each with the class of its mode before classes
export const pdfText = (pdf: Pdf, attrs: Record<string, string> = {}, classes: string[] = []): string[] =>
  pdf.renders.map(({ mode, file }) => {
    const a = { ...attrs, ...Object.fromEntries(Object.entries(pdfAttrs(pdf, file)).filter(([, v]) => v !== null) as [string, string][]) };
    const more = Object.entries(a).filter(([k]) => k !== 'src').map(([k, v]) => ` ${k}="${attr(v)}"`).join('');
    const cls = [...(mode ? [`for-${mode}`] : []), ...classes];
    return `<img${cls.length ? ` class="${cls.join(' ')}"` : ''} src="${attr(file.path)}"${more}>`;
  });

// the classes of an image of a pair that name or recolor its file, which its twin does not share
const OWN_CLASSES = ['for-dark', 'for-light', 'white-figure', 'invert'];

// the tag of the twin of el for mode, with the file src, and with every attribute, class, and
// declaration of el that the two images share
function twinText(app: App, el: Element, mode: 'dark' | 'light', src: string): string {
  const state = app.doc.tagState(el);
  const attrs: Record<string, string> = { ...state.attrs, class: [`for-${mode}`, ...state.classes.filter((c) => !OWN_CLASSES.includes(c))].join(' '), src };
  delete attrs.srcset;
  return `<img${Object.entries(attrs).map(([k, v]) => (v ? ` ${k}="${attr(v)}"` : ` ${k}`)).join('')}>`;
}

function mediaText(r: Ready, classes: string[] = [], attrs: Record<string, string> = {}): string {
  const cls = classes.length ? ` class="${classes.join(' ')}"` : '';
  const src = attr(r.file.path);
  const more = Object.entries(attrs).map(([k, v]) => (v ? ` ${k}="${attr(v)}"` : ` ${k}`)).join('');
  if (r.kind === 'image') return `<img${cls} src="${src}"${more}>`;
  return `<video${cls} src="${src}"${r.poster ? ` poster="${attr(r.poster.path)}"` : ''} muted loop data-autoplay${more}></video>`;
}

// the frames and the inspector are drawn again once the picture of a new element is known
function watch(app: App, root: Element): void {
  for (const el of [root, ...root.querySelectorAll('img, video')]) {
    if (el instanceof HTMLImageElement) el.addEventListener('load', () => app.invalidate('content'), { once: true });
    else if (el instanceof HTMLVideoElement) el.addEventListener('loadedmetadata', () => app.invalidate('content'), { once: true });
  }
}

// the element of r put into the empty slot. the object URL is set before the page loads the path,
// which is not on the disk yet, since app.doc puts the new element on the page before its first
// pause
async function fill(app: App, slot: Element, r: Ready, label: string): Promise<Element> {
  const pending = app.doc.insert(r.pdf ? pdfText(r.pdf) : mediaText(r), slot, null, label);
  media.resolve(slot);
  for (const node of await pending) {
    media.resolve(node);
    watch(app, node);
  }
  return slot;
}

// a new figure box with the element of r, before the footnote and the notes of the slide
async function addFigureBox(app: App, slide: Element, r: Ready): Promise<Element> {
  const before = slide.querySelector(':scope > .foot, :scope > aside.notes');
  const options = r.pdf ? { pictures: pdfText(r.pdf) } : r.kind === 'image' ? { src: r.file.path, alt: '' } : { src: r.file.path, poster: r.poster?.path ?? '' };
  const pending = app.doc.insertElement(r.kind, slide, before, options);
  media.resolve(slide);
  const [figureBox] = await pending;
  const el = figureBox.querySelector('img, video');
  // the template writes an empty alt, i.e. a decorative image, and a poster named after the video
  if (el?.localName === 'img' && !r.pdf) app.doc.setTag(el, { attrs: { alt: null } }, 'alt');
  else if (el && !r.poster) app.doc.setTag(el, { attrs: { poster: null } }, 'poster');
  media.resolve(figureBox);
  watch(app, figureBox);
  // the new figure box is put in free space once the size of its picture is known
  if (el) await sized(el);
  if (el instanceof HTMLElement) placeNew(app, figureBox, el);
  return figureBox;
}

// resolves once the size of the picture of el is known, or after 3 s
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

// the files inserted on the current slide, the first one into the slot into when it is empty, as
// one entry of the history. the slots of the new elements are selected
export async function insertFiles(app: App, files: File[], into: Element | null = null): Promise<Element[]> {
  const slide = app.current();
  if (!slide || !app.pairing?.root || !files.length) return [];
  const ready = await prepare(app, files);
  const label = ready.length > 1 ? 'Media' : kindName(ready[0].kind);
  const nodes: Element[] = [];
  // the entry is named Insert and the kind, as every insert of insert.ts
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

// the renders of pdf put on the image el and its twin, as part of the entry label of the history.
// with one render in the colors of the PDF, el is shown in both modes and its twin is taken off.
// with a render for each mode, el keeps its mode, or takes the dark mode, and a twin is added for the
// other mode where it is missing. invert and white-figure are taken off a render for a mode, which
// is already in the colors of its mode
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
  const pending = app.doc.insert(twinText(app, el, other, file(other).path), el.parentElement!, el.nextElementSibling, label);
  media.resolve(el.parentElement!);
  for (const node of await pending) {
    media.resolve(node);
    watch(app, node);
  }
}

// a PDF figure in the colors of the PDF, i.e. an image with data-pdf and without a mode
export const ownColors = (el: Element): boolean => el.hasAttribute('data-pdf') && !el.classList.contains('for-dark') && !el.classList.contains('for-light');

// a PDF figure rendered again from its PDF, at another page or with Match the Mode turned over, as
// one entry label of the history
export async function rerenderPdf(app: App, el: HTMLImageElement, change: { page?: number; own?: boolean }, label: string): Promise<void> {
  const path = el.getAttribute('data-pdf');
  const bytes = path ? await pdfBytes(path) : null;
  if (!path || !bytes) return;
  const own = change.own ?? ownColors(el);
  const pdf = await preparePdf(app, bytes, change.page ?? pageOfFigure(el), own ? [null] : BOTH, { path });
  await app.history.selecting(label, () => setPdf(app, el, pdf, label));
  app.invalidate('content');
}

// the file of the image or the video el replaced, as one entry of the history. a video gets the
// poster of its new file. a file of the other kind replaces el with an element of its kind, which
// keeps the mode, the step, the id, the group, the lock, and the place of el. the new picture is
// selected, unless its figure is
export async function replaceFile(app: App, el: HTMLImageElement | HTMLVideoElement, file: File): Promise<void> {
  if (!kindOf(file)) throw new Error(`${file.name} is not an image, a PDF, or a video`);
  if (isPdf(file) && el instanceof HTMLImageElement) {
    // prepare() refuses a file of the other branch
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
    // a file put onto a picture that the mode hides is its twin for the mode shown, at its size
    if (pair && el.parentElement) {
      const own = app.doc.tagState(el);
      const size = Object.entries(own.style).filter(([k]) => k === 'width' || k === 'height').map(([k, v]) => `${k}: ${v}`).join('; ');
      const attrs: Record<string, string> = {};
      if (el.hasAttribute('alt')) attrs.alt = el.getAttribute('alt')!;
      if (size) attrs.style = size;
      const pending = app.doc.insert(mediaText(r, [`for-${pair}`], attrs), el.parentElement, el.nextElementSibling, label);
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
    // the mode, the step, and the class faint of el, its id, its group, its lock, and its place, in their order
    const own = app.doc.tagState(el);
    const classes = own.classes.filter((c) => c === 'for-dark' || c === 'for-light' || c === 'faint' || REVEAL_CLASSES.includes(c));
    const kept = Object.fromEntries(Object.entries(own.attrs).filter(([k]) => KEPT.includes(k)));
    const place = Object.entries(own.style).filter(([k]) => PLACE.includes(k)).map(([k, v]) => `${k}: ${v}`).join('; ');
    if (place) kept.style = place;
    // the renders of a PDF are shown in both modes, hence the picture of the other mode is taken off
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

// the frame of the video el at its poster time written as its poster, under the name of the video
// in a deck opened from a file, the page has an opaque origin, and the browser keeps the frames of a
// video of its folder from the page. a file chosen in the file chooser can be read, hence the video
// file is asked for once, and its copy is kept for the next capture
const chosen = new Map<string, string>();
const fileName = (url: string): string => decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() ?? '');

export const unreadable = (el: HTMLVideoElement): boolean => {
  const url = el.currentSrc || el.src;
  return location.protocol === 'file:' && !!url && !/^(blob|data):/.test(url) && !chosen.has(url);
};

// the copy of the file at url chosen by the person, e.g. a video or a PDF, or null after a cancel
export async function askForFile(url: string, noun: string, accept: string): Promise<string | null> {
  const kept = chosen.get(url);
  if (kept) return kept;
  const name = fileName(url);
  let picked: Promise<File[]> | null = null;
  await ask({
    title: `Choose the ${noun} File`,
    text: `The browser does not let a deck opened from a file read the files next to it. Choose ${name} once in the file chooser, and it can be read until the deck is closed.`,
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: `Choose ${name}…`, value: 'choose', primary: true },
    ],
    className: 'beeson-poster-ask',
    // the chooser is opened in the click on the button, which a browser requires of a file chooser
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

// the time of the poster frame of each video, in s, set with the slider of the Video pane and kept
// until the deck is closed, since the file keeps only the picture
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
