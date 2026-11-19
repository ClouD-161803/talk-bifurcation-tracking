import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { gzip } from 'node:zlib';
import { decodeAttr, REFERENCE_IN_ATTR, tokenize } from '../editor/tokens.ts';
import { fileInside, hiddenSegment, segmentsOf, servedSegment } from './http.ts';

const OUTPUTS = new Set(['check', 'slides.pdf', 'slides.pptx']);
export const MOST_FILES = 0xffff;
const PACKED = /\.(png|jpe?g|gif|webp|avif|mp4|m4v|webm|mov|ogv|woff2?|zip|gz)$/i;
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

export type Zip = { parts: Buffer[]; size: number };

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
  const head = (name: string) => LOCAL_HEADER + CENTRAL_HEADER + 2 * Buffer.byteLength(`${top}/${name}`);
  const most = sources.reduce((n, s) => n + head(s.name) + s.size, head('index.html') + index.length + END_RECORD);
  if (!admit(most)) return null;

  const parts: Buffer[] = [];
  let block = Buffer.allocUnsafeSlow(0);
  let held = 0;
  let filled = 0;
  const flush = () => {
    if (filled > held) parts.push(block.subarray(held, filled));
    held = filled;
  };
  const put = (bytes: Buffer) => {
    if (bytes.length >= BLOCK / 8) {
      flush();
      if (bytes.buffer.byteLength - bytes.length <= SPARE) parts.push(bytes);
      else {
        const copy = Buffer.allocUnsafeSlow(bytes.length);
        bytes.copy(copy);
        parts.push(copy);
      }
      return;
    }
    if (filled + bytes.length > block.length) {
      flush();
      block = Buffer.allocUnsafeSlow(BLOCK);
      held = filled = 0;
    }
    filled += bytes.copy(block, filled);
  };
  const central: Buffer[] = [];
  let at = 0;
  const add = (name: string, content: Buffer, z: Buffer, mtime: Date, run: boolean) => {
    if (z[3] !== 0) throw new Error('gzip wrote a header with a field');
    const deflated = z.subarray(GZIP_HEADER, z.length - GZIP_TRAILER);
    const stored = deflated.length >= content.length;
    const data = stored ? content : deflated;
    const path = Buffer.from(`${top}/${name}`, 'utf8');
    const year = Math.min(mtime.getFullYear(), ZIP_LAST_YEAR);
    const day = year < ZIP_FIRST_YEAR ? 0x21 : ((year - ZIP_FIRST_YEAR) << 9) | ((mtime.getMonth() + 1) << 5) | mtime.getDate();
    const time = year < ZIP_FIRST_YEAR ? 0 : (mtime.getHours() << 11) | (mtime.getMinutes() << 5) | (mtime.getSeconds() >> 1);
    const local = Buffer.alloc(LOCAL_HEADER + path.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(ZIP_VERSION, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(stored ? STORED : DEFLATED, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(z.readUInt32LE(z.length - GZIP_TRAILER), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(path.length, 26);
    path.copy(local, LOCAL_HEADER);
    const entry = Buffer.alloc(CENTRAL_HEADER + path.length);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(MADE_ON_UNIX | ZIP_VERSION, 4);
    local.copy(entry, 6, 4, LOCAL_HEADER);
    entry.writeUInt32LE(((0o100000 | (run ? 0o755 : 0o644)) << 16) >>> 0, 38);
    entry.writeUInt32LE(at, 42);
    path.copy(entry, CENTRAL_HEADER);
    put(local);
    put(data);
    central.push(entry);
    at += local.length + data.length;
  };

  add('index.html', index, await gz(index, 6), now, false);
  const ready: Promise<{ content: Buffer; z: Buffer } | null>[] = [];
  const prepare = async (s: Source) => {
    const read = s.content ?? (await readFile(s.file).catch(() => null));
    if (read === null) return null;
    const content = s.wrap ? Buffer.concat([OPEN, read, CLOSE]) : read;
    return { content, z: await gz(content, PACKED.test(s.name) ? 0 : 6) };
  };
  let grown = 0;
  let next = 0;
  let ahead = 0;
  for (const [i, s] of sources.entries()) {
    while (next < sources.length && (next === i || (next < i + AHEAD_FILES && ahead + sources[next].size <= AHEAD_BYTES))) {
      ahead += sources[next].size;
      ready[next] = prepare(sources[next++]);
      ready[next - 1].catch(() => {});
    }
    const made = await ready[i];
    delete ready[i];
    ahead -= s.size;
    if (made === null) continue;
    grown += Math.max(0, made.content.length - s.size);
    if (bytes + grown > limit) throw new TooLarge(bytes + grown, sources.length + 1);
    add(s.name, made.content, made.z, s.mtime, s.run);
  }
  let directory = 0;
  for (const entry of central) {
    put(entry);
    directory += entry.length;
  }
  const end = Buffer.alloc(END_RECORD);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(directory, 12);
  end.writeUInt32LE(at, 16);
  put(end);
  flush();
  return { parts, size: at + directory + end.length };
}

export function piece(zip: Zip, start: number, length: number): Buffer {
  const end = Math.min(zip.size, start + length);
  const out: Buffer[] = [];
  let at = 0;
  for (const part of zip.parts) {
    if (at >= end) break;
    const next = at + part.length;
    if (next > start) out.push(part.subarray(Math.max(0, start - at), Math.min(part.length, end - at)));
    at = next;
  }
  return Buffer.concat(out);
}
