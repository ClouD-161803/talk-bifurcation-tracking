import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function entries(zip) {
  const end = zip.length - 22;
  if (end < 0 || zip.readUInt32LE(end) !== 0x06054b50) throw new Error('the zip does not end with the end record');
  const count = zip.readUInt16LE(end + 10);
  const size = zip.readUInt32LE(end + 12);
  const start = zip.readUInt32LE(end + 16);
  if (zip.readUInt16LE(end + 8) !== count || start + size !== end) throw new Error('the end record does not match the central directory');
  const out = [];
  let at = start;
  let next = 0;
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error(`entry ${i} of the central directory has no signature`);
    const method = zip.readUInt16LE(at + 10);
    const crc = zip.readUInt32LE(at + 16);
    const packed = zip.readUInt32LE(at + 20);
    const length = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    if (local !== next) throw new Error(`${name} does not follow the entry before it`);
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error(`${name} has no local header`);
    if (!zip.subarray(local + 4, local + 30).equals(zip.subarray(at + 6, at + 32))) throw new Error(`the local header of ${name} differs from the central directory`);
    if (!(zip.readUInt16LE(at + 8) & 0x800)) throw new Error(`the name of ${name} is not marked as UTF-8`);
    const data = zip.subarray(local + 30 + nameLength, local + 30 + nameLength + packed);
    if (!zip.subarray(local + 30, local + 30 + nameLength).equals(zip.subarray(at + 46, at + 46 + nameLength))) throw new Error(`the local name of ${name} differs`);
    const bytes = method === 8 ? inflateRawSync(data) : method === 0 ? Buffer.from(data) : null;
    if (!bytes) throw new Error(`${name} has the method ${method}`);
    if (bytes.length !== length) throw new Error(`${name} has ${bytes.length} bytes, and its entry gives ${length}`);
    if (crc32(bytes) !== crc) throw new Error(`the CRC-32 of ${name} is wrong`);
    const time = zip.readUInt16LE(at + 12);
    const day = zip.readUInt16LE(at + 14);
    const modified = new Date(1980 + (day >> 9), ((day >> 5) & 15) - 1, day & 31, time >> 11, (time >> 5) & 63, (time & 31) * 2);
    out.push({ name, bytes, method, mode: (zip.readUInt32LE(at + 38) >>> 16) & 0o777, madeBy: zip.readUInt16LE(at + 4) >> 8, modified });
    next = local + 30 + nameLength + packed;
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  if (next !== start || at !== end) throw new Error('the central directory does not follow the last entry');
  return out;
}

export function unzipTo(file, zip, dir) {
  mkdirSync(dir, { recursive: true });
  const tools = process.platform === 'win32' ? [['tar', ['-xf', file, '-C', dir]]] : [['unzip', ['-q', file, '-d', dir]]];
  for (const [tool, args] of tools) {
    try {
      execFileSync(tool, args, { stdio: 'pipe' });
      return tool;
    } catch (e) {
      if (e.code !== 'ENOENT') throw new Error(`${tool} did not unzip the file: ${String(e.stderr || e.message)}`);
    }
  }
  for (const entry of entries(zip)) {
    const path = join(dir, ...entry.name.split('/'));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, entry.bytes);
    chmodSync(path, entry.mode);
  }
  return 'entries';
}
