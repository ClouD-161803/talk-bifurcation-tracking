// the QR code of the link of a session, for the Share dialog: the encoder of src/qr.ts at level M,
// cut to versions 1 to 10, since a code drawn at 160 px is not read reliably with more modules

import { capacity, encode } from '../qr.ts';

export const MAX_VERSION = 10;

// the modules of the code of text, true for dark, without the quiet zone. throws when the UTF-8
// of text is longer than version 10 holds
export function qr(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > capacity(MAX_VERSION)) throw new Error(`the text is ${bytes} bytes long, and a QR code of version ${MAX_VERSION} at level M holds at most ${capacity(MAX_VERSION)}`);
  return encode(text).dark;
}
