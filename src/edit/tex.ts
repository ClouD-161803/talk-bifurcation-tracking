// tex.js of a talk folder written by the edit command from preamble.tex, references.bib, and the
// deck, with the text that npm run tex writes. it is derived again after a write of index.html that
// cites other papers. it is written only when its text changes, and never in a folder without
// preamble.tex and references.bib, whose tex.js may be shared with another deck. every write of
// tex.js is counted, and the pages draw the deck again with it

import { readFileSync, statSync, type Stats } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { readBibtex } from '../bibtex.ts';
import { readPreamble, type Resolve } from '../preamble.ts';
import { citedKeys, texOf, texScript } from '../texfile.ts';
import { renameRetried } from './disk.ts';

// the change time is left out, as in disk.ts, since a rename changes it on some systems
const signature = (s: Stats) => `${s.size}:${s.mtimeMs}:${s.ino}`;

// the cited keys of a deck in one order, since a citation moved in the deck does not change tex.js
const keysOf = (html: string) => citedKeys(html).sort().join(',');

export type DerivedTex = {
  text: string;
  // the files of the folder that were read or looked up, with their signatures, '' when missing
  files: Map<string, string>;
  // whether the folder has preamble.tex or references.bib
  sources: boolean;
  // the files that exist but could not be read, each with its reason
  unread: string[];
};

/**
 * The text of tex.js for the deck html in the folder dir, as deckTex of scripts/tex.mjs derives it
 * from the files of the folder, with the signature of each file that was read or looked up.
 */
export function deriveTex(dir: string, html: string): DerivedTex {
  const files = new Map<string, string>();
  const unread: string[] = [];
  const text = (name: string): string | null => {
    const file = join(dir, name);
    try {
      // the signature before the read, hence a change during the read is found by the next poll
      files.set(name, signature(statSync(file)));
      return readFileSync(file, 'utf8');
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (!files.has(name)) files.set(name, '');
      if (code !== 'ENOENT' && code !== 'ENOTDIR') unread.push(`${name} is not read: ${(e as Error).message}`);
      return null;
    }
  };
  // as in TeX, a file is looked up from the folder of the preamble, and \input adds .tex to a name
  // without an extension
  const names = {
    input: (name: string) => (/\.[A-Za-z]+$/.test(name) ? [name] : [`${name}.tex`, name]),
    package: (name: string) => [`${name}.sty`],
    class: (name: string) => [`${name}.cls`],
  };
  const find: Resolve = (name, kind) => {
    for (const file of names[kind](name)) {
      const found = text(file);
      if (found !== null) return { file, text: found };
    }
    return null;
  };
  const preamble = readPreamble(text('preamble.tex') ?? '', { file: 'preamble.tex', resolve: find });
  const bibliography = readBibtex(text('references.bib') ?? '');
  const { tex } = texOf(preamble, bibliography, html);
  return { text: texScript(tex), files, sources: files.get('preamble.tex') !== '' || files.get('references.bib') !== '', unread };
}

// onChange is called at each write of tex.js
export type TexOptions = {
  log?: (message: string) => void;
  onChange?: () => void;
};

export class TexWriter {
  private dir: string;
  private file: string;
  private log: (message: string) => void;
  private onChange: () => void;
  // the text of index.html written last, and the cited keys of the text of the last derivation
  private html: string;
  private keys: string;
  // the derivations run one at a time
  private chain: Promise<void> = Promise.resolve();
  private due = false;

  // html is the text of index.html at the start, and nothing is written
  constructor(dir: string, html: string, options: TexOptions = {}) {
    this.dir = dir;
    this.file = join(dir, 'tex.js');
    this.log = options.log ?? (() => {});
    this.onChange = options.onChange ?? (() => {});
    this.html = html;
    this.keys = keysOf(html);
  }

  // index.html holds html on disk. tex.js is derived again when it cites other keys
  written(html: string): void {
    if (html === this.html) return;
    this.html = html;
    if (keysOf(html) !== this.keys) this.derive();
  }

  // resolves once the derivation of the last write of index.html is over
  async stop(): Promise<void> {
    await this.idle();
  }

  // resolves once every derivation is over
  async idle(): Promise<void> {
    let chain;
    do await (chain = this.chain);
    while (chain !== this.chain);
  }

  private run(task: () => Promise<void>): Promise<void> {
    return (this.chain = this.chain.then(task).catch((e) => this.log(`tex.js: ${(e as Error).message}`)));
  }

  private derive(): void {
    if (this.due) return;
    this.due = true;
    void this.run(() => {
      this.due = false;
      return this.write();
    });
  }

  private async write(): Promise<void> {
    const html = this.html;
    const derived = deriveTex(this.dir, html);
    this.keys = keysOf(html);
    if (!derived.sources) return;
    // a tex.js without the macros of a file that is not read would break every page
    if (derived.unread.length) {
      this.log(`tex.js is not written, since ${derived.unread.join(', and ')}`);
      return;
    }
    const old = await readFile(this.file, 'utf8').catch(() => null);
    if (old === derived.text) return;
    const tmp = join(this.dir, `.tex.js.${randomBytes(6).toString('hex')}.tmp`);
    try {
      await writeFile(tmp, derived.text);
      await renameRetried(tmp, this.file);
      this.onChange();
    } catch (e) {
      await unlink(tmp).catch(() => {});
      this.log(`could not write ${this.file}: ${(e as Error).message}`);
    }
  }
}
