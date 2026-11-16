// the renders of PDF figures, built into theme/editor-pdf.js, which the editor loads after
// theme/vendor/pdfjs/pdf.js at the first PDF, and which npm run tex loads into a page of Chrome.
// a page is drawn once and mapped onto each mode asked for

import { RENDER_HEIGHT, RENDER_WIDTH, mapColors, renderHash, withHash, type Mode, type Tones } from '../../pdffigure.ts';

type Viewport = { width: number; height: number };
type PdfPage = {
  getViewport(o: { scale: number }): Viewport;
  render(o: { canvas: HTMLCanvasElement; viewport: Viewport; background: string }): { promise: Promise<void> };
};
type PdfDocument = { numPages: number; getPage(n: number): Promise<PdfPage> };
type PdfLib = { getDocument(o: { data: Uint8Array; isEvalSupported: boolean }): { promise: Promise<PdfDocument>; destroy(): Promise<void> } };

export type Render = { mode: Mode; png: Uint8Array };
export type Rendered = { pages: number; renders: Render[] };

const pngOf = (canvas: HTMLCanvasElement): Promise<Uint8Array> =>
  new Promise((done, fail) =>
    canvas.toBlob((blob) => (blob ? blob.arrayBuffer().then((b) => done(new Uint8Array(b)), fail) : fail(new Error('the page could not be written as a PNG'))), 'image/png'),
  );

// the renders of page of the PDF pdf in each of modes, with the tones of each mode. a page past
// the last one throws an error with the number of pages
export async function render(pdf: Uint8Array, page: number, modes: Mode[], tones: Record<'dark' | 'light', Tones>): Promise<Rendered> {
  const lib = (globalThis as { pdfjsLib?: PdfLib }).pdfjsLib;
  if (!lib) throw new Error('theme/vendor/pdfjs/pdf.js is not loaded');
  // pdf.js takes over the buffer that it is given, hence it is given a copy
  const task = lib.getDocument({ data: pdf.slice(), isEvalSupported: false });
  const canvas = document.createElement('canvas');
  try {
    const doc = await task.promise;
    if (page > doc.numPages) throw new Error(`the PDF has ${doc.numPages} page${doc.numPages === 1 ? '' : 's'}, and page ${page} is asked for`);
    const p = await doc.getPage(page);
    const unit = p.getViewport({ scale: 1 });
    const viewport = p.getViewport({ scale: Math.min(RENDER_WIDTH / unit.width, RENDER_HEIGHT / unit.height) });
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    // the context is made with an alpha channel before pdf.js asks for one without it, hence a page
    // without a background of its own is transparent
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    await p.render({ canvas, viewport, background: 'rgba(0,0,0,0)' }).promise;
    const drawn = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const renders: Render[] = [];
    for (const mode of modes) {
      const image = new ImageData(new Uint8ClampedArray(drawn.data), drawn.width, drawn.height);
      const modeTones = mode ? tones[mode] : null;
      mapColors(image.data, mode, modeTones);
      ctx.putImageData(image, 0, 0);
      renders.push({ mode, png: withHash(await pngOf(canvas), renderHash(pdf, page, mode, modeTones)) });
    }
    return { pages: doc.numPages, renders };
  } finally {
    // the memory of the canvas is given back at once, which Safari on a phone holds to a small limit
    canvas.width = canvas.height = 0;
    void task.destroy();
  }
}

declare global {
  interface Window {
    BeesonPdf?: { render: typeof render };
  }
}
window.BeesonPdf = { render };
