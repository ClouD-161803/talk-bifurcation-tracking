// File > Preamble… and File > Bibliography…, the sheets of preamble.tex and references.bib, and the
// save of the two sources and of tex.js next to the deck. the sheets and the readers of TeX are
// built into theme/editor-tex.js, which is loaded at the first open of a sheet, since editor.js is
// loaded at each edit and is kept under its budget. a save writes these files only once a sheet
// has read them

import type { App } from '../app.ts';
import { addCompanion } from '../file/files.ts';
import { deckFolder } from '../media/save.ts';
import type { Tex } from '../../texfile.ts';

export type Which = 'preamble' | 'bibliography';
// the service of theme/editor-tex.js. write and download save the changed sources and tex.js for
// the text of the deck, as a companion of file/files.ts does. load reads the sources, after which
// bibliography gives the text of references.bib, and setBibliography changes it as one entry of
// the history, e.g. for a new entry
export type TexSheets = {
  open(which: Which): Promise<void>;
  write(text: string, deck: FileSystemFileHandle): Promise<string>;
  download(text: string): string;
  dirty(): boolean;
  load(): Promise<void>;
  bibliography(): string | null;
  setBibliography(text: string, label?: string): void;
};
// what editor.js gives theme/editor-tex.js: the app, the folder of the deck shared with the media
// files, and the tex.js of the deck as the page loaded it
export type TexHost = { app: App; folder: typeof deckFolder; start: Tex | null };

declare global {
  interface Window {
    BeesonTexSheets?: (host: TexHost) => TexSheets;
  }
}

// read while editor.js runs, since the script of the page is not current after that
const SELF = (document.currentScript as HTMLScriptElement | null)?.src ?? '';

export function install(app: App): void {
  const tex = (window as { beesonTex?: Tex }).beesonTex;
  const start: Tex | null = tex ? JSON.parse(JSON.stringify(tex)) : null;
  let sheets: TexSheets | null = null;
  let loading: Promise<TexSheets> | null = null;
  const load = (): Promise<TexSheets> =>
    (loading ??= new Promise<TexSheets>((done, fail) => {
      const script = document.createElement('script');
      script.src = SELF ? new URL('editor-tex.js', SELF).href : 'theme/editor-tex.js';
      script.onload = () => (window.BeesonTexSheets ? done((sheets = window.BeesonTexSheets({ app, folder: deckFolder, start }))) : fail(new Error('theme/editor-tex.js did not start')));
      script.onerror = () => {
        loading = null;
        fail(new Error('theme/editor-tex.js is not found next to theme/editor.js'));
      };
      document.head.append(script);
    }));
  addCompanion({
    write: async (text, deck) => (await sheets?.write(text, deck)) ?? '',
    download: (text) => sheets?.download(text) ?? '',
    dirty: () => sheets?.dirty() ?? false,
  });
  // the run ends once the sheet is shown, since a sheet of a deck opened from a file waits for the
  // folder of the deck to be chosen
  const open = (which: Which) => load().then((s) => void s.open(which).catch((e) => app.fail(e)));
  app.commands.define({ id: 'file.preamble', label: 'Preamble…', menu: { bar: 'File', group: 'tex', order: 35 }, run: () => open('preamble') });
  app.commands.define({ id: 'file.bibliography', label: 'Bibliography…', menu: { bar: 'File', group: 'tex', order: 36 }, run: () => open('bibliography') });
}
