import { open, readdir, readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { decodeAttr, tokenize, type Attr } from '../editor/tokens.ts';
import { systemOf } from '../systems.ts';
import { fileInside, MIME, segmentsOf } from './http.ts';
import { Changed } from './zip.ts';

const AT = 'http://talk.invalid/t/';
const WHAT = 'the single web page was downloaded';
const LOADED: Record<string, string[]> = { script: ['src'], img: ['src'], video: ['src', 'poster'], audio: ['src'], source: ['src'], track: ['src'] };
const LINKED = /^(stylesheet|icon|shortcut|apple-touch-icon|apple-touch-icon-precomposed|mask-icon)$/i;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)/gi;
const MATHJAX = /(^|\/)vendor\/mathjax\/tex-svg\.js$/;
const OPEN = 'Beeson.trajectories(';
const CLOSE = ');\n';
const BLOCK = 3 * 1024 * 1024;

type Found = { name: string; file: string; size: number; time: number };
type Part = { at: number; length: number; bytes: Buffer | null; found: Found | null };

const mimeOf = (name: string) => (MIME[extname(name).toLowerCase()] ?? 'application/octet-stream').replace(/;.*/, '');
const base64Length = (size: number) => 4 * Math.ceil(size / 3);
const ONE_MAX = 384 * 1024 * 1024;
const LARGE = ' (over 384 MB)';

async function readAt(found: Found, from: number, to: number): Promise<Buffer> {
  const out = Buffer.allocUnsafe(to - from);
  const handle = await open(found.file, 'r').catch(() => null);
  if (!handle) throw new Changed(found.name, WHAT);
  try {
    const info = await stat(found.file).catch(() => null);
    if (!info || info.size !== found.size || info.mtime.getTime() !== found.time) throw new Changed(found.name, WHAT);
    for (let at = from; at < to; ) {
      const { bytesRead } = await handle.read(out, at - from, to - at, at);
      if (bytesRead === 0) throw new Changed(found.name, WHAT);
      at += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return out;
}

export class Single {
  readonly size: number;
  readonly held: number;
  private parts: Part[];

  constructor(parts: Part[], size: number, held: number) {
    this.parts = parts;
    this.size = size;
    this.held = held;
  }

  async piece(start: number, length: number): Promise<Buffer> {
    const end = Math.min(this.size, start + length);
    const out: Buffer[] = [];
    let low = 0;
    let high = this.parts.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.parts[mid].at + this.parts[mid].length <= start) low = mid + 1;
      else high = mid;
    }
    for (let i = low; i < this.parts.length && this.parts[i].at < end; i++) {
      const p = this.parts[i];
      const a = Math.max(start, p.at) - p.at;
      const b = Math.min(end, p.at + p.length) - p.at;
      if (p.bytes) {
        out.push(p.bytes.subarray(a, b));
        continue;
      }
      const found = p.found!;
      const first = Math.floor(a / 4);
      const bytes = await readAt(found, first * 3, Math.min(found.size, Math.ceil(b / 4) * 3));
      out.push(Buffer.from(bytes.toString('base64'), 'latin1').subarray(a - first * 4, b - first * 4));
    }
    return Buffer.concat(out);
  }
}

export type Built = { single: Single; missing: string[] };

export async function singleOf(root: string, html: string, tex: string | null, limit: number): Promise<Built> {
  const tokens = tokenize(html);
  const missing: string[] = [];
  const edits: { start: number; end: number; parts: (string | Buffer | Found)[] }[] = [];
  const files = new Map<string, string | Buffer | Found>();
  let total = 0;

  const locate = async (value: string, from = ''): Promise<{ name: string; file: string } | null | undefined> => {
    let url: URL;
    try {
      url = new URL(decodeAttr(value).trim(), AT + from);
    } catch {
      return undefined;
    }
    if (!url.href.startsWith(AT)) return undefined;
    const segments = segmentsOf(url.pathname.slice(new URL(AT).pathname.length));
    if (!segments) return null;
    const file = await fileInside(root, segments);
    return file ? { name: segments.join('/'), file } : null;
  };
  const foundOf = async (name: string, file: string): Promise<Found | null | false> => {
    const info = await stat(file).catch(() => null);
    if (!info) return null;
    if (info.size > ONE_MAX) return false;
    total += base64Length(info.size);
    return { name, file, size: info.size, time: info.mtime.getTime() };
  };
  const text = (bytes: Buffer): Buffer => {
    total += base64Length(bytes.length);
    return bytes;
  };
  const styleOf = async (name: string, file: string): Promise<Buffer | null> => {
    const css = await readFile(file, 'utf8').catch(() => null);
    if (css === null) return null;
    const dir = name.includes('/') ? name.slice(0, name.lastIndexOf('/') + 1) : '';
    const urls = new Map<string, string>();
    for (const m of css.matchAll(CSS_URL)) {
      const value = m[1] ?? m[2] ?? m[3];
      if (urls.has(value)) continue;
      const at = await locate(value, dir);
      if (at === undefined) continue;
      const bytes = at && (await readFile(at.file).catch(() => null));
      if (!at || !bytes) missing.push(`${name}: ${value}`);
      else urls.set(value, `url("data:${mimeOf(at.name)};base64,${bytes.toString('base64')}")`);
    }
    return Buffer.from(css.replace(CSS_URL, (m, a, b, c) => urls.get(a ?? b ?? c) ?? m), 'utf8');
  };
  const dataOf = async (tag: string, value: string, style: boolean): Promise<(string | Buffer | Found)[] | null> => {
    const at = await locate(value);
    if (at === undefined) return null;
    if (at && at.name === 'tex.js' && tex !== null) return ['data:text/javascript;base64,', text(Buffer.from(tex, 'utf8'))];
    if (at && style) {
      const css = await styleOf(at.name, at.file);
      if (css) return ['data:text/css;base64,', text(css)];
    }
    const found = at && (await foundOf(at.name, at.file));
    if (!found) {
      missing.push(`${tag} ${decodeAttr(value)}${found === false ? LARGE : ''}`);
      return null;
    }
    return [`data:${mimeOf(found.name)};base64,`, found];
  };
  const keep = async (key: string, file: string, wrap = false) => {
    if (files.has(key)) return;
    if (wrap) {
      const info = await stat(file).catch(() => null);
      if (info && info.size + OPEN.length + CLOSE.length > ONE_MAX) missing.push(`${key}${LARGE}`);
      const content = info && info.size + OPEN.length + CLOSE.length <= ONE_MAX && (await readFile(file).catch(() => null));
      if (content) files.set(key, text(Buffer.concat([Buffer.from(OPEN), content, Buffer.from(CLOSE)])));
      return;
    }
    const found = await foundOf(key, file);
    if (found) files.set(key, found);
    else if (found === false) missing.push(`${key}${LARGE}`);
  };
  const attr = (attrs: Attr[], name: string) => attrs.find((a) => a.name === name)?.value ?? null;

  let head = -1;
  for (const t of tokens) {
    if (t.type !== 'start') continue;
    if (head < 0 && t.name !== 'html') head = t.name === 'head' ? t.end : t.start;
    const names = t.name === 'link' && LINKED.test((attr(t.attrs, 'rel') ?? '').trim().split(/\s+/)[0] ?? '') ? ['href'] : (LOADED[t.name] ?? []);
    const style = t.name === 'link' && /(^|\s)stylesheet(\s|$)/i.test(attr(t.attrs, 'rel') ?? '');
    for (const a of t.attrs) {
      if (a.value === null) continue;
      const value = decodeAttr(a.value);
      if (names.includes(a.name) && value.trim() !== '') {
        const parts = await dataOf(t.name, a.value, style);
        if (parts) edits.push({ start: a.start, end: a.end, parts: [`${a.name}="`, ...parts, '"'] });
        if (t.name === 'script' && a.name === 'src') {
          const at = await locate(a.value);
          if (at && MATHJAX.test(at.name)) {
            const dir = at.name.slice(0, at.name.lastIndexOf('/'));
            for (const name of await walk(join(root, ...dir.split('/')))) if (`${dir}/${name}` !== at.name) await keep(`${dir}/${name}`, join(root, ...dir.split('/'), ...name.split('/')));
          }
        }
      }
      if (a.name === 'data-trajectories') {
        const at = await locate(a.value.replace(/[?#].*$/, ''));
        if (at) await keep(at.name, at.file, !/\.js$/i.test(at.name));
        else if (at === null) missing.push(`backdrop ${value}`);
      }
      if (a.name === 'data-figure' && /^[\w-]+$/.test(value) && /(^|\s)tikz(\s|$)/.test(attr(t.attrs, 'class') ?? '')) {
        const at = await locate(`figures/${value}.js`);
        if (at) await keep(at.name, at.file);
        else missing.push(`TikZ figure ${value}`);
      }
      if (a.name === 'data-backdrop' && attr(t.attrs, 'data-trajectories') === null && (value === 'poincare' || value === 'tori' || value === 'saddle')) {
        const name = `theme/backdrops/${value === 'poincare' ? `poincare-${systemOf(attr(t.attrs, 'data-system'))}` : value}.js`;
        const at = await locate(name);
        if (at) await keep(at.name, at.file);
        else missing.push(`backdrop ${name}`);
      }
    }
  }

  const boot: (string | Buffer | Found)[] = ['<script>window.beesonFiles = {'];
  for (const [key, content] of files) boot.push(`${JSON.stringify(key)}: "data:text/javascript;base64,`, content, '",');
  boot.push('};</script>');
  edits.push({ start: Math.max(0, head), end: Math.max(0, head), parts: boot });
  edits.sort((a, b) => a.start - b.start);

  const parts: Part[] = [];
  let size = 0;
  let pending: Buffer[] = [];
  let pendingLength = 0;
  const flush = () => {
    if (!pendingLength) return;
    const bytes = Buffer.concat(pending, pendingLength);
    parts.push({ at: size, length: bytes.length, bytes, found: null });
    size += bytes.length;
    pending = [];
    pendingLength = 0;
  };
  const push = (bytes: Buffer) => {
    pending.push(bytes);
    pendingLength += bytes.length;
    if (pendingLength >= BLOCK) flush();
  };
  const emit = (part: string | Buffer | Found) => {
    if (typeof part === 'string') push(Buffer.from(part, 'utf8'));
    else if (Buffer.isBuffer(part)) push(Buffer.from(part.toString('base64'), 'latin1'));
    else {
      flush();
      parts.push({ at: size, length: base64Length(part.size), bytes: null, found: part });
      size += base64Length(part.size);
    }
  };
  if (total + html.length > limit) throw new SingleTooLarge(total + html.length);
  let at = 0;
  for (const e of edits) {
    push(Buffer.from(html.slice(at, e.start), 'utf8'));
    for (const part of e.parts) emit(part);
    at = e.end;
  }
  push(Buffer.from(html.slice(at), 'utf8'));
  flush();
  return { single: new Single(parts, size, parts.reduce((n, p) => n + (p.bytes?.length ?? 0), 0)), missing };
}

export class SingleTooLarge extends Error {
  readonly bytes: number;
  constructor(bytes: number) {
    super('the single web page is too large');
    this.bytes = bytes;
  }
}

async function walk(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory()) out.push(...(await walk(join(dir, entry.name), `${prefix}${entry.name}/`)));
    else if (entry.isFile() && /\.js$/i.test(entry.name)) out.push(`${prefix}${entry.name}`);
  }
  return out.sort();
}
