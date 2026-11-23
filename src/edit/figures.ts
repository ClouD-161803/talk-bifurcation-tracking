import { randomBytes } from 'node:crypto';
import { readdirSync, statSync, type Stats } from 'node:fs';
import { readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compileFigure, deckFigures, figureHash, figureStates, findTools, readFigure, STYLE } from '../../scripts/figures.mjs';
import type { FigureError, FigureState } from '../session/protocol.ts';
import { renameRetried, signature } from './disk.ts';

const STABLE = 300;
const COARSEST_MTIME_TICK = 2000;
const LISTING = '\0figures';

export type Box = { width: number | null; height: number | null };
type Output = { hash: string; inputs?: string[] };
type Compiled = { figure: Output; text: string } | { errors: FigureError[]; inputs?: string[]; hash?: string };
type Compile = (args: { dir: string; name: string; source: string; box: Box; tools: Tools; signal: AbortSignal }) => Promise<Compiled>;
type Tools = { latex: string | null; dvisvgm: string | null };
export type PreviewAnswer = { figure: Output } | { errors: FigureError[] } | { superseded: true };
type Preview = { name: string; source: string; box: Box; done: (answer: PreviewAnswer) => void };
type State = { name: string | null; box: Box; state: string; source?: string; file?: string; text?: string | null; output?: Output | null };

export type FigureOptions = {
  log?: (message: string) => void;
  onChange?: () => void;
  stable?: number;
  compile?: Compile;
  tools?: Tools;
};

export class FigureWatcher {
  rev = 0;
  private dir: string;
  private html: string;
  private figures: string;
  private log: (message: string) => void;
  private onChange: () => void;
  private stable: number;
  private compile: Compile;
  private tools: Tools;
  private readonly compiler: FigureState['compiler'];
  private watched = new Map<string, string>();
  private seen: { sig: string; at: number } | null = null;
  private recent = new Set<string>();
  private read = new Map<string, { sig: string; figure: Output | null }>();
  private outputs: Record<string, string | null> = {};
  private errors: Record<string, FigureError[]> = {};
  private compiled: Record<string, number> = {};
  private uncompiled = 0;
  private compiling: string | null = null;
  private tried = new Map<string, { key: string; inputs: string[] }>();
  private stale = new Set<string>();
  private previews = new Map<string, Preview>();
  private lane: Promise<void> | null = null;
  private running: { controller: AbortController; client: string | null } | null = null;
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
    this.compiler = this.tools.latex && this.tools.dvisvgm ? 'found' : 'missing';
    this.evaluate();
  }

  state(): FigureState {
    return { outputs: { ...this.outputs }, compiling: this.compiling, errors: { ...this.errors }, compiled: { ...this.compiled }, uncompiled: this.uncompiled, compiler: this.compiler };
  }

  written(html: string): void {
    this.html = html;
    const figures = JSON.stringify(deckFigures(html));
    if (figures === this.figures) return;
    this.figures = figures;
    this.evaluate();
  }

  changed(): void {
    this.evaluate();
  }

  poll(): void {
    if (this.polled || this.stopped) return;
    this.polled = this.look()
      .catch((e) => this.log(`figures: ${(e as Error).message}`))
      .finally(() => (this.polled = null));
  }

  preview(client: string, name: string, source: string, box: Box): Promise<PreviewAnswer> {
    if (this.stopped) return Promise.resolve({ superseded: true });
    if (this.running?.client === client) this.running.controller.abort();
    return new Promise((done) => {
      this.previews.get(client)?.done({ superseded: true });
      this.previews.delete(client);
      this.previews.set(client, { name, source, box, done });
      this.pump();
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.running?.controller.abort();
    for (const preview of this.previews.values()) preview.done({ superseded: true });
    this.previews.clear();
    await this.idle();
  }

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
    if (cached && sig && cached.sig === sig && !this.recent.has(file)) return cached.figure;
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

  private evaluate(): void {
    const watched = new Map<string, string>();
    this.recent = new Set();
    const watch = (path: string) => {
      const s = statOf(path);
      if (s && s.mtimeMs > Date.now() - COARSEST_MTIME_TICK) this.recent.add(path);
      watched.set(path, s ? signature(s) : '');
    };
    watch(join(this.dir, 'preamble.tex'));
    watch(STYLE);
    for (const { name } of deckFigures(this.html)) if (name && /^[\w-]+$/.test(name)) watch(join(this.dir, 'figures', `${name}.js`));
    this.watched = watched;
    const listing = this.listing();
    watched.set(LISTING, listing);
    const states = this.states();
    const names = new Set(states.flatMap((figure) => (figure.state === 'invalid' ? [] : [figure.name!])));
    this.update(() => {
      this.outputs = {};
      this.uncompiled = states.filter((figure) => figure.state === 'stale' || figure.state === 'missing').length;
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
    if (this.recent.size || sigs.some(([path, sig]) => this.watched.get(path) !== sig)) {
      const all = sigs.map(([path, sig]) => `${path}\n${sig}`).join('\n');
      if (this.seen?.sig !== all) this.seen = { sig: all, at: now };
      else if (now - this.seen.at >= this.stable) {
        this.seen = null;
        this.evaluate();
      }
    } else this.seen = null;
  }

  private pump(): void {
    if (this.lane || this.stopped || (!this.previews.size && !this.stale.size)) return;
    this.lane = (async () => {
      while (!this.stopped) {
        const [client, preview] = this.previews.entries().next().value ?? [];
        if (preview) {
          this.previews.delete(client!);
          const out = await this.compileOne(client!, { name: preview.name, source: preview.source, box: preview.box });
          preview.done(out === null ? { superseded: true } : 'errors' in out ? { errors: out.errors } : { figure: out.figure });
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

  private async compileOne(client: string | null, { name, source, box }: { name: string; source: string; box: Box }): Promise<Compiled | null> {
    const controller = new AbortController();
    this.running = { controller, client };
    try {
      const out = await this.compile({ dir: this.dir, name, source, box, tools: this.tools, signal: controller.signal });
      return controller.signal.aborted ? null : out;
    } finally {
      this.running = null;
    }
  }

  private async write(name: string): Promise<void> {
    const listing = this.listing();
    const figure = this.states().find((f) => f.name === name);
    if (!figure || (figure.state !== 'stale' && figure.state !== 'missing')) return;
    const tried = this.tried.get(name);
    if (tried && tried.key === this.key(figure, tried.inputs, listing)) return;
    this.update(() => (this.compiling = name));
    let out: Compiled | null;
    try {
      out = await this.compileOne(null, { name, source: figure.text!, box: figure.box });
    } finally {
      this.update(() => (this.compiling = null));
    }
    if (out === null) return;
    this.compiled[name] = Date.now();
    const inputs = ('errors' in out ? out.inputs : out.figure.inputs) ?? [];
    const used = 'errors' in out ? out.hash : out.figure.hash;
    this.tried.set(name, { key: used ? `${used}\n${listing}` : this.key(figure, inputs, listing), inputs });
    if ('errors' in out) {
      this.errors[name] = out.errors;
      for (const error of out.errors) this.log(`${error.file ?? figure.source}${error.line === null ? '' : `:${error.line}`}: ${error.message}`);
      this.log(`${figure.file}: not compiled${figure.state === 'stale' ? ', the last good output is kept' : ''}`);
      this.evaluate();
      return;
    }
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

function statOf(path: string): Stats | null {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

const listingOf = (dir: string) =>
  readdir(join(dir, 'figures')).then(
    (names) => names.filter((name) => !name.startsWith('.')).sort().join('/'),
    () => '',
  );
