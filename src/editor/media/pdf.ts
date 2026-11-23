import { pageOf, type Mode, type Tones } from '../../pdffigure.ts';
import { make } from '../ui/dom.ts';
import { script, themeUrl } from '../ui/script.ts';
import { askForFile } from './actions.ts';
import { media, type MediaFile } from './store.ts';
export { isPdf } from './store.ts';

export const pdfOf = (el: Element | null): string | null => (el?.localName === 'img' ? el.getAttribute('data-pdf') : null);

let loading: Promise<NonNullable<Window['BeesonPdf']>> | null = null;
const renderer = () =>
  (loading ??= script('vendor/pdfjs/pdf.js')
    .then(() => script('editor-pdf.js'))
    .then(() => window.BeesonPdf ?? Promise.reject(new Error('theme/editor-pdf.js did not start')))
    .catch((e) => {
      loading = null;
      throw e;
    }));

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

export async function renderPdf(bytes: Uint8Array, path: string, page: number, modes: Mode[], taken: (path: string) => boolean): Promise<PdfRenders> {
  const [r, t] = await Promise.all([renderer(), tones()]);
  const { pages, renders } = await r.render(bytes, page, modes, t);
  const stem = path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '') + (page > 1 ? `-page-${page}` : '');
  const pngs = renders.map(({ mode, png }) => ({ mode, file: new File([png as BlobPart], `${stem}${mode ? `-${mode}` : ''}.png`, { type: 'image/png' }) }));
  for (const { file } of pngs) {
    const refused = media.refuse?.(file);
    if (refused) throw new Error(refused);
  }
  return { pages, files: pngs.map(({ mode, file }) => ({ mode, file: media.add(file, file.name, taken, 'figure') })) };
}

export async function pdfBytes(path: string): Promise<Uint8Array | null> {
  const kept = media.get(path);
  if (kept) return new Uint8Array(await kept.blob.arrayBuffer());
  const url = new URL(path, location.href).href;
  if (location.protocol !== 'file:') {
    const response = await fetch(url).catch(() => null);
    if (response?.status === 413 && response.headers.has('x-edit-command')) throw new Error(`${path} is over the 16 MB limit of the relay`);
    if (!response || response.status >= 500) throw new Error(`${path} cannot be read now (${response ? `status ${response.status}` : 'the request failed'}). Try again later`);
    if (!response.ok) throw new Error(`${path} is not found next to the deck`);
    return new Uint8Array(await response.arrayBuffer());
  }
  const chosen = await askForFile(url, 'PDF', 'application/pdf,.pdf');
  return chosen ? new Uint8Array(await (await fetch(chosen)).arrayBuffer()) : null;
}

export const pageOfFigure = (el: Element): number => pageOf(el.getAttribute('data-page'));
