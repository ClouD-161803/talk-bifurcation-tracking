// the parts of a PDF figure that the editor, npm run tex, and npm run check share. a PDF figure is
// an img with data-pdf, the path of a PDF, and data-page, its page from 1. its src is a render of
// this page, i.e. a PNG in the colors of the mode of its class for-dark or for-light, or in the
// colors of the PDF without either class. the hash of what the render was made from is kept in a
// tEXt chunk, and a stale render is found with it by npm run check. this file is read by Node as
// well, hence it does not touch the page

export type Mode = 'dark' | 'light' | null;
// the background and the text of a mode, as #rrggbb
export type Tones = { bg: string; text: string };

// a page is rendered to fit into twice the design size of a slide
export const RENDER_WIDTH = 3840;
export const RENDER_HEIGHT = 2160;
// the keyword of the tEXt chunk of a render. VERSION is raised when a render of the same input changes
const KEY = 'beeson-pdf';
const VERSION = 1;

export const modeOf = (classes: string[]): Mode => (classes.includes('for-dark') ? 'dark' : classes.includes('for-light') ? 'light' : null);

export const pageOf = (value: string | null | undefined): number => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
};

// --bg and --text of each mode, from the text of theme/beeson.css, where the dark mode is the
// block of :root and html[data-theme="dark"]
export function tonesOf(css: string): Record<'dark' | 'light', Tones> {
  const block = (mode: string): Tones => {
    const body = new RegExp(`html\\[data-theme="${mode}"\\]\\s*\\{([^}]*)\\}`).exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? '';
    const tone = (name: string) => {
      const value = new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(body)?.[1];
      if (!value) throw new Error(`--${name} of the ${mode} mode is not a color #rrggbb in theme/beeson.css`);
      return value.toLowerCase();
    };
    return { bg: tone('bg'), text: tone('text') };
  };
  return { dark: block('dark'), light: block('light') };
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// the hash of a render, from the bytes of the PDF, the page, the mode, and the tones of the mode.
// it is cyrb53, which is the same in a page and in Node without the crypto of either
export function renderHash(pdf: Uint8Array, page: number, mode: Mode, tones: Tones | null): string {
  let h1 = 0xdeadbeef ^ VERSION;
  let h2 = 0x41c6ce57 ^ VERSION;
  const add = (b: number) => {
    h1 = Math.imul(h1 ^ b, 2654435761);
    h2 = Math.imul(h2 ^ b, 1597334677);
  };
  for (let i = 0; i < pdf.length; i++) add(pdf[i]);
  for (const c of `\0${page}\0${mode ?? 'none'}\0${mode && tones ? `${tones.bg} ${tones.text}` : ''}`) add(c.charCodeAt(0));
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

// the colors of a page drawn in RGBA mapped onto a mode, in place. black is mapped to the text and
// white to the background of the mode. in the dark mode the colors are first inverted and turned
// by half a hue circle, as by the class invert of the theme, i.e. invert(1) hue-rotate(180deg),
// which inverts the lightness and keeps the hue. in the colors of the PDF, i.e. without a mode, the
// page is put on white, as in a PDF viewer, since a PDF of LaTeX does not paint its page
export function mapColors(data: Uint8ClampedArray, mode: Mode, tones: Tones | null): void {
  if (!mode || !tones) {
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      for (let k = i; k < i + 3; k++) data[k] = (data[k] * a) / 255 + 255 - a;
      data[i + 3] = 255;
    }
    return;
  }
  const [bg, text] = [rgb(tones.bg), rgb(tones.text)];
  // the matrix of hue-rotate(180deg) of the filter effects of CSS
  const H = [-0.574, 1.43, 0.144, 0.426, 0.43, 0.144, 0.426, 1.43, -0.856];
  const [from, to] = mode === 'dark' ? [bg, text] : [text, bg];
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    if (mode === 'dark') {
      const [ir, ig, ib] = [255 - r, 255 - g, 255 - b];
      r = clamp(H[0] * ir + H[1] * ig + H[2] * ib);
      g = clamp(H[3] * ir + H[4] * ig + H[5] * ib);
      b = clamp(H[6] * ir + H[7] * ig + H[8] * ib);
    }
    data[i] = from[0] + ((to[0] - from[0]) * r) / 255;
    data[i + 1] = from[1] + ((to[1] - from[1]) * g) / 255;
    data[i + 2] = from[2] + ((to[2] - from[2]) * b) / 255;
  }
}

let table: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

// the PNG png with the hash of its render in a tEXt chunk after its header chunk
export function withHash(png: Uint8Array, hash: string): Uint8Array {
  const body = latin1(`tEXt${KEY}\0${hash}`);
  const chunk = new Uint8Array(body.length + 8);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, body.length - 4);
  chunk.set(body, 4);
  view.setUint32(body.length + 4, crc32(body));
  // the signature of 8 bytes, then the header chunk of 13 bytes with its length, type, and CRC
  const at = 8 + 25;
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, at));
  out.set(chunk, at);
  out.set(png.subarray(at), at + chunk.length);
  return out;
}

// the hash of the render in the PNG png, or null when it is not a render or its chunk is broken
export function hashOf(png: Uint8Array): string | null {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (let at = 8; at + 12 <= png.length; ) {
    const length = view.getUint32(at);
    if (at + 12 + length > png.length) return null;
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    if (type === 'IDAT' || type === 'IEND') return null;
    if (type === 'tEXt') {
      if (crc32(png.subarray(at + 4, at + 8 + length)) !== view.getUint32(at + 8 + length)) return null;
      // the keyword is compared byte by byte, since the text of another program may be large
      const key = latin1(`${KEY}\0`);
      if (length <= key.length + 64 && key.every((b, i) => png[at + 8 + i] === b)) return String.fromCharCode(...png.subarray(at + 8 + key.length, at + 8 + length));
    }
    at += length + 12;
  }
  return null;
}
