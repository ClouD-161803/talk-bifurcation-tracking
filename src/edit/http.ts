// the requests of the edit command in one shape, whether they come straight from a browser or
// through a relay, and the static files of the talk folder

import { open, realpath, stat } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';

export type Request = {
  method: string;
  // the raw path, with the key, e.g. /<key>/media/a%20b.png
  path: string;
  // the raw query, without the ?
  query: string;
  // with lowercase names
  headers: Record<string, string>;
  body: Buffer;
  // true for a browser that reaches the edit command without the relay
  direct: boolean;
};

// a file answered from start to end, both included, read only when the answer is sent
export type FileBody = { file: string; start: number; end: number };

export type Response = { status: number; headers: Record<string, string>; body?: Buffer | string | FileBody };

export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
};

export const json = (status: number, value: unknown): Response => ({
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(value),
});

export const error = (status: number, message: string): Response => json(status, { error: message });

// the segments of a path below the talk folder, decoded, or null when a segment is malformed,
// starts with a dot, is node_modules, or holds a separator, a colon, or a NUL
export function segmentsOf(rest: string): string[] | null {
  const out: string[] = [];
  for (const raw of rest.split('/')) {
    let s: string;
    try {
      s = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (s === '' || s.startsWith('.') || s.toLowerCase() === 'node_modules' || /[\\/:\0]/.test(s)) return null;
    out.push(s);
  }
  return out;
}

// the real path of a file of the talk folder, or null when it is not a file inside the folder, e.g.
// through a symlink that leaves it
export async function fileInside(root: string, segments: string[]): Promise<string | null> {
  try {
    const real = await realpath(join(root, ...segments));
    if (!real.startsWith(root + sep)) return null;
    return (await stat(real)).isFile() ? real : null;
  } catch {
    return null;
  }
}

// a range of the form bytes=a-b, bytes=a-, or bytes=-n of a file of size bytes. null for a header
// without a single range, and 'bad' for a range outside the file
export function rangeOf(header: string | undefined, size: number): { start: number; end: number } | null | 'bad' {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!m || (!m[1] && !m[2])) return null;
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  return start > end || start >= size ? 'bad' : { start, end };
}

// a static file, answered with a range when one is asked for, and with 304 when the ETag matches
export async function serveFile(file: string, request: Request, maxBytes = Infinity): Promise<Response> {
  const info = await stat(file);
  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const headers: Record<string, string> = {
    'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
    ETag: etag,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
  };
  if (request.headers['if-none-match'] === etag) return { status: 304, headers };
  const range = rangeOf(request.headers.range, info.size);
  if (range === 'bad') return { status: 416, headers: { ...headers, 'Content-Range': `bytes */${info.size}` } };
  if (range) {
    // a range answered through the relay is cut to what a relayed body may hold
    const end = Math.min(range.end, range.start + maxBytes - 1);
    return { status: 206, headers: { ...headers, 'Content-Range': `bytes ${range.start}-${end}/${info.size}` }, body: { file, start: range.start, end } };
  }
  if (info.size > maxBytes) return error(413, 'the file is too large for the relay, ask for a range');
  return { status: 200, headers, body: { file, start: 0, end: info.size - 1 } };
}

// the bytes of a file body, for an answer through the relay
export async function readBody(body: FileBody): Promise<Buffer> {
  const length = Math.max(0, body.end - body.start + 1);
  const buffer = Buffer.alloc(length);
  if (length === 0) return buffer;
  const handle = await open(body.file, 'r');
  try {
    let at = 0;
    while (at < length) {
      const { bytesRead } = await handle.read(buffer, at, length - at, body.start + at);
      if (bytesRead === 0) break;
      at += bytesRead;
    }
    return buffer.subarray(0, at);
  } finally {
    await handle.close();
  }
}

// the raw query with the parameter name set to value, every other parameter kept as written
export function withParam(query: string, name: string, value: string): string {
  const parts = query.split('&').filter((p) => p !== '' && decodeName(p) !== name);
  parts.push(`${name}=${encodeURIComponent(value)}`);
  return parts.join('&');
}

const decodeName = (part: string) => {
  const raw = part.split('=')[0];
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return raw;
  }
};

// the names of the parameters of a raw query
export const paramNames = (query: string) => new Set(query.split('&').filter(Boolean).map(decodeName));
