import { capacity, encode } from '../qr.ts';

export const MAX_VERSION_AT_160_PX = 10;

export function qr(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > capacity(MAX_VERSION_AT_160_PX)) throw new Error(`the text is ${bytes} bytes long, and a QR code of version ${MAX_VERSION_AT_160_PX} at level M holds at most ${capacity(MAX_VERSION_AT_160_PX)}`);
  return encode(text).dark;
}
