// tex.js of a talk folder written by the edit command from preamble.tex, references.bib, and the
// deck, with the text that npm run tex writes. it is derived again after a write of index.html that
// cites other papers, and after a change on disk of preamble.tex, of references.bib, or of a file
// that the preamble reads, once the change is stable. it is written only when its text changes,
// and never in a folder without preamble.tex and references.bib, whose tex.js may be shared with
// another deck. every change of tex.js on disk, by the edit command or by another program, is
// counted, and the pages draw the deck again with it. so is a stable change of a source that
// leaves the text of tex.js as it is, after which the pages read the sources again, e.g. for a
// paper added to references.bib that the deck does not cite yet

import { readFileSync, statSync, type Stats } from 'node:fs';
import { readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { readBibtex } from '../bibtex.ts';
import { readPreamble, type Resolve } from '../preamble.ts';
import { citedKeys, texOf, texScript } from '../texfile.ts';
import { renameRetried } from './disk.ts';

const STABLE = 300;

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

// onChange is called at each change of tex.js on disk, and after a stable change of a source that
// leaves tex.js as it is. stable is the time in ms that a changed file
// must not change before it is taken, shorter in the tests
export type TexOptions = {
  log?: (message: string) => void;
  onChange?: () => void;
  stable?: number;
};

// a signature that differs from the one taken last, and the time at which it was first seen
type Seen = { sig: string; at: number } | null;

export class TexWriter {
  private dir: string;
  private file: string;
  private log: (message: string) => void;
  private onChange: () => void;
  private stable: number;
  // the text of index.html written last, and the cited keys of the text of the last derivation
  private html: string;
  private keys: string;
  // the files read or looked up by the last derivation, with their signatures, and a change of them
  private watched: Map<string, string>;
  private sourcesSeen: Seen = null;
  // the signature of tex.js written or counted last, and a change of it
  private texSig: string;
  private texSeen: Seen = null;
  // the derivations and the polls run one at a time
  private chain: Promise<void> = Promise.resolve();
  private due = false;
  // whether the derivation that is due follows a stable change of a source
  private changed = false;
  private polling = false;
  private stopped = false;

  // html is the text of index.html at the start. the files are read for their signatures, and
  // nothing is written
  constructor(dir: string, html: string, options: TexOptions = {}) {
    this.dir = dir;
    this.file = join(dir, 'tex.js');
    this.log = options.log ?? (() => {});
    this.onChange = options.onChange ?? (() => {});
    this.stable = options.stable ?? STABLE;
    this.html = html;
    this.keys = keysOf(html);
    this.watched = deriveTex(dir, html).files;
    this.texSig = sigOf(this.file);
  }

  // index.html holds html on disk. tex.js is derived again when it cites other keys
  written(html: string): void {
    if (html === this.html) return;
    this.html = html;
    if (keysOf(html) !== this.keys) this.derive();
  }

  // a stat of the files of the last derivation and of tex.js, at each poll of index.html
  poll(): void {
    if (this.polling || this.stopped) return;
    this.polling = true;
    void this.run(async () => {
      try {
        await this.look();
      } finally {
        this.polling = false;
      }
    });
  }

  // no poll after a stop. resolves once the derivation of the last write of index.html is over
  async stop(): Promise<void> {
    this.stopped = true;
    await this.idle();
  }

  // resolves once every derivation and poll is over
  async idle(): Promise<void> {
    let chain;
    do await (chain = this.chain);
    while (chain !== this.chain);
  }

  private run(task: () => Promise<void>): Promise<void> {
    return (this.chain = this.chain.then(task).catch((e) => this.log(`tex.js: ${(e as Error).message}`)));
  }

  private derive(changed = false): void {
    this.changed ||= changed;
    if (this.due) return;
    this.due = true;
    void this.run(() => {
      this.due = false;
      return this.write();
    });
  }

  private async look(): Promise<void> {
    const now = performance.now();
    const sigs = await Promise.all([...this.watched.keys()].map(async (name) => [name, await statSig(join(this.dir, name))] as const));
    const sources = sigs.map(([name, sig]) => `${name}\n${sig}`).join('\n');
    if (sigs.some(([name, sig]) => this.watched.get(name) !== sig)) {
      if (this.sourcesSeen?.sig !== sources) this.sourcesSeen = { sig: sources, at: now };
      else if (now - this.sourcesSeen.at >= this.stable) this.derive(true);
    } else this.sourcesSeen = null;
    const tex = await statSig(this.file);
    if (tex !== this.texSig) {
      if (this.texSeen?.sig !== tex) this.texSeen = { sig: tex, at: now };
      else if (now - this.texSeen.at >= this.stable) {
        this.texSig = tex;
        this.texSeen = null;
        this.onChange();
      }
    } else this.texSeen = null;
  }

  private async write(): Promise<void> {
    const html = this.html;
    const changed = this.changed;
    this.changed = false;
    const derived = deriveTex(this.dir, html);
    this.keys = keysOf(html);
    this.watched = derived.files;
    this.sourcesSeen = null;
    if (!derived.sources) return;
    // a tex.js without the macros of a file that is not read would break every page
    if (derived.unread.length) {
      this.log(`tex.js is not written, since ${derived.unread.join(', and ')}`);
      return;
    }
    const old = await readFile(this.file, 'utf8').catch(() => null);
    if (old === derived.text) {
      if (changed) this.onChange();
      return;
    }
    const tmp = join(this.dir, `.tex.js.${randomBytes(6).toString('hex')}.tmp`);
    try {
      await writeFile(tmp, derived.text);
      const made = await stat(tmp);
      await renameRetried(tmp, this.file);
      this.texSig = signature(made);
      this.texSeen = null;
      this.onChange();
    } catch (e) {
      await unlink(tmp).catch(() => {});
      this.log(`could not write ${this.file}: ${(e as Error).message}`);
    }
  }
}

function sigOf(file: string): string {
  try {
    return signature(statSync(file));
  } catch {
    return '';
  }
}

const statSig = (file: string) => stat(file).then(signature, () => '');
