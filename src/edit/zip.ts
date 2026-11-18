// the talk folder of a session as one zip, for a person who presents the deck from their own
// machine. it holds index.html as the session has it and every other file that the edit command
// serves, apart from the outputs of the exports. node:zlib has crc32 only since Node 20.15, and its
// synchronous deflate would hold up every page, hence each file goes through gzip, which runs in
// the thread pool and ends with the CRC-32 of the file

import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { gzip } from 'node:zlib';
import { decodeAttr, REFERENCE_IN_ATTR, tokenize } from '../editor/tokens.ts';
import { fileInside, segmentsOf, servedSegment } from './http.ts';

// what npm run check, pdf, and pptx write next to index.html, which a deck does not load
const OUTPUTS = new Set(['check', 'slides.pdf', 'slides.pptx']);
// the most entries of a zip without the zip64 extension
export const MOST_FILES = 0xffff;
// the files that deflate does not make smaller, which are stored as they are
const PACKED = /\.(png|jpe?g|gif|webp|avif|mp4|m4v|webm|mov|ogv|woff2?|zip|gz)$/i;
// the launchers of the edit command, which are run by a double click
const LAUNCHER = /\.(command|sh)$/i;
// two made-up addresses of the talk folder. a path that is relative to the deck and stays in the
// talk folder has the same rest below both
const AT = ['http://talk.invalid/t/', 'https://deck.invalid/d/'];
// an attribute data-trajectories with its value
const NAMED = /data-trajectories\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/gi;
// a value that names a .js file as it is written, without a character reference
const SCRIPT = /^[^?#&]*\.js[\0- ]*(?:[?#][^]*)?$/i;
// what a file of trajectories is wrapped in, see register() in src/trajectories.ts
const OPEN = Buffer.from('Beeson.trajectories(');
const CLOSE = Buffer.from(');\n');

// the bytes of a zip in the order of the file, kept apart so that a large file is in memory once
export type Zip = { parts: Buffer[]; size: number };

// a talk folder of more bytes than the limit, or of more files than a zip holds
export class TooLarge extends Error {
  readonly bytes: number;
  readonly files: number;
  constructor(bytes: number, files: number) {
    super('the talk folder is too large for a zip');
    this.bytes = bytes;
    this.files = files;
  }
}

// a file of the zip. run is the mode of a file that is run, wrap is true for a JSON file that is
// wrapped, and content holds the bytes of a file that is not read from the disk
type Source = { name: string; file: string; size: number; mtime: Date; run: boolean; wrap?: true; content?: Buffer };

// index.html of the zip as the session has it, and the text of the tex.js that is written from it,
// or null in a talk folder whose tex.js is not written by the edit command
export type Deck = { html: string; bom: boolean; tex: string | null };

// macOS finds a file under its composed and its decomposed name, and a deck writes the composed one.
// the other systems tell the two apart, hence the zip of a Mac holds the composed name
const nameOf = (name: string) => (process.platform === 'darwin' ? name.normalize('NFC') : name);
// what two names share when a file system takes them for one name. the capitals of the lower case
// are one text also for the letters that a disk of a Mac folds, e.g. ß and SS. the accents are
// written apart before and after, as on this disk, since a capital may bring an accent of its own
// that belongs behind the others, e.g. the iota below a Greek vowel
const same = (name: string) => name.normalize('NFD').toLowerCase().toUpperCase().normalize('NFD');
// the same without the accents, for the name of a file that the zip adds. an exFAT disk of a Mac
// takes two names for one also when an accent is before a Hangul vowel in one and behind it in the other
const loose = (name: string) => same(name).replace(/\p{M}/gu, '');

// the files below dir that the edit command serves, by their names with / below the talk folder,
// without index.html and the outputs. a link to a folder is followed inside the talk folder, and
// not into a folder that it is below
async function walk(root: string, dir: string[], above: string[], out: Source[]): Promise<void> {
  const real = await realpath(join(root, ...dir)).catch(() => null);
  if (real === null || above.includes(real) || (dir.length > 0 && !real.startsWith(root + sep))) return;
  const names = await readdir(real).catch(() => [] as string[]);
  for (const name of names.sort()) {
    if (!servedSegment(name)) continue;
    const lower = name.toLowerCase();
    if (dir.length === 0 && (OUTPUTS.has(lower) || lower === 'index.html')) continue;
    const path = [...dir, name];
    const info = await stat(join(root, ...path)).catch(() => null);
    if (info?.isDirectory()) await walk(root, path, [...above, real], out);
    if (!info?.isFile()) continue;
    const file = await fileInside(root, path);
    if (!file) continue;
    out.push({ name: nameOf(path.join('/')), file, size: info.size, mtime: info.mtime, run: (info.mode & 0o111) !== 0 || LAUNCHER.test(name) });
    if (out.length > MOST_FILES) throw new TooLarge(0, out.length);
  }
}

// the addresses of a path of the deck from bases, or null for a path that is not relative to the
// deck or that leaves the talk folder
function inFolder(value: string, bases: string[]): URL[] | null {
  try {
    const urls = bases.map((base) => new URL(decodeAttr(value), base));
    const rests = urls.map((url, i) => (url.href.startsWith(AT[i]) ? url.href.slice(AT[i].length) : null));
    return rests[0] !== null && rests[0] === rests[1] ? urls : null;
  } catch {
    return null;
  }
}

// a file that data-trajectories names without .js is JSON, which a deck opened from the disk
// cannot read. each one of the talk folder is given wrapped under its name with .js, by the name in
// the zip, and html names this file in its place. the name gets a number when a file or a folder
// of found has it in any case or with other accents, e.g. orbit.json-2.js
async function wrapped(root: string, html: string, found: Source[]): Promise<{ html: string; files: Map<string, string> }> {
  const files = new Map<string, string>();
  // what the name of each wrapped file ends with, by the name of its JSON file
  const suffixes = new Map<string, string>();
  // the tokenizer does not run in the thread pool, hence a deck is read by it only when an
  // attribute may name such a file
  if ([...html.matchAll(NAMED)].every((m) => SCRIPT.test(m[1] ?? m[2] ?? m[3]))) return { html, files };
  const tokens = tokenize(html);
  // the paths of a deck are resolved against the first base element that has an href
  let bases: string[] | null = AT;
  for (const t of tokens) {
    const href = t.type === 'start' && t.name === 'base' ? t.attrs.find((a) => a.name === 'href')?.value : null;
    if (href == null) continue;
    bases = inFolder(href, AT)?.map((url) => url.href) ?? null;
    break;
  }
  if (!bases) return { html, files };
  // the names of the files of the talk folder and of their folders, as loose() gives them
  const taken = new Set<string>();
  for (const { name } of found) for (let end = name.length; end > 0; end = name.lastIndexOf('/', end - 1)) taken.add(loose(name.slice(0, end)));
  const ends: { at: number; suffix: string }[] = [];
  for (const t of tokens) {
    if (t.type !== 'start') continue;
    for (const a of t.attrs) {
      if (a.name !== 'data-trajectories' || a.value === null) continue;
      // without the end that the parser of an address drops
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
      // the path ends at the first ? or # of the raw value, also at one written as a numeric
      // character reference. the # of a reference is not one
      const cut = raw.replace(REFERENCE_IN_ATTR, (m) => (/[?#]/.test(decodeAttr(m)) ? '?' : 'x').padEnd(m.length, 'x')).search(/[?#]/);
      ends.push({ at: a.start + html.slice(a.start, a.end).lastIndexOf(a.value) + (cut < 0 ? raw.length : cut), suffix });
    }
  }
  for (const end of ends.sort((a, b) => b.at - a.at)) html = `${html.slice(0, end.at)}${end.suffix}${html.slice(end.at)}`;
  return { html, files };
}

const gz = (bytes: Buffer, level: number) => new Promise<Buffer>((done, fail) => gzip(bytes, { level }, (e, z) => (e ? fail(e) : done(z))));

// the bytes that a zip keeps are copied into blocks of this size, apart from a part of an eighth of
// a block or more. Node.js cuts a small Buffer from a slab that it shares between Buffers, of 8 kB up
// to Node 22 and of 64 kB in Node 26, where the chunks of zlib are cut from it as well. a zip that
// kept such a Buffer would keep its slab whole, and one Buffer per header and file costs more than
// the bytes of a small file
const BLOCK = 64 * 1024;
// the bytes of a large part that its buffer may hold besides, e.g. the header and the trailer of gzip
const SPARE = 64;

// the zip of the talk folder root below the folder top, with the index.html and the tex.js of deck.
// it rejects with TooLarge when the files hold more than limit bytes. before a file is read, admit
// is called with the most bytes that the zip can have, and the zip is null when admit answers false
export async function zipOf(root: string, top: string, { html, bom, tex }: Deck, limit: number, admit: (most: number) => boolean): Promise<Zip | null> {
  const found: Source[] = [];
  await walk(root, [], [], found);
  const now = new Date();
  let texFile = found.find((f) => f.name === 'tex.js');
  if (!texFile) {
    // on a disk that does not tell the cases apart, a deck loads tex.js also from a file that is
    // named in another case, e.g. Tex.js. the zip holds this file as tex.js, for a disk that tells
    // them apart. it is this file when the disk finds it under the name tex.js
    const other = found.find((f) => same(f.name) === same('tex.js'));
    const [a, b] = other ? await Promise.all([join(root, 'tex.js'), other.file].map((file) => stat(file, { bigint: true }).catch(() => null))) : [];
    if (other && a && b && a.dev === b.dev && a.ino === b.ino) texFile = Object.assign(other, { name: 'tex.js' });
  }
  if (tex !== null) {
    const content = Buffer.from(tex, 'utf8');
    if (texFile) Object.assign(texFile, { content, size: content.length });
    // next to a folder named tex.js, where the edit command cannot write the file either, the zip
    // would not be unzipped
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
  // the size of the talk folder, in which a wrapped file counts once, as the file that it wraps
  const bytes = found.reduce((n, s) => n + s.size, index.length);
  if (bytes > limit || sources.length + 1 > MOST_FILES) throw new TooLarge(bytes, sources.length + 1);
  // an entry has a header of 30 bytes and one of 46 bytes, each with its name, and at most the bytes
  // of its file. the zip ends with a record of 22 bytes
  const head = (name: string) => 76 + 2 * Buffer.byteLength(`${top}/${name}`);
  const most = sources.reduce((n, s) => n + head(s.name) + s.size, head('index.html') + index.length + 22);
  if (!admit(most)) return null;

  const parts: Buffer[] = [];
  let block = Buffer.allocUnsafeSlow(0);
  // the bytes of block that parts holds, and the ones that are written
  let held = 0;
  let filled = 0;
  const flush = () => {
    if (filled > held) parts.push(block.subarray(held, filled));
    held = filled;
  };
  // bytes as the next ones of the zip
  const put = (bytes: Buffer) => {
    if (bytes.length >= BLOCK / 8) {
      flush();
      // a large part is kept as it is when it fills its buffer, and in a buffer of its size otherwise
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
  const add = async (name: string, content: Buffer, mtime: Date, run: boolean) => {
    const z = await gz(content, PACKED.test(name) ? 0 : 6);
    // the raw deflate stream is between the header of 10 bytes, which is without a field when its
    // flags are 0, and the trailer of the CRC-32 and the length
    if (z[3] !== 0) throw new Error('gzip wrote a header with a field');
    const deflated = z.subarray(10, z.length - 8);
    const stored = deflated.length >= content.length;
    const data = stored ? content : deflated;
    const path = Buffer.from(`${top}/${name}`, 'utf8');
    // the year of a zip has 7 bits from 1980, hence a later year is written as 2107
    const year = Math.min(mtime.getFullYear(), 2107);
    const day = year < 1980 ? 0x21 : ((year - 1980) << 9) | ((mtime.getMonth() + 1) << 5) | mtime.getDate();
    const time = year < 1980 ? 0 : (mtime.getHours() << 11) | (mtime.getMinutes() << 5) | (mtime.getSeconds() >> 1);
    // version 2.0, names in UTF-8, and the method: 0 stored, 8 deflated
    const local = Buffer.alloc(30 + path.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(z.readUInt32LE(z.length - 8), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(path.length, 26);
    path.copy(local, 30);
    // the entry of the central directory repeats the header, and it gives the mode of Unix, with
    // which a launcher is still run after the unzip
    const entry = Buffer.alloc(46 + path.length);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE((3 << 8) | 20, 4);
    local.copy(entry, 6, 4, 30);
    entry.writeUInt32LE(((0o100000 | (run ? 0o755 : 0o644)) << 16) >>> 0, 38);
    entry.writeUInt32LE(at, 42);
    path.copy(entry, 46);
    put(local);
    put(data);
    central.push(entry);
    at += local.length + data.length;
  };

  await add('index.html', index, now, false);
  let grown = 0;
  for (const s of sources) {
    // a file that left the folder since it was listed is left out, as it is no longer served
    const read = s.content ?? (await readFile(s.file).catch(() => null));
    if (read === null) continue;
    const content = s.wrap ? Buffer.concat([OPEN, read, CLOSE]) : read;
    // the bytes by which a file grew since it was listed count against the limit as well
    grown += Math.max(0, content.length - s.size);
    if (bytes + grown > limit) throw new TooLarge(bytes + grown, sources.length + 1);
    await add(s.name, content, s.mtime, s.run);
  }
  let directory = 0;
  for (const entry of central) {
    put(entry);
    directory += entry.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(directory, 12);
  end.writeUInt32LE(at, 16);
  put(end);
  flush();
  return { parts, size: at + directory + end.length };
}

// the bytes of zip from start, at most length of them
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
