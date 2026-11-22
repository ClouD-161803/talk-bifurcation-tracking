import { createReadStream } from 'node:fs';
import { lstat, open, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip, gzip } from 'node:zlib';
import { decodeAttr, REFERENCE_IN_ATTR, tokenize } from '../editor/tokens.ts';
import { fileInside, hiddenSegment, segmentsOf, servedSegment } from './http.ts';

const OUTPUTS = new Set(['check', 'slides.pdf', 'slides.pptx']);
export const MOST_FILES = 0xffff;
const PACKED = /\.(png|jpe?g|gif|webp|avif|mp4|m4v|webm|mov|ogv|woff2?|zip|gz|pdf)$/i;
const LAUNCHER = /\.(command|sh)$/i;
const AT = ['http://talk.invalid/t/', 'https://deck.invalid/d/'];
const NAMED = /data-trajectories\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/gi;
const SCRIPT = /^[^?#&]*\.js[\0- ]*(?:[?#][^]*)?$/i;
const OPEN = Buffer.from('Beeson.trajectories(');
const CLOSE = Buffer.from(');\n');
const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const END_RECORD = 22;
const GZIP_HEADER = 10;
const GZIP_TRAILER = 8;
const ZIP_FIRST_YEAR = 1980;
const ZIP_LAST_YEAR = 2107;
const ZIP_VERSION = 20;
const MADE_ON_UNIX = 3 << 8;
const UTF8_NAMES = 0x800;
const STORED = 0;
const DEFLATED = 8;

export class Changed extends Error {
  constructor(name: string) {
    super(`The file ${name} changed while the talk folder was downloaded. Try again.`);
  }
}

export class TooLarge extends Error {
  readonly bytes: number;
  readonly files: number;
  constructor(bytes: number, files: number) {
    super('the talk folder is too large for a zip');
    this.bytes = bytes;
    this.files = files;
  }
}

type Source = { name: string; file: string; size: number; mtime: Date; run: boolean; wrap?: true; content?: Buffer };

export type Deck = { html: string; bom: boolean; tex: string | null };

const nameOf = (name: string) => (process.platform === 'darwin' ? name.normalize('NFC') : name);
const same = (name: string) => name.normalize('NFD').toLowerCase().toUpperCase().normalize('NFD');
const loose = (name: string) => same(name).replace(/\p{M}/gu, '');

async function walk(root: string, dir: string[], above: string[], out: Source[]): Promise<void> {
  const real = await realpath(join(root, ...dir)).catch(() => null);
  if (real === null || above.includes(real) || (dir.length > 0 && !real.startsWith(root + sep))) return;
  const shown = !relative(root, real).split(sep).some(hiddenSegment);
  const names = (await readdir(real).catch(() => [] as string[])).sort().filter((name) => servedSegment(name) && !(dir.length === 0 && (OUTPUTS.has(name.toLowerCase()) || name.toLowerCase() === 'index.html')));
  const links = await Promise.all(names.map((name) => lstat(join(real, name)).catch(() => null)));
  for (const [i, name] of names.entries()) {
    const path = [...dir, name];
    const link = links[i];
    const direct = shown && link !== null && !link.isSymbolicLink();
    const info = direct ? link : await stat(join(root, ...path)).catch(() => null);
    if (info?.isDirectory()) await walk(root, path, [...above, real], out);
    if (!info?.isFile()) continue;
    const file = direct ? join(real, name) : await fileInside(root, path);
    if (!file) continue;
    out.push({ name: nameOf(path.join('/')), file, size: info.size, mtime: info.mtime, run: (info.mode & 0o111) !== 0 || LAUNCHER.test(name) });
    if (out.length > MOST_FILES) throw new TooLarge(0, out.length);
  }
}

function inFolder(value: string, bases: string[]): URL[] | null {
  try {
    const urls = bases.map((base) => new URL(decodeAttr(value), base));
    const rests = urls.map((url, i) => (url.href.startsWith(AT[i]) ? url.href.slice(AT[i].length) : null));
    return rests[0] !== null && rests[0] === rests[1] ? urls : null;
  } catch {
    return null;
  }
}

async function wrapped(root: string, html: string, found: Source[]): Promise<{ html: string; files: Map<string, string> }> {
  const files = new Map<string, string>();
  const suffixes = new Map<string, string>();
  if ([...html.matchAll(NAMED)].every((m) => SCRIPT.test(m[1] ?? m[2] ?? m[3]))) return { html, files };
  const tokens = tokenize(html);
  let bases: string[] | null = AT;
  for (const t of tokens) {
    const href = t.type === 'start' && t.name === 'base' ? t.attrs.find((a) => a.name === 'href')?.value : null;
    if (href == null) continue;
    bases = inFolder(href, AT)?.map((url) => url.href) ?? null;
    break;
  }
  if (!bases) return { html, files };
  const taken = new Set<string>();
  for (const { name } of found) for (let end = name.length; end > 0; end = name.lastIndexOf('/', end - 1)) taken.add(loose(name.slice(0, end)));
  const ends: { at: number; suffix: string }[] = [];
  for (const t of tokens) {
    if (t.type !== 'start') continue;
    for (const a of t.attrs) {
      if (a.name !== 'data-trajectories' || a.value === null) continue;
      const raw = a.value.replace(/[\0- ]+$/, '');
      const url = inFolder(raw, bases)?.[0];
      if (!url || /\.js$/i.test(url.pathname)) continue;
      const segments = segmentsOf(url.pathname.slice('/t/'.length));
      const file = segments && (await fileInside(root, segments));
      if (!segments || !file) continue;
      const name = segments.join('/');
      let suffix = suffixes.get(name);
      if (suffix === undefined) {
        suffix = '.js';
        for (let n = 2; taken.has(loose(name + suffix)); n++) suffix = `-${n}.js`;
        suffixes.set(name, suffix);
        taken.add(loose(name + suffix));
        files.set(name + suffix, file);
      }
      const cut = raw.replace(REFERENCE_IN_ATTR, (m) => (/[?#]/.test(decodeAttr(m)) ? '?' : 'x').padEnd(m.length, 'x')).search(/[?#]/);
      ends.push({ at: a.start + html.slice(a.start, a.end).lastIndexOf(a.value) + (cut < 0 ? raw.length : cut), suffix });
    }
  }
  for (const end of ends.sort((a, b) => b.at - a.at)) html = `${html.slice(0, end.at)}${end.suffix}${html.slice(end.at)}`;
  return { html, files };
}

const gz = (bytes: Buffer, level: number) => new Promise<Buffer>((done, fail) => gzip(bytes, { level }, (e, z) => (e ? fail(e) : done(z))));

const BLOCK = 64 * 1024;
const SPARE = 64;
const AHEAD_FILES = 16;
const AHEAD_BYTES = 8 * 1024 * 1024;
const DEFLATED_MOST = 16 * 1024 * 1024;
const ZIP_MOST = 0xffffffff;

type Entry = {
  name: string;
  path: Buffer;
  method: number;
  time: number;
  day: number;
  run: boolean;
  size: number;
  packed: number;
  crc: number | null;
  summing?: Promise<number>;
  data: Buffer | null;
  source: Source | null;
  at: number;
};

const wrapping = (s: Source) => (s.wrap ? OPEN.length + CLOSE.length : 0);

async function readRange(entry: Entry, from: number, to: number): Promise<Buffer> {
  const s = entry.source!;
  const out = Buffer.allocUnsafe(to - from);
  const fileBytes = entry.size - wrapping(s);
  const head = s.wrap ? OPEN.length : 0;
  const parts: [Buffer, number, number][] = s.wrap ? [[OPEN, 0, head], [CLOSE, head + fileBytes, entry.size]] : [];
  for (const [bytes, start, end] of parts) if (from < end && to > start) bytes.copy(out, Math.max(0, start - from), Math.max(0, from - start), Math.min(end, to) - start);
  const a = Math.max(from, head);
  const b = Math.min(to, head + fileBytes);
  if (a >= b) return out;
  const handle = await open(s.file, 'r').catch(() => null);
  if (!handle) throw new Changed(entry.name);
  try {
    const info = await stat(s.file).catch(() => null);
    if (!info || info.size !== fileBytes || info.mtime.getTime() !== s.mtime.getTime()) throw new Changed(entry.name);
    for (let at = a; at < b; ) {
      const { bytesRead } = await handle.read(out, at - from, b - at, at - head);
      if (bytesRead === 0) throw new Changed(entry.name);
      at += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return out;
}

async function sumOf(entry: Entry): Promise<number> {
  const s = entry.source!;
  let read = 0;
  let tail: Buffer = Buffer.alloc(0);
  const counted = async function* (input: AsyncIterable<Buffer>) {
    if (s.wrap) yield OPEN;
    for await (const chunk of input) {
      read += chunk.length;
      yield chunk;
    }
    if (s.wrap) yield CLOSE;
  };
  const last = async (output: AsyncIterable<Buffer>) => {
    for await (const chunk of output) tail = chunk.length >= GZIP_TRAILER ? chunk.subarray(-GZIP_TRAILER) : Buffer.concat([tail, chunk]).subarray(-GZIP_TRAILER);
  };
  try {
    await pipeline(createReadStream(s.file), counted, createGzip({ level: 0 }), last);
  } catch {
    throw new Changed(entry.name);
  }
  if (read !== entry.size - wrapping(s)) throw new Changed(entry.name);
  return tail.readUInt32LE(0);
}

function crcOf(entry: Entry): Promise<number> | number {
  if (entry.crc !== null) return entry.crc;
  entry.summing ??= sumOf(entry).then(
    (crc) => (entry.crc = crc),
    (e) => {
      delete entry.summing;
      throw e;
    },
  );
  return entry.summing;
}

function localHeader(entry: Entry, crc: number): Buffer {
  const local = Buffer.alloc(LOCAL_HEADER + entry.path.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(ZIP_VERSION, 4);
  local.writeUInt16LE(UTF8_NAMES, 6);
  local.writeUInt16LE(entry.method, 8);
  local.writeUInt16LE(entry.time, 10);
  local.writeUInt16LE(entry.day, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(entry.packed, 18);
  local.writeUInt32LE(entry.size, 22);
  local.writeUInt16LE(entry.path.length, 26);
  entry.path.copy(local, LOCAL_HEADER);
  return local;
}

export class Zip {
  readonly size: number;
  readonly held: number;
  private entries: Entry[];
  private directoryAt: number;
  private directory: Promise<Buffer> | null = null;

  constructor(entries: Entry[], directoryAt: number, size: number, held: number) {
    this.entries = entries;
    this.directoryAt = directoryAt;
    this.size = size;
    this.held = held;
  }

  private async directoryBytes(): Promise<Buffer> {
    const out: Buffer[] = [];
    for (const entry of this.entries) {
      const local = localHeader(entry, await crcOf(entry));
      const central = Buffer.alloc(CENTRAL_HEADER + entry.path.length);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(MADE_ON_UNIX | ZIP_VERSION, 4);
      local.copy(central, 6, 4, LOCAL_HEADER);
      central.writeUInt32LE(((0o100000 | (entry.run ? 0o755 : 0o644)) << 16) >>> 0, 38);
      central.writeUInt32LE(entry.at, 42);
      entry.path.copy(central, CENTRAL_HEADER);
      out.push(central);
    }
    const end = Buffer.alloc(END_RECORD);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(this.size - END_RECORD - this.directoryAt, 12);
    end.writeUInt32LE(this.directoryAt, 16);
    out.push(end);
    return Buffer.concat(out);
  }

  async piece(start: number, length: number): Promise<Buffer> {
    const end = Math.min(this.size, start + length);
    const out: Buffer[] = [];
    const take = (bytes: Buffer, at: number) => {
      const a = Math.max(start, at);
      const b = Math.min(end, at + bytes.length);
      if (a < b) out.push(bytes.subarray(a - at, b - at));
    };
    let low = 0;
    let high = this.entries.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      const e = this.entries[mid];
      if (e.at + LOCAL_HEADER + e.path.length + e.packed <= start) low = mid + 1;
      else high = mid;
    }
    for (let i = low; i < this.entries.length && this.entries[i].at < end; i++) {
      const e = this.entries[i];
      const dataAt = e.at + LOCAL_HEADER + e.path.length;
      if (start < dataAt) take(localHeader(e, await crcOf(e)), e.at);
      const a = Math.max(start, dataAt);
      const b = Math.min(end, dataAt + e.packed);
      if (a < b) out.push(e.data ? e.data.subarray(a - dataAt, b - dataAt) : await readRange(e, a - dataAt, b - dataAt));
    }
    if (end > this.directoryAt) take(await (this.directory ??= this.directoryBytes().catch((e) => ((this.directory = null), Promise.reject(e)))), this.directoryAt);
    return Buffer.concat(out);
  }
}

export async function zipOf(root: string, top: string, { html, bom, tex }: Deck, limit: number, admit: (most: number) => boolean): Promise<Zip | null> {
  const found: Source[] = [];
  await walk(root, [], [], found);
  const now = new Date();
  let texFile = found.find((f) => f.name === 'tex.js');
  if (!texFile) {
    const other = found.find((f) => same(f.name) === same('tex.js'));
    const [a, b] = other ? await Promise.all([join(root, 'tex.js'), other.file].map((file) => stat(file, { bigint: true }).catch(() => null))) : [];
    if (other && a && b && a.dev === b.dev && a.ino === b.ino) texFile = Object.assign(other, { name: 'tex.js' });
  }
  if (tex !== null) {
    const content = Buffer.from(tex, 'utf8');
    if (texFile) Object.assign(texFile, { content, size: content.length });
    else if (!found.some((f) => same(f.name).startsWith(same('tex.js/')))) found.push({ name: 'tex.js', file: '', size: content.length, mtime: now, run: false, content });
  }
  const made = await wrapped(root, html, found);
  const index = Buffer.from(bom ? `﻿${made.html}` : made.html, 'utf8');
  const wraps: Source[] = [];
  for (const [name, file] of made.files) {
    const info = await stat(file).catch(() => null);
    if (info) wraps.push({ name, file, size: info.size + OPEN.length + CLOSE.length, mtime: info.mtime, run: false, wrap: true });
  }
  const sources = [...found, ...wraps].sort((a, b) => (a.name < b.name ? -1 : 1));
  const bytes = found.reduce((n, s) => n + s.size, index.length);
  if (bytes > limit || sources.length + 1 > MOST_FILES) throw new TooLarge(bytes, sources.length + 1);
  const deflated = (s: Source) => !!s.content || (!PACKED.test(s.name) && s.size <= DEFLATED_MOST);
  const most = sources.reduce((n, s) => n + (deflated(s) ? s.size : 0), index.length);
  if (!admit(most)) return null;

  let block = Buffer.allocUnsafeSlow(0);
  let filled = 0;
  let held = 0;
  const keep = (bytes: Buffer): Buffer => {
    held += bytes.length;
    if (bytes.length >= BLOCK / 8) {
      if (bytes.buffer.byteLength - bytes.length <= SPARE) return bytes;
      const copy = Buffer.allocUnsafeSlow(bytes.length);
      bytes.copy(copy);
      return copy;
    }
    if (filled + bytes.length > block.length) {
      block = Buffer.allocUnsafeSlow(BLOCK);
      filled = 0;
    }
    const at = filled;
    filled += bytes.copy(block, filled);
    return block.subarray(at, filled);
  };
  const entries: Entry[] = [];
  const add = (name: string, mtime: Date, run: boolean, size: number, packed: { data: Buffer | null; crc: number | null; method: number; length: number }, source: Source | null) => {
    const year = Math.min(mtime.getFullYear(), ZIP_LAST_YEAR);
    entries.push({
      name,
      path: keep(Buffer.from(`${top}/${name}`, 'utf8')),
      method: packed.method,
      day: year < ZIP_FIRST_YEAR ? 0x21 : ((year - ZIP_FIRST_YEAR) << 9) | ((mtime.getMonth() + 1) << 5) | mtime.getDate(),
      time: year < ZIP_FIRST_YEAR ? 0 : (mtime.getHours() << 11) | (mtime.getMinutes() << 5) | (mtime.getSeconds() >> 1),
      run,
      size,
      packed: packed.length,
      crc: packed.crc,
      data: packed.data,
      source,
      at: 0,
    });
  };
  const squeezed = (content: Buffer, z: Buffer, lazy: boolean) => {
    if (z[3] !== 0) throw new Error('gzip wrote a header with a field');
    const deflate = z.subarray(GZIP_HEADER, z.length - GZIP_TRAILER);
    const crc = z.readUInt32LE(z.length - GZIP_TRAILER);
    if (deflate.length < content.length) return { data: keep(deflate), crc, method: DEFLATED, length: deflate.length };
    return { data: lazy ? null : keep(content), crc, method: STORED, length: content.length };
  };

  add('index.html', now, false, index.length, squeezed(index, await gz(index, 6), false), null);
  const ready: Promise<{ content: Buffer; z: Buffer } | null>[] = [];
  const prepare = async (s: Source) => {
    const read = s.content ?? (await readFile(s.file).catch(() => null));
    if (read === null) return null;
    const content = s.wrap ? Buffer.concat([OPEN, read, CLOSE]) : read;
    return { content, z: await gz(content, 6) };
  };
  let grown = 0;
  let next = 0;
  let ahead = 0;
  for (const [i, s] of sources.entries()) {
    if (!deflated(s)) {
      add(s.name, s.mtime, s.run, s.size, { data: null, crc: null, method: STORED, length: s.size }, s);
      continue;
    }
    while (next < sources.length && (next <= i || (next < i + AHEAD_FILES && ahead + (deflated(sources[next]) ? sources[next].size : 0) <= AHEAD_BYTES))) {
      if (deflated(sources[next])) {
        ahead += sources[next].size;
        ready[next] = prepare(sources[next]);
        ready[next].catch(() => {});
      }
      next++;
    }
    const prepared = await ready[i];
    delete ready[i];
    ahead -= s.size;
    if (prepared === null) continue;
    grown += Math.max(0, prepared.content.length - s.size);
    if (bytes + grown > limit) throw new TooLarge(bytes + grown, sources.length + 1);
    const lazy = !s.content;
    add(s.name, s.mtime, s.run, prepared.content.length, squeezed(prepared.content, prepared.z, lazy), lazy ? s : null);
  }
  let at = 0;
  let directory = 0;
  for (const e of entries) {
    e.at = at;
    at += LOCAL_HEADER + e.path.length + e.packed;
    directory += CENTRAL_HEADER + e.path.length;
  }
  const size = at + directory + END_RECORD;
  if (size > ZIP_MOST) throw new TooLarge(bytes + grown, sources.length + 1);
  return new Zip(entries, at, size, held);
}
