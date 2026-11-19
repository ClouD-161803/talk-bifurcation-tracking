import { capacity, encode } from '../qr.ts';

export const MAX_VERSION = 10;

export function qr(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > capacity(MAX_VERSION)) throw new Error(`the text is ${bytes} bytes long, and a QR code of version ${MAX_VERSION} at level M holds at most ${capacity(MAX_VERSION)}`);
  return encode(text).dark;
}
