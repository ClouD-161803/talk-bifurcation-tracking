// the PDF figures of the editor, i.e. the images of src/pdffigure.ts. a PDF is rendered at insert,
// and again for another page or the other choice of Match the Mode, with pdf.js of theme/vendor/
// and the renderer of theme/editor-pdf.js, which are loaded at the first PDF. the renders and the
// PDF are kept in the store of store.ts until a save, as other media files

import { pageOf, type Mode, type Tones } from '../../pdffigure.ts';
import { make } from '../ui/dom.ts';
import { askForFile } from './actions.ts';
import { media, type MediaFile } from './store.ts';
export { isPdf } from './store.ts';

const SELF = (document.currentScript as HTMLScriptElement | null)?.src ?? '';
const themeUrl = (path: string) => (SELF ? new URL(path, SELF).href : `theme/${path}`);

export const pdfOf = (el: Element | null): string | null => (el?.localName === 'img' ? el.getAttribute('data-pdf') : null);

const script = (path: string): Promise<void> =>
  new Promise((done, fail) => {
    const s = make('script');
    s.src = themeUrl(path);
    s.onload = () => done();
    s.onerror = () => fail(new Error(`theme/${path} is not found next to theme/editor.js`));
    document.head.append(s);
  });

let loading: Promise<NonNullable<Window['BeesonPdf']>> | null = null;
const renderer = () =>
  (loading ??= script('vendor/pdfjs/pdf.js')
    .then(() => script('editor-pdf.js'))
    .then(() => window.BeesonPdf ?? Promise.reject(new Error('theme/editor-pdf.js did not start')))
    .catch((e) => {
      loading = null;
      throw e;
    }));

// --bg and --text of each mode, read from theme/beeson.css in a hidden frame, since the deck shows
// one mode only, and a deck opened as a file cannot read the text of the style sheet
let toned: Promise<Record<'dark' | 'light', Tones>> | null = null;
const tones = () =>
  (toned ??= new Promise<Record<'dark' | 'light', Tones>>((done, fail) => {
    const frame = make('iframe');
    frame.hidden = true;
    document.body.append(frame);
    const doc = frame.contentDocument!;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = themeUrl('beeson.css');
    link.onload = () => {
      const read = (mode: 'dark' | 'light'): Tones => {
        doc.documentElement.dataset.theme = mode;
        const style = getComputedStyle(doc.documentElement);
        const tone = (name: string) => style.getPropertyValue(`--${name}`).trim().toLowerCase();
        return { bg: tone('bg'), text: tone('text') };
      };
      const out = { dark: read('dark'), light: read('light') };
      frame.remove();
      const bad = Object.values(out).some((t) => !/^#[0-9a-f]{6}$/.test(t.bg) || !/^#[0-9a-f]{6}$/.test(t.text));
      if (bad) fail(new Error('--bg and --text of theme/beeson.css are not colors #rrggbb'));
      else done(out);
    };
    link.onerror = () => {
      frame.remove();
      fail(new Error('theme/beeson.css is not found next to theme/editor.js'));
    };
    doc.head.append(link);
  }).catch((e) => {
    toned = null;
    throw e;
  }));

export type PdfRenders = { pages: number; files: { mode: Mode; file: MediaFile }[] };

// the renders of page of the PDF bytes in each of modes, as new files named after the PDF at path
export async function renderPdf(bytes: Uint8Array, path: string, page: number, modes: Mode[], taken: (path: string) => boolean): Promise<PdfRenders> {
  const [r, t] = await Promise.all([renderer(), tones()]);
  const { pages, renders } = await r.render(bytes, page, modes, t);
  const stem = path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '') + (page > 1 ? `-page-${page}` : '');
  const pngs = renders.map(({ mode, png }) => ({ mode, file: new File([png as BlobPart], `${stem}${mode ? `-${mode}` : ''}.png`, { type: 'image/png' }) }));
  // e.g. a render over the limit of a picture of a session, refused before the deck is changed
  for (const { file } of pngs) {
    const refused = media.refuse?.(file);
    if (refused) throw new Error(refused);
  }
  return { pages, files: pngs.map(({ mode, file }) => ({ mode, file: media.add(file, file.name, taken, 'figure') })) };
}

// the bytes of the PDF at path, from the store for a new file, and over http for a deck on a
// server. a deck opened as a file cannot read its folder, hence the PDF is then chosen once in the
// file chooser
export async function pdfBytes(path: string): Promise<Uint8Array | null> {
  const kept = media.get(path);
  if (kept) return new Uint8Array(await kept.blob.arrayBuffer());
  const url = new URL(path, location.href).href;
  if (location.protocol !== 'file:') {
    const response = await fetch(url);
    // a guest of a session is answered 413 for a file over the 16 MB of the relay
    if (response.status === 413) throw new Error(`${path} cannot be read on this page, since it is larger than 16 MB, the limit of the relay of the session`);
    if (!response.ok) throw new Error(`${path} is not found next to the deck`);
    return new Uint8Array(await response.arrayBuffer());
  }
  const chosen = await askForFile(url, 'PDF', 'application/pdf,.pdf');
  return chosen ? new Uint8Array(await (await fetch(chosen)).arrayBuffer()) : null;
}

export const pageOfFigure = (el: Element): number => pageOf(el.getAttribute('data-page'));
