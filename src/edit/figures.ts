// the TikZ figures of a talk folder compiled by the edit command, as npm run tex compiles them. at
// the start, after a write of index.html that changes its figures or their boxes, and after a
// stable change on disk of a file that a figure reads, each figure that figureStatus finds stale or
// missing is compiled in the background, one at a time, and its output figures/name.js is written.
// a figure whose compile failed keeps its last good output, and it is not compiled again before
// its source, its box, a file that it read, or the list of the files of figures/ changes. a preview
// of a source that is not saved is compiled before them, and nothing is written for it

import { randomBytes } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compileFigure, deckFigures, figureHash, figureStates, findTools, readFigure, STYLE, texOf } from '../../scripts/figures.mjs';
import type { FigureError, FigureState } from '../session/protocol.ts';
import { renameRetried, signature } from './disk.ts';

const STABLE = 300;
// the key of the list of the files of figures/ among the watched files
const LISTING = '\0figures';

export type Box = { width: number | null; height: number | null };
type Output = { hash: string; inputs?: string[] };
type Compiled = { figure: Output; text: string } | { errors: FigureError[]; inputs?: string[]; hash?: string };
type Compile = (args: { dir: string; name: string; source: string; box: Box; tools: Tools }) => Promise<Compiled>;
type Tools = { latex: string | null; dvisvgm: string | null };
export type PreviewAnswer = { figure: Output } | { errors: FigureError[] } | { superseded: true };
type Preview = { name: string; source: string; box: Box; done: (answer: PreviewAnswer) => void };
type State = { name: string | null; box: Box; state: string; source?: string; file?: string; text?: string | null; output?: Output | null };

// stable is the time in ms that a changed file must not change before it is taken, and compile and
// tools are set in the tests
export type FigureOptions = {
  log?: (message: string) => void;
  onChange?: () => void;
  stable?: number;
  compile?: Compile;
  tools?: Tools;
};

export class FigureWatcher {
  // counted at each change of state()
  rev = 0;
  private dir: string;
  private html: string;
  private figures: string;
  private log: (message: string) => void;
  private onChange: () => void;
  private stable: number;
  private compile: Compile;
  private tools: Tools;
  private compiler: FigureState['compiler'];
  // the files that the figures read, as absolute paths, with their signatures, and a change of them
  private watched = new Map<string, string>();
  private seen: { sig: string; at: number } | null = null;
  // the outputs read, by their signatures
  private read = new Map<string, { sig: string; figure: Output | null }>();
  private outputs: Record<string, string | null> = {};
  private errors: Record<string, FigureError[]> = {};
  private compiled: Record<string, number> = {};
  private uncompiled = 0;
  private compiling: string | null = null;
  // the inputs of the last compile of each figure that is not current, with the key of what it
  // compiled, hence a compile that fails, or whose output is stale, is not run again in a loop
  private tried = new Map<string, { key: string; inputs: string[] }>();
  private stale = new Set<string>();
  // the waiting preview of each page
  private previews = new Map<string, Preview>();
  private lane: Promise<void> | null = null;
  private polled: Promise<void> | null = null;
  private stopped = false;
  private last = '';

  constructor(dir: string, html: string, options: FigureOptions = {}) {
    this.dir = dir;
    this.html = html;
    this.figures = JSON.stringify(deckFigures(html));
    this.log = options.log ?? (() => {});
    this.onChange = options.onChange ?? (() => {});
    this.stable = options.stable ?? STABLE;
    this.compile = options.compile ?? compileFigure;
    this.tools = options.tools ?? findTools();
    this.compiler = this.tools.latex && this.tools.dvisvgm ? 'fenced' : 'missing';
    if (this.compiler !== 'missing') void this.unfenced().then((unfenced) => unfenced && this.update(() => (this.compiler = 'unfenced')));
    this.evaluate();
  }

  // whether the TeX of the host is MiKTeX, which reads any file that a source names
  async unfenced(): Promise<boolean> {
    return this.compiler !== 'missing' && (await texOf(this.tools))?.miktex === true;
  }

  state(): FigureState {
    return { outputs: { ...this.outputs }, compiling: this.compiling, errors: { ...this.errors }, compiled: { ...this.compiled }, uncompiled: this.uncompiled, compiler: this.compiler };
  }

  // index.html holds html on disk
  written(html: string): void {
    this.html = html;
    const figures = JSON.stringify(deckFigures(html));
    if (figures === this.figures) return;
    this.figures = figures;
    this.evaluate();
  }

  // a source or a data file written by the edit command
  changed(): void {
    this.evaluate();
  }

  // a stat of the watched files, at each poll of index.html
  poll(): void {
    if (this.polled || this.stopped) return;
    this.polled = this.look()
      .catch((e) => this.log(`figures: ${(e as Error).message}`))
      .finally(() => (this.polled = null));
  }

  // the compile of source as figures/name.tex in box, for the page of client, before the stale
  // figures, and in place of a preview of this page that waits
  preview(client: string, name: string, source: string, box: Box): Promise<PreviewAnswer> {
    if (this.stopped) return Promise.resolve({ superseded: true });
    return new Promise((done) => {
      this.previews.get(client)?.done({ superseded: true });
      this.previews.delete(client);
      this.previews.set(client, { name, source, box, done });
      this.pump();
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const preview of this.previews.values()) preview.done({ superseded: true });
    this.previews.clear();
    await this.idle();
  }

  // resolves once every poll and compile is over
  async idle(): Promise<void> {
    while (this.polled || this.lane) await (this.polled ?? this.lane);
  }

  private update(change: () => void): void {
    change();
    const state = JSON.stringify(this.state());
    if (state === this.last) return;
    this.last = state;
    this.rev++;
    this.onChange();
  }

  private listing(): string {
    try {
      return readdirSync(join(this.dir, 'figures')).filter((name) => !name.startsWith('.')).sort().join('/');
    } catch {
      return '';
    }
  }

  private output(name: string): Output | null {
    const file = join(this.dir, 'figures', `${name}.js`);
    const sig = this.watched.get(file) ?? '';
    const cached = this.read.get(name);
    if (cached && sig && cached.sig === sig) return cached.figure;
    const figure = readFigure(this.dir, name) as Output | null;
    this.read.set(name, { sig, figure });
    return figure;
  }

  private states(): State[] {
    return figureStates(this.dir, this.html, (name: string) => this.output(name)) as State[];
  }

  private key(figure: State, inputs: string[], listing: string): string {
    return `${figureHash({ dir: this.dir, source: figure.text!, box: figure.box, inputs })}\n${listing}`;
  }

  // the state of each figure from the files on disk, and the stale figures queued
  private evaluate(): void {
    const watched = new Map<string, string>();
    const watch = (path: string) => watched.set(path, sigSync(path));
    watch(join(this.dir, 'preamble.tex'));
    watch(STYLE);
    // the outputs are read with the signatures taken before the read
    for (const { name } of deckFigures(this.html)) if (name && /^[\w-]+$/.test(name)) watch(join(this.dir, 'figures', `${name}.js`));
    this.watched = watched;
    const listing = this.listing();
    watched.set(LISTING, listing);
    const states = this.states();
    const names = new Set(states.flatMap((figure) => (figure.state === 'invalid' ? [] : [figure.name!])));
    this.update(() => {
      this.outputs = {};
      this.uncompiled = states.filter((figure) => figure.state !== 'current').length;
      for (const name of Object.keys(this.errors)) if (!names.has(name)) delete this.errors[name];
      for (const name of this.stale) if (!names.has(name)) this.stale.delete(name);
      for (const figure of states) {
        if (figure.state === 'invalid') continue;
        const name = figure.name!;
        this.outputs[name] = figure.output?.hash ?? null;
        watch(join(this.dir, figure.source!));
        const tried = this.tried.get(name);
        for (const input of [...(figure.output?.inputs ?? []), ...(tried?.inputs ?? [])]) watch(join(this.dir, input));
        if (figure.state === 'current') {
          delete this.errors[name];
          this.tried.delete(name);
        } else if (figure.state !== 'no source' && this.compiler !== 'missing' && tried?.key !== this.key(figure, tried?.inputs ?? [], listing)) this.stale.add(name);
      }
    });
    this.pump();
  }

  private async look(): Promise<void> {
    const sigs = await Promise.all(
      [...this.watched.keys()].map(async (path) => [path, path === LISTING ? await listingOf(this.dir) : await stat(path).then(signature, () => '')] as const),
    );
    const now = performance.now();
    if (sigs.some(([path, sig]) => this.watched.get(path) !== sig)) {
      const all = sigs.map(([path, sig]) => `${path}\n${sig}`).join('\n');
      if (this.seen?.sig !== all) this.seen = { sig: all, at: now };
      else if (now - this.seen.at >= this.stable) {
        this.seen = null;
        this.evaluate();
      }
    } else this.seen = null;
  }

  // the previews, and then the stale figures, compiled one at a time
  private pump(): void {
    if (this.lane || this.stopped || (!this.previews.size && !this.stale.size)) return;
    this.lane = (async () => {
      while (!this.stopped) {
        const [client, preview] = this.previews.entries().next().value ?? [];
        if (preview) {
          this.previews.delete(client!);
          const out = await this.compile({ dir: this.dir, name: preview.name, source: preview.source, box: preview.box, tools: this.tools });
          preview.done('errors' in out ? { errors: out.errors } : { figure: out.figure });
          continue;
        }
        const name = this.stale.values().next().value;
        if (name === undefined) break;
        this.stale.delete(name);
        await this.write(name);
      }
    })()
      .catch((e) => this.log(`figures: ${(e as Error).message}`))
      .finally(() => {
        this.lane = null;
        this.pump();
      });
  }

  private async write(name: string): Promise<void> {
    // the figure is found again, since its files may have changed since it was queued
    const listing = this.listing();
    const figure = this.states().find((f) => f.name === name);
    if (!figure || (figure.state !== 'stale' && figure.state !== 'missing')) return;
    const tried = this.tried.get(name);
    if (tried && tried.key === this.key(figure, tried.inputs, listing)) return;
    this.update(() => (this.compiling = name));
    let out: Compiled;
    try {
      out = await this.compile({ dir: this.dir, name, source: figure.text!, box: figure.box, tools: this.tools });
    } finally {
      this.update(() => (this.compiling = null));
    }
    this.compiled[name] = Date.now();
    const inputs = ('errors' in out ? out.inputs : out.figure.inputs) ?? [];
    // the key of the texts that the compile read, hence a file changed during it is compiled again
    const used = 'errors' in out ? out.hash : out.figure.hash;
    this.tried.set(name, { key: used ? `${used}\n${listing}` : this.key(figure, inputs, listing), inputs });
    if ('errors' in out) {
      this.errors[name] = out.errors;
      for (const error of out.errors) this.log(`${error.file ?? figure.source}${error.line === null ? '' : `:${error.line}`}: ${error.message}`);
      this.log(`${figure.file}: not compiled${figure.state === 'stale' ? ', the last good output is kept' : ''}`);
      this.evaluate();
      return;
    }
    // a source or a box changed during the compile is compiled again
    const now = this.states().find((f) => f.name === name);
    if (now?.text !== figure.text || JSON.stringify(now?.box) !== JSON.stringify(figure.box)) return this.evaluate();
    const file = join(this.dir, 'figures', `${name}.js`);
    const tmp = join(this.dir, 'figures', `.${name}.js.${randomBytes(6).toString('hex')}.tmp`);
    try {
      await writeFile(tmp, out.text);
      await renameRetried(tmp, file);
      delete this.errors[name];
      this.log(`${figure.file}: compiled`);
    } catch (e) {
      await unlink(tmp).catch(() => {});
      this.errors[name] = [{ file: figure.file!, line: null, message: `could not write ${figure.file}: ${(e as Error).message}` }];
      this.log(`could not write ${file}: ${(e as Error).message}`);
    }
    this.evaluate();
  }
}

function sigSync(path: string): string {
  try {
    return signature(statSync(path));
  } catch {
    return '';
  }
}

const listingOf = (dir: string) =>
  readdir(join(dir, 'figures')).then(
    (names) => names.filter((name) => !name.startsWith('.')).sort().join('/'),
    () => '',
  );
