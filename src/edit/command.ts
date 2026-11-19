// the edit command: it serves the talk folder to the browsers of a session at
// http://127.0.0.1:<port>/<key>/, keeps the authority of the session, and writes every edit into
// index.html. a request through a relay is handled by the same code as a direct one, with host
// false and without the check of the Host header, since the relay already matched the key

import { createReadStream, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdir, readdir, readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { readPreamble } from '../preamble.ts';
import { Authority } from '../session/authority.ts';
import { FULL, isToken, type HelloRequest, type NameRequest, type OpPost, type OpRequest } from '../session/protocol.ts';
import { AppliedTable, readApplied } from './applied.ts';
import { Comments, isCommentId, isFailure, type CommentsOptions, type Failure } from './comments.ts';
import { Disk, readText, renameRetried, renameRetriedSync } from './disk.ts';
import { History, type HistoryOptions } from './history.ts';
import { error, fileInside, json, paramNames, segmentsOf, servedSegment, serveFile, withParam, type Request, type Response } from './http.ts';
import { MAX_STATE, People } from './people.ts';
import { ADDRESS_RULE, loadConfig, RELAY_ANSWER, RELAY_BODY, relayAddress, RelayLink, saveConfig, Taken } from './relay.ts';
import { deriveTex, TexWriter } from './tex.ts';
import { FigureWatcher, type Box } from './figures.ts';
import { MOST_FILES, piece, TooLarge, zipOf, type Zip } from './zip.ts';

export const DEFAULT_PORT = 8765;
const JSON_MAX = 16 * 1024 * 1024;
export const MEDIA_MAX = 64 * 1024 * 1024;
// the largest upload of a page that does not run on the machine of the host
export const GUEST_MEDIA_MAX = 16 * 1024 * 1024;
// the most new files that the pages of one run upload into media/, and their most bytes in all,
// smaller in the tests, so that a page cannot fill the disk of the host
const UPLOADS_MAX = Number(process.env.SLIDES_UPLOADS_MAX) || 1000;
const UPLOADS_MAX_BYTES = Number(process.env.SLIDES_UPLOADS_MAX_BYTES) || 2048 * 1024 * 1024;
// the types of IMAGE_EXT and VIDEO_EXT in src/editor/media/store.ts, the PDF of a PDF figure, and json
const MEDIA_TYPES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'mp4', 'm4v', 'webm', 'mov', 'ogv', 'pdf', 'json']);
// the time in ms within which the edit command of a lock must answer, shorter in the tests
const LOCK_WAIT = Number(process.env.SLIDES_LOCK_TIMEOUT_MS) || 2000;
// the time in ms for which End session waits for the polls of the guests, shorter in the tests
const END_WAIT = Number(process.env.SLIDES_END_WAIT_MS) || 1000;
// the time in ms for which a stopped edit command still answers a request, and the longest time
// for which it waits for the next poll of each page of the host, to answer it with ended
const CLOSE_WAIT = 200;
const TOLD_WAIT = 3000;
// the most bytes of the files of a talk folder that a page downloads as a zip without the relay,
// which is also the most that the zips kept at one time hold, smaller in the tests. through the
// relay, the limit of a folder is the largest answer of the relay
const ZIP_MAX = Number(process.env.SLIDES_ZIP_MAX_BYTES) || 512 * 1024 * 1024;
// the bytes of one piece of a zip. the relay takes a piece within its 60 s from an upload of
// 0.3 Mbit/s, and it holds one piece of a download rather than its session share
const ZIP_PIECE = 2 * 1024 * 1024;
// the time in ms for which a zip is kept after a page last asked for a piece of it, shorter in the
// tests. a zip of which a piece was not asked for yet is kept for a quarter of this time
const ZIP_KEPT = Number(process.env.SLIDES_ZIP_KEPT_MS) || 120_000;
const MB = 1024 * 1024;

export type StartOptions = {
  folder?: string;
  // 0 for a free port. without a port, the port of the last start and DEFAULT_PORT are tried first
  port?: number;
  relay?: string;
  log?: (message: string) => void;
  history?: Omit<HistoryOptions, 'now' | 'clock' | 'log'>;
  comments?: Omit<CommentsOptions, 'now' | 'log'>;
};

export type Running = {
  url: string;
  port: number;
  key: string;
  root: string;
  authority: Authority;
  // the link of the session through the relay, or null
  link: () => string | null;
  // resolves with the number of operations that are not written into index.html, plus one when
  // comments.json is not written
  close: () => Promise<number>;
  // resolves with the same number once close() has written both files, before the share and the
  // server are closed
  unwritten: Promise<number>;
};

// the address of an edit command that already runs on the talk folder
export type Found = { url: string; port: number; key: string };

export class AlreadyRunning extends Error {
  readonly found: Found;
  constructor(found: Found) {
    super(`the edit command already runs for this folder at ${found.url}`);
    this.found = found;
  }
}

type Lock = { pid: number; port: number; root: string };

// the edit command of .session/lock, when it runs on root, its process is alive, and its port
// answers for key or does not answer in time. a lock left by a command that died, or copied with
// the talk folder, is not
async function holderOf(file: string, root: string, key: string, log: (message: string) => void): Promise<Found | null> {
  let lock: Lock;
  try {
    lock = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (!Number.isInteger(lock?.pid) || !Number.isInteger(lock?.port) || lock.root !== root || lock.pid === process.pid) return null;
  try {
    process.kill(lock.pid, 0);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EPERM') return null;
  }
  const url = `http://127.0.0.1:${lock.port}/${key}/`;
  try {
    const answer = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(LOCK_WAIT) });
    await answer.body?.cancel();
    return answer.status === 302 ? { url, port: lock.port, key } : null;
  } catch (e) {
    // a command that is stopped, e.g. by Ctrl+Z, or busy still writes index.html once it goes on
    if ((e as Error).name !== 'TimeoutError') return null;
    log(`the edit command of process ${lock.pid} holds this folder and does not answer. Bring it back to the front, or end it`);
    return { url, port: lock.port, key };
  }
}

// the text of a session that could not be written into index.html, kept in .session/ of the talk
// folder or else in the temporary folder of the system, and the path of the file or null
function keepUnwritten(root: string, text: string): string | null {
  const name = `unwritten-${new Date().toISOString().replace(/[:.]/g, '-')}.html`;
  for (const dir of [join(root, '.session'), tmpdir()]) {
    try {
      const file = join(dir, name);
      writeFileSync(file, text, { flag: 'wx' });
      return file;
    } catch {}
  }
  return null;
}

// the key of the session, kept in .session/key so that a link survives a restart
function keyOf(root: string): string {
  const dir = join(root, '.session');
  mkdirSync(dir, { recursive: true });
  // the folder ignores itself in every talk, also in one whose .gitignore is older than it
  try {
    writeFileSync(join(dir, '.gitignore'), '*\n', { flag: 'wx' });
  } catch {}
  const file = join(dir, 'key');
  try {
    const key = readFileSync(file, 'utf8').trim();
    if (/^[A-Za-z0-9_-]{22,128}$/.test(key)) return key;
  } catch {}
  const key = randomBytes(16).toString('base64url');
  writeFileSync(file, `${key}\n`, { mode: 0o600 });
  return key;
}

// the port of the last start, kept in .session/port so that the address of a page, and with it the
// storage of the browser for this address, survives a restart
function savedPort(root: string): number | null {
  try {
    const port = Number(readFileSync(join(root, '.session', 'port'), 'utf8').trim());
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
  } catch {
    return null;
  }
}

// a name of an upload made safe for every system, or null when its type is not an image, a video,
// or json
export function cleanName(raw: string): string | null {
  let name: string;
  try {
    name = decodeURIComponent(raw);
  } catch {
    return null;
  }
  name = (name.split(/[\\/]/).pop() ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  if (!MEDIA_TYPES.has(ext)) return null;
  return `${cleanStem(name.slice(0, dot), 'media')}.${ext}`;
}

// a stem of a file name made safe for every system, or fallback when nothing is left of it
function cleanStem(raw: string, fallback: string): string {
  let stem = raw.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 80);
  if (!stem) stem = fallback;
  if (RESERVED.test(stem)) stem = `${stem}-file`;
  return stem;
}

// the names that Windows keeps for its devices
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const FIGURE_NAME = /^[\w-]+$/;
// the files of the talk folder that a page writes with its sheets
const SOURCES = ['preamble.tex', 'references.bib'];

// the box of a preview, each size a number of px or null
function boxOf(value: unknown): Box | null {
  if (!value || typeof value !== 'object') return null;
  const box: Box = { width: null, height: null };
  for (const key of ['width', 'height'] as const) {
    const size = (value as Record<string, unknown>)[key] ?? null;
    if (size !== null && !(typeof size === 'number' && size > 0 && size <= 100_000)) return null;
    box[key] = size;
  }
  return box;
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

// the name of a file in dir of size bytes with the SHA-256 hash, under name or a numbered name of
// it as the media route gives one, e.g. plot.png or plot-2.png, or null
async function sameFile(dir: string, name: string, size: number, hash: string): Promise<string | null> {
  const dot = name.lastIndexOf('.');
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const family = new RegExp(`^${escape(name.slice(0, dot))}(?:-(\\d+))?${escape(name.slice(dot))}$`);
  const found = (await readdir(dir, { withFileTypes: true })).flatMap((d) => {
    const m = d.isFile() ? family.exec(d.name) : null;
    return m ? [{ name: d.name, n: Number(m[1] ?? 1) }] : [];
  });
  for (const f of found.sort((a, b) => a.n - b.n)) {
    const file = join(dir, f.name);
    try {
      if ((await stat(file)).size === size && sha256(await readFile(file)) === hash) return f.name;
    } catch {
      // a file removed meanwhile is not the same file
    }
  }
  return null;
}

const isJson = (request: Request) => (request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() === 'application/json';

// the JSON object of a POST, or the answer that refuses it
function bodyOf(request: Request): Record<string, unknown> | Response {
  if (!isJson(request)) return error(415, 'the body must be application/json');
  try {
    const body = JSON.parse(request.body.toString('utf8'));
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch {}
  return error(400, 'the body is not a JSON object');
}

const isResponse = (x: unknown): x is Response => !!x && typeof (x as Response).status === 'number' && typeof (x as Response).headers === 'object';

export async function start(options: StartOptions = {}): Promise<Running> {
  const log = options.log ?? ((m: string) => process.stderr.write(`${m}\n`));
  // the native realpath resolves the short names of Windows, as realpath of fs/promises does
  const root = realpathSync.native(resolve(options.folder ?? '.'));
  const index = join(root, 'index.html');
  const { text, bom } = readText(index);
  const key = keyOf(root);
  // the name of the zip and of its one folder: the name of the talk folder without what Windows
  // refuses in a file name, and without what Chrome replaces in the name of a download, i.e. a
  // control or a format character, and a ~ or a space at its start. it does not start with a dot,
  // which hides a folder, and it is not a device of Windows, e.g. aux. it is cut to 64 units of
  // UTF-16, in which Windows counts a path of at most 259, since Extract All puts the folder into
  // one of the same name
  const fit = (name: string) => {
    let out = '';
    for (const c of name) {
      if (out.length + c.length > 64) break;
      out += c;
    }
    return out.replace(/[\s.]+$/, '');
  };
  // a name may be a device only once it is cut, and the - of a device counts in the 64 units
  const DEVICE = /^(con|prn|aux|nul|clock\$|conin\$|conout\$|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])(?= *\.|$)/i;
  const zipName = fit(fit(basename(root).normalize('NFC').replace(/[<>:"/\\|?*\p{Cc}\p{Cf}]/gu, '-').replace(/^[\s.~]+/, '')).replace(DEVICE, '$1-')) || 'talk';
  const lockFile = join(root, '.session', 'lock');
  const earlier = await holderOf(lockFile, root, key, log);
  if (earlier) throw new AlreadyRunning(earlier);
  const appliedFile = join(root, '.session', 'applied.json');
  const authority = new Authority(text, { applied: readApplied(appliedFile) });
  const appliedTable = new AppliedTable(appliedFile, log);
  // the pages draw the deck again at each change of tex.js on disk
  const tex = new TexWriter(root, text, { log, onChange: () => people.texChanged(), onWriteError: (m) => people.texFailed(m) });
  const onWritten = (n: number, written: string) => {
    if (authority.written(n)) appliedTable.write(authority.table());
    tex.written(written);
    figures.written(written);
  };
  // the pages are told of a write that fails, since an operation is acknowledged before it is written
  const disk = new Disk(index, authority, bom, { log, onWritten, onPoll: () => {
      tex.poll();
      figures.poll();
    }, onWriteError: (e) => people.writeFailed(e) });
  const people = new People(authority, join(root, '.session', 'people.json'), log);
  // the stale figures are compiled in the background, and the pages load each new output
  const figures = new FigureWatcher(root, text, { log, onChange: () => people.news() });
  // made once this command holds the lock, so that a second start does not write the history
  let history!: History;
  let comments!: Comments;
  let port = 0;
  let relay: RelayLink | null = null;
  let closed = false;
  // the changes of the relay link run one at a time, so that a link is never left running unseen
  let relayQueue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = relayQueue.then(task, task);
    relayQueue = run.catch(() => {});
    return run;
  };

  async function share(request: Request): Promise<Response> {
    if (!request.direct) return error(403, 'only the host can share a session');
    if (request.method === 'GET') return json(200, { link: relay?.active ? relay.link : null });
    if (request.method === 'DELETE') {
      return serial(async () => {
        // the guests are told before the relay that carries the answers is left, also a guest whose
        // next poll is on its way, which the pulls that still run bring in
        const told = people.endGuests();
        if (relay) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([told, new Promise((done) => (timer = setTimeout(done, END_WAIT)))]);
          clearTimeout(timer);
        }
        await relay?.stop(people.endedBy());
        relay = null;
        return json(200, { link: null });
      });
    }
    if (request.method !== 'POST') return error(405, 'GET, POST, or DELETE');
    if (!isJson(request)) return error(415, 'the body must be application/json');
    let body: { relay?: unknown; secret?: unknown };
    try {
      body = JSON.parse(request.body.toString('utf8') || '{}');
    } catch {
      return error(400, 'the body is not JSON');
    }
    const saved = loadConfig();
    const address = relayAddress(body.relay ?? saved.relay);
    // the saved secret goes only to the saved address, since a script in the deck may send this
    // request with an address of its own
    const secret = body.secret ?? (address !== null && address === relayAddress(saved.relay) ? saved.secret : undefined);
    if (!address) return json(400, { link: null, error: ADDRESS_RULE });
    if (secret === undefined) return json(400, { link: null, error: 'a new address of the relay needs the secret' });
    if (typeof secret !== 'string' || secret.length < 16) return json(400, { link: null, error: 'the secret has fewer than 16 characters' });
    return serial(async () => {
      try {
        await connect(address, secret);
      } catch (e) {
        return json(e instanceof Taken ? 409 : 502, { link: null, error: (e as Error).message });
      }
      if (body.relay !== undefined || body.secret !== undefined) saveConfig({ relay: address, secret });
      return json(200, { link: relay!.link });
    });
  }

  // called through serial alone
  async function connect(address: string, secret: string): Promise<void> {
    // the guests of another relay cannot reach this session any more
    if (relay && relay.relay !== address) void people.endGuests();
    await relay?.stop();
    relay = null;
    if (closed) throw new Error('the edit command is stopping');
    const next = new RelayLink(address, secret, key, handle, log);
    await next.start();
    if (closed) {
      await next.stop();
      throw new Error('the edit command is stopping');
    }
    relay = next;
  }

  // the zip of the talk folder of each page that downloads one, by its client, kept in memory from
  // its POST until its DELETE, or until the page stops asking for pieces
  const zips = new Map<string, { id: string; zip: Zip; timer: ReturnType<typeof setTimeout> }>();
  const dropZip = (client: string) => {
    clearTimeout(zips.get(client)?.timer);
    zips.delete(client);
  };
  // the zip id of client is dropped after ms
  const dropAfter = (client: string, id: string, ms: number) => {
    const timer = setTimeout(() => zips.get(client)?.id === id && zips.delete(client), ms);
    timer.unref();
    return timer;
  };
  // the most bytes of the zips that are being built
  let building = 0;
  // whether the zips kept and being built do not leave room for one of bytes. a zip alone has room
  const zipsFull = (bytes: number) => {
    let held = building;
    for (const z of zips.values()) held += z.zip.size;
    return held > 0 && held + bytes > ZIP_MAX;
  };

  // POST zip builds the zip of the page and answers its id, its size, and its name. GET zip/<id>
  // answers the piece that starts at the byte of at, and DELETE zip/<id> frees the zip
  async function zipApi(route: string, request: Request): Promise<Response> {
    const query = new URLSearchParams(request.query);
    const client = people.clientOf(query.get('token'));
    if (client === null || !people.present(client)) return error(404, 'say hello first');
    if (route === 'zip') {
      if (request.method !== 'POST') return error(405, 'POST');
      if (closed) return error(503, 'the edit command is stopping');
      dropZip(client);
      const limit = request.direct ? ZIP_MAX : Math.min(ZIP_MAX, RELAY_ANSWER);
      // tex.js is written only after index.html, hence the zip holds the one of the text of the
      // session, where the edit command writes it
      const tex = deriveTex(root, authority.text);
      const deck = { html: authority.text, bom: disk.bom, tex: tex.sources && !tex.unread.length ? tex.text : null };
      // the room of a zip is taken before its files are read, so that the pages that ask at one
      // time do not each hold a zip
      let reserved = 0;
      let zip: Zip | null;
      try {
        zip = await zipOf(root, zipName, deck, limit, (most) => !zipsFull(most) && ((building += reserved = most), true));
      } catch (e) {
        if (!(e instanceof TooLarge)) throw e;
        // the tex.js of the session and each wrapped file are files of the zip as well
        if (e.files > MOST_FILES) return error(413, `The zip of the talk folder would hold more than ${MOST_FILES.toLocaleString('en-US')} files, the most that a zip holds.`);
        // rounded up, so that a folder just over the limit is not given as the limit
        const size = (Math.ceil((e.bytes / MB) * 10) / 10).toFixed(1);
        return error(413, `The talk folder is ${size} MB, over the limit of ${Math.floor(limit / MB)} MB for a download${request.direct ? '' : ' through the relay'}.`);
      } finally {
        building -= reserved;
      }
      // the earlier zip of a page that asked twice
      dropZip(client);
      if (closed) return error(503, 'the edit command is stopping');
      if (!zip || zipsFull(zip.size)) return error(503, 'The edit command is busy with other downloads of the talk folder. Try again in a minute.');
      const id = randomBytes(8).toString('hex');
      // a page whose download was stopped while the zip was built does not ask for a piece
      zips.set(client, { id, zip, timer: dropAfter(client, id, ZIP_KEPT / 4) });
      return json(200, { id, size: zip.size, name: `${zipName}.zip` });
    }
    const held = zips.get(client);
    if (!held || held.id !== route.slice('zip/'.length)) return error(404, 'the zip is not kept any more');
    if (request.method === 'DELETE') {
      dropZip(client);
      return json(200, {});
    }
    if (request.method !== 'GET') return error(405, 'GET or DELETE');
    const at = Number(query.get('at') ?? 0);
    if (!Number.isInteger(at) || at < 0 || at >= held.zip.size) return error(416, 'at is not a byte of the zip');
    clearTimeout(held.timer);
    held.timer = dropAfter(client, held.id, ZIP_KEPT);
    return { status: 200, headers: { 'Content-Type': 'application/zip', 'Cache-Control': 'no-store' }, body: piece(held.zip, at, ZIP_PIECE) };
  }

  // the files and bytes uploaded in this run, counted before each write
  const uploads = { files: 0, bytes: 0 };
  async function media(name: string, request: Request): Promise<Response> {
    if (request.method !== 'PUT') return error(405, 'PUT');
    const client = people.clientOf(new URLSearchParams(request.query).get('token'));
    if (client === null || !people.present(client)) return error(404, 'say hello first');
    const clean = cleanName(name);
    if (!clean) return error(415, 'the file must be an image, a video, a PDF, or json');
    if (request.body.length > MEDIA_MAX) return error(413, 'the file is larger than 64 MB');
    if (!request.direct && request.body.length > GUEST_MEDIA_MAX) return error(413, 'the file is larger than 16 MB, the limit of an upload through the relay');
    const dir = join(root, 'media');
    await mkdir(dir, { recursive: true });
    const real = await realpath(dir);
    if (!real.startsWith(root + sep)) return error(403, 'the path is outside the talk folder');
    // with the hash of the page, a file sent again, e.g. after its answer was lost, is not copied
    const sent = request.headers['x-content-sha256'];
    if (sent !== undefined) {
      const hash = sha256(request.body);
      if (sent.toLowerCase() !== hash) return error(400, 'the file does not have the SHA-256 of x-content-sha256');
      const same = await sameFile(real, clean, request.body.length, hash);
      if (same) return json(200, { path: `media/${same}` });
    }
    if (uploads.files >= UPLOADS_MAX) return error(413, `the session took ${UPLOADS_MAX} new files already, the most that it takes until the host starts it again`);
    if (uploads.bytes + request.body.length > UPLOADS_MAX_BYTES) return error(413, `the session took ${Math.round(uploads.bytes / MB)} MB of new files already, and it takes at most ${Math.round(UPLOADS_MAX_BYTES / MB)} MB until the host starts it again`);
    uploads.files++;
    uploads.bytes += request.body.length;
    const dot = clean.lastIndexOf('.');
    let kept = false;
    try {
      for (let i = 1; i < 1000; i++) {
        const candidate = i === 1 ? clean : `${clean.slice(0, dot)}-${i}${clean.slice(dot)}`;
        try {
          await writeFile(join(real, candidate), request.body, { flag: 'wx' });
          kept = true;
          return json(200, { path: `media/${candidate}` });
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        }
      }
    } finally {
      if (!kept) {
        uploads.files--;
        uploads.bytes -= request.body.length;
      }
    }
    return error(409, 'too many files of this name');
  }

  // the writes of the sources and of the data files of the figures run one at a time, hence a source
  // is compared with the text it was edited from and written before another write
  let figureWrites: Promise<unknown> = Promise.resolve();
  const oneAtATime = <T>(task: () => Promise<T>): Promise<T> => {
    const run = figureWrites.then(task, task);
    figureWrites = run.catch(() => {});
    return run;
  };

  // the TikZ figures: preview compiles a source that is not saved, source writes figures/name.tex,
  // or a new figure under a free name from stem, and data writes a CSV file into figures/
  async function figuresApi(route: string, request: Request): Promise<Response> {
    if (!['preview', 'source', 'data'].includes(route)) return error(404, 'not found');
    if (request.method !== 'POST') return error(405, 'POST');
    if (closed) return error(503, 'the edit command is stopping');
    const body = bodyOf(request);
    if (isResponse(body)) return body;
    // a token is enough, as for the version history
    const client = people.clientOf(body.token);
    if (client === null) return error(404, 'say hello first');
    // TeX reads every file that the account of the host may, hence a guest does not send it a source
    if (!request.direct) return error(403, 'only the host changes a TikZ figure');
    if (route === 'preview') {
      const box = boxOf(body.box);
      if (typeof body.name !== 'string' || !FIGURE_NAME.test(body.name) || typeof body.source !== 'string' || !box) return error(400, 'name, source, or box is not valid');
      if (figures.state().compiler === 'missing') return error(503, 'latex or dvisvgm is not found on the computer of the host');
      return json(200, await figures.preview(client, body.name, body.source, box));
    }
    const text = route === 'data' ? body.text : body.source;
    if (typeof text !== 'string') return error(400, `${route === 'data' ? 'text' : 'source'} is missing`);
    if (Buffer.byteLength(text) > RELAY_BODY) return error(413, 'the file is larger than 16 MB');
    const dir = join(root, 'figures');
    await mkdir(dir, { recursive: true });
    const real = await realpath(dir);
    if (!real.startsWith(root + sep)) return error(403, 'the path is outside the talk folder');
    if (route === 'data') {
      if (typeof body.stem !== 'string') return error(400, 'stem is missing');
      const clean = `${cleanStem((body.stem.split(/[\\/]/).pop() ?? '').replace(/\.csv$/i, ''), 'data')}.csv`;
      const bytes = Buffer.from(text, 'utf8');
      return oneAtATime(async () => {
        const same = await sameFile(real, clean, bytes.length, sha256(bytes));
        if (same) return json(200, { path: `figures/${same}` });
        for (let i = 1; i < 1000; i++) {
          const candidate = i === 1 ? clean : `${clean.slice(0, -4)}-${i}.csv`;
          try {
            await writeFile(join(real, candidate), bytes, { flag: 'wx' });
            figures.changed();
            return json(200, { path: `figures/${candidate}` });
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
          }
        }
        return error(409, 'too many files of this name');
      });
    }
    if (body.base !== null && typeof body.base !== 'string') return error(400, 'base is missing');
    if (body.name === undefined) {
      if (typeof body.stem !== 'string') return error(400, 'name or stem is missing');
      const stem = cleanStem(body.stem.replace(/\.tex$/i, ''), 'figure');
      return oneAtATime(async () => {
        for (let i = 1; i < 1000; i++) {
          const name = i === 1 ? stem : `${stem}-${i}`;
          if ((await stat(join(real, `${name}.js`)).catch(() => null)) !== null) continue;
          try {
            await writeFile(join(real, `${name}.tex`), text, { flag: 'wx' });
            figures.changed();
            return json(200, { name });
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
          }
        }
        return error(409, 'too many figures of this name');
      });
    }
    const name = body.name;
    if (typeof name !== 'string' || !FIGURE_NAME.test(name) || RESERVED.test(name)) return error(400, 'the name of a figure is letters, digits, - and _');
    return oneAtATime(async () => {
      const file = join(real, `${name}.tex`);
      const current = await readFile(file, 'utf8').catch((e) => {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw e;
      });
      // a page reads the text without a byte-order mark, as fetch() drops it, and the mark of the
      // file is kept
      const bom = current?.startsWith('\ufeff') ? '\ufeff' : '';
      const unmarked = bom ? current!.slice(1) : current;
      if (unmarked !== body.base) return json(409, { error: `figures/${name}.tex changed since it was read`, text: unmarked });
      const tmp = join(real, `.${name}.tex.${randomBytes(6).toString('hex')}.tmp`);
      try {
        await writeFile(tmp, bom + text.replace(/^\ufeff/, ''));
        await renameRetried(tmp, file);
      } catch (e) {
        await unlink(tmp).catch(() => {});
        return error(500, `could not write figures/${name}.tex: ${(e as Error).message}`);
      }
      figures.changed();
      return json(200, { name });
    });
  }

  // PUT source/preamble.tex and source/references.bib: the text of a sheet, written only over the
  // text that the page read, base, where a missing file reads as empty. a newer text is answered
  // with 409. a guest may input only files of the talk folder in the preamble, since the macros
  // of any other file of the host would be written into tex.js
  async function sourceApi(name: string, request: Request): Promise<Response> {
    if (!SOURCES.includes(name)) return error(404, 'only preamble.tex and references.bib are written');
    if (request.method !== 'PUT') return error(405, 'PUT');
    if (closed) return error(503, 'the edit command is stopping');
    const body = bodyOf(request);
    if (isResponse(body)) return body;
    const client = people.clientOf(body.token);
    if (client === null || !people.present(client)) return error(404, 'say hello first');
    const { base, text } = body;
    if (typeof base !== 'string' || typeof text !== 'string') return error(400, 'base or text is missing');
    if (Buffer.byteLength(text) > RELAY_BODY) return error(413, 'the file is larger than 16 MB');
    if (!request.direct && name === 'preamble.tex') {
      const outside: string[] = [];
      readPreamble(text, {
        resolve: (input, kind) => {
          const file = kind === 'input' ? input : `${input}.${kind === 'package' ? 'sty' : 'cls'}`;
          if (!file.replace(/^(\.\/)+/, '').split('/').every(servedSegment)) outside.push(input);
          return null;
        },
      });
      if (outside.length) return error(403, `a guest inputs only files of the talk folder in preamble.tex, not ${outside.join(', ')}`);
    }
    return oneAtATime(async () => {
      let file = join(root, name);
      const real = await realpath(file).catch(() => null);
      if (real !== null && !real.startsWith(root + sep)) return error(403, `${name} is a link out of the talk folder`);
      file = real ?? file;
      const current = await readFile(file, 'utf8').catch((e) => {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return '';
        throw e;
      });
      // a page reads the text without a byte-order mark, as fetch() drops it, and the mark is kept
      const bom = current.startsWith('﻿') ? '﻿' : '';
      const unmarked = current.slice(bom.length);
      if (unmarked !== base) return json(409, { error: `${name} changed since it was read`, text: unmarked });
      if (text === unmarked) return json(200, {});
      const tmp = join(root, `.${name}.${randomBytes(6).toString('hex')}.tmp`);
      try {
        await writeFile(tmp, bom + text.replace(/^﻿/, ''));
        await renameRetried(tmp, file);
      } catch (e) {
        await unlink(tmp).catch(() => {});
        return error(500, `could not write ${name}: ${(e as Error).message}`);
      }
      tex.sourceWritten();
      return json(200, {});
    });
  }

  // the version history and the texts set aside, for every page with a token
  function historyApi(route: string, request: Request): Response {
    const parts = route.split('/');
    if (request.method === 'GET') {
      if (people.clientOf(new URLSearchParams(request.query).get('token')) === null) return error(404, 'say hello first');
      if (route === 'history') return json(200, history.list());
      const v = parts.length === 2 && parts[0] === 'history' ? history.get(parts[1]) : null;
      return v ? json(200, v) : error(404, 'there is no such version');
    }
    if (request.method !== 'POST') return error(405, 'GET or POST');
    if (closed) return error(503, 'the edit command is stopping');
    const body = bodyOf(request);
    if (isResponse(body)) return body;
    const client = people.clientOf(body.token);
    const person = client === null ? null : people.personOf(client);
    if (person === null) return error(404, 'say hello first');
    if (route === 'aside') {
      if (typeof body.text !== 'string') return error(400, 'text is missing');
      const aside = history.setAside(body.text, person);
      return aside ? json(200, aside) : error(413, 'the text is larger than 8 MB');
    }
    if (parts.length !== 3 || parts[0] !== 'history') return error(404, 'not found');
    if (parts[2] === 'name') {
      const named = history.name(parts[1], body.name);
      if (named === 'long') return error(400, 'the tag must be a text of at most 80 characters');
      return named ? json(200, named) : error(404, 'there is no such version');
    }
    if (parts[2] === 'restore') {
      const restored = history.restore(parts[1], person);
      return restored ? json(200, { id: restored.id, v: authority.version }) : error(404, 'there is no such version');
    }
    return error(404, 'not found');
  }

  // the comments, for every page with a token
  function commentsApi(route: string, request: Request): Response {
    const parts = route.split('/');
    if (request.method === 'GET') {
      const client = people.clientOf(new URLSearchParams(request.query).get('token'));
      const person = client === null ? null : people.personOf(client);
      if (route !== 'comments') return error(404, 'not found');
      return person === null ? error(404, 'say hello first') : json(200, comments.list(person));
    }
    if (request.method !== 'POST') return error(405, 'GET or POST');
    if (closed) return error(503, 'the edit command is stopping');
    const body = bodyOf(request);
    if (isResponse(body)) return body;
    const client = people.clientOf(body.token);
    const person = client === null ? null : people.personOf(client);
    if (person === null) return error(404, 'say hello first');
    const answer = (x: unknown) => (isFailure(x) ? error((x as Failure).status, (x as Failure).error) : json(200, x));
    if (route === 'comments') return answer(comments.add(person, body));
    if (route === 'comments/seen') {
      const seen = body.thread === undefined ? comments.seen(person, body.time) : comments.seenThread(person, body.thread, body.time);
      return isFailure(seen) ? answer(seen) : json(200, comments.times(person));
    }
    if (parts.length !== 3 || !isCommentId(parts[1])) return error(404, 'not found');
    const id = parts[1];
    switch (parts[2]) {
      case 'reply':
        return answer(comments.reply(id, person, body));
      case 'edit':
        return answer(comments.edit(id, person, body));
      case 'delete':
        return answer(comments.remove(id, person, body) ?? {});
      case 'resolve':
        return answer(comments.resolve(id, person, true));
      case 'reopen':
        return answer(comments.resolve(id, person, false));
    }
    return error(404, 'not found');
  }

  async function api(route: string, request: Request): Promise<Response> {
    if (route.startsWith('media/')) return media(route.slice(6), request);
    if (route === 'history' || route.startsWith('history/') || route === 'aside') return historyApi(route, request);
    if (route === 'comments' || route.startsWith('comments/')) return commentsApi(route, request);
    if (route === 'share') return share(request);
    if (route === 'zip' || route.startsWith('zip/')) return zipApi(route, request);
    if (route.startsWith('figures/')) return figuresApi(route.slice('figures/'.length), request);
    if (route.startsWith('source/')) return sourceApi(route.slice('source/'.length), request);
    if (route === 'events') {
      if (request.method !== 'GET') return error(405, 'GET');
      const query = new URLSearchParams(request.query);
      const waiting = people.events(people.clientOf(query.get('token')) ?? '', query.get('since') ?? '');
      return waiting ? json(200, await waiting) : error(404, 'say hello first');
    }
    if (!['hello', 'name', 'op', 'presence', 'bye'].includes(route)) return error(404, 'not found');
    if (request.method !== 'POST') return error(405, 'POST');
    // index.html is written for the last time once the stop begins, hence a later change would be lost
    if (closed && (route === 'op' || route === 'hello')) return error(503, 'the edit command is stopping');
    if (!isJson(request)) return error(415, 'the body must be application/json');
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(request.body.toString('utf8'));
      if (!body || typeof body !== 'object') throw new Error();
    } catch {
      return error(400, 'the body is not a JSON object');
    }
    if (route === 'hello') {
      const hello = body as Partial<HelloRequest>;
      if (Array.isArray(hello.retire)) for (const token of hello.retire.slice(0, 16)) people.retire(token);
      const joined = people.hello(hello.name, hello.person, hello.token, request.direct, hello.claim === true);
      if ('taken' in joined) return json(200, { taken: joined.taken });
      if ('empty' in joined) return error(400, 'the name is empty');
      if ('full' in joined) return error(503, FULL);
      const { member, token } = joined;
      const applied = typeof hello.was === 'string' ? authority.applied(hello.was) : undefined;
      const answer = { client: member.client, token, person: member.person, name: member.name, color: member.color, host: member.host, v: authority.version, people: people.list(), known: people.known(), tex: people.tex(), figures: figures.state(), ...(applied === undefined ? {} : { applied }) };
      const ops = typeof hello.v === 'string' ? authority.since(hello.v) : null;
      return json(200, ops ? { ...answer, ops } : { ...answer, text: authority.text });
    }
    // the client id is found from the secret token, and a client in the body is not read
    const client = people.clientOf(body.token);
    if (route === 'op') {
      const person = client === null ? null : people.personOf(client);
      if (client === null || person === null) return json(200, { ok: false, reason: 'unknown', v: authority.version });
      if (Array.isArray(body.patches) && body.patches.length > 100_000) return json(200, { ok: false, reason: 'invalid', v: authority.version });
      const { seq, base, patches } = body as Partial<OpPost>;
      return json(200, authority.submit({ client, seq, base, patches } as OpRequest, person).answer);
    }
    if (!isToken(body.token)) return error(400, 'token is missing');
    if (route === 'bye') {
      if (client !== null) people.bye(client);
      return json(200, {});
    }
    if (client === null) return error(404, 'say hello first');
    if (route === 'name') {
      const renamed = people.rename(client, (body as Partial<NameRequest>).name);
      if (!renamed) return error(404, 'say hello first');
      if ('empty' in renamed) return error(400, 'the name is empty');
      return json(200, renamed);
    }
    if (route === 'presence') {
      if ((JSON.stringify(body.state ?? null) ?? '').length > MAX_STATE) return error(413, 'the presence is too large');
      return people.presence(client, body.state ?? null) ? json(200, {}) : error(404, 'say hello first');
    }
    return error(404, 'not found');
  }

  function indexHtml(request: Request): Response {
    let version = authority.version;
    let html = authority.text;
    const names = paramNames(request.query);
    // a version or a text set aside, for a preview in an iframe
    if (names.has('version') || names.has('aside')) {
      if (names.has('edit') || names.has('session')) return error(400, 'a version is shown without edit and session');
      const query = new URLSearchParams(request.query);
      const text = names.has('version') ? history.textOf(query.get('version')) : history.asideText(query.get('aside'));
      if (text === null) return error(404, 'there is no such version');
      return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, body: Buffer.from(disk.bom ? `\ufeff${text}` : text, 'utf8') };
    }
    if (names.has('session')) {
      const mode = request.headers['sec-fetch-mode'];
      const navigation = mode ? mode === 'navigate' : (request.headers.accept ?? '').includes('text/html');
      const v = new URLSearchParams(request.query).get('v');
      // a page and the text that the editor reads are of one version, hence a navigation is sent to
      // the URL of the current version
      if (navigation && v !== authority.version) {
        return { status: 302, headers: { Location: `index.html?${withParam(request.query, 'v', authority.version)}`, 'Cache-Control': 'no-store' } };
      }
      if (v !== null) {
        const n = authority.reach(v);
        if (n === null) return error(409, `version ${v} is not in the log, the current version is ${authority.version}`);
        html = authority.textAt(n)!;
        version = v;
      }
    }
    const body = Buffer.from(disk.bom ? `﻿${html}` : html, 'utf8');
    return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'x-session-version': version }, body };
  }

  // every answer below the key is marked, since a page that the edit command serves without
  // x-session-version, e.g. another page of the talk folder, writes a hash of the key into a copy,
  // see deckAddress() in src/editor/commands/origin.ts
  async function handle(request: Request): Promise<Response> {
    const prefix = `/${key}/`;
    if (!request.path.startsWith(prefix)) return error(404, 'not found');
    const response = await below(request, request.path.slice(prefix.length));
    return { ...response, headers: { ...response.headers, 'x-edit-command': '1' } };
  }

  async function below(request: Request, rest: string): Promise<Response> {
    if (rest.startsWith('.session/')) return api(rest.slice('.session/'.length), request);
    if (request.method !== 'GET' && request.method !== 'HEAD') return error(405, 'GET or HEAD');
    if (rest === '') return { status: 302, headers: { Location: 'index.html' } };
    const segments = segmentsOf(rest);
    if (!segments) return error(404, 'not found');
    if (segments.length === 1 && segments[0].toLowerCase() === 'index.html') return indexHtml(request);
    const file = await fileInside(root, segments);
    if (!file) return error(404, 'not found');
    return serveFile(file, request, request.direct ? Infinity : RELAY_BODY);
  }

  async function onRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const q = url.indexOf('?');
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers[k] = Array.isArray(v) ? v.join(', ') : v;
    if (headers.host !== `127.0.0.1:${port}` && headers.host !== `localhost:${port}`) return send(req, res, error(403, 'the Host header is not this computer'));
    const limit = req.method === 'PUT' ? MEDIA_MAX : JSON_MAX;
    const chunks: Buffer[] = [];
    let length = 0;
    if (Number(headers['content-length'] ?? 0) > limit) return send(req, res, error(413, 'the body is too large'), true);
    try {
      for await (const chunk of req) {
        length += (chunk as Buffer).length;
        if (length > limit) return send(req, res, error(413, 'the body is too large'), true);
        chunks.push(chunk as Buffer);
      }
    } catch {
      // the browser closed the connection before the end of the body
      res.destroy();
      return;
    }
    const request: Request = { method: req.method ?? 'GET', path: q < 0 ? url : url.slice(0, q), query: q < 0 ? '' : url.slice(q + 1), headers, body: Buffer.concat(chunks), direct: true };
    let response: Response;
    try {
      response = await handle(request);
    } catch (e) {
      log(`a request failed: ${(e as Error).message}`);
      response = error(500, 'the request failed');
    }
    send(req, res, response);
  }

  function send(req: IncomingMessage, res: ServerResponse, response: Response, close = false): void {
    if (res.headersSent) return;
    const headers = { ...response.headers };
    const b = response.body;
    if (close) headers.Connection = 'close';
    const head = req.method === 'HEAD';
    if (b !== undefined && typeof b === 'object' && !Buffer.isBuffer(b)) {
      const length = b.end - b.start + 1;
      headers['Content-Length'] = String(length);
      res.writeHead(response.status, headers);
      if (head || length <= 0) {
        res.end();
        return;
      }
      // a file made shorter since its size was read, e.g. one that a program writes in place, ends
      // before the length that was sent. the connection is then closed, since the browser would
      // wait on it for the rest, and would read the next answer as these bytes
      const stream = createReadStream(b.file, { start: b.start, end: b.end });
      stream.on('error', () => res.destroy());
      stream.on('end', () => (stream.bytesRead < length ? res.destroy() : res.end()));
      stream.pipe(res, { end: false });
      return;
    }
    const bytes = b === undefined ? Buffer.alloc(0) : Buffer.isBuffer(b) ? b : Buffer.from(b);
    headers['Content-Length'] = String(bytes.length);
    res.writeHead(response.status, headers);
    res.end(head ? undefined : bytes);
  }

  const server = createServer((req, res) =>
    onRequest(req, res).catch((e) => {
      log(`a request failed: ${(e as Error).message}`);
      res.destroy();
    }),
  );
  server.headersTimeout = 20_000;
  server.requestTimeout = 120_000;
  // the next port is tried when one is taken, or reserved by Windows, which answers EACCES
  const ports = options.port !== undefined ? [options.port] : [...new Set([savedPort(root) ?? DEFAULT_PORT, DEFAULT_PORT, 0])];
  await new Promise<void>((done, fail) => {
    const tryListen = (i: number) => {
      server.once('error', (e: NodeJS.ErrnoException) => {
        if ((e.code === 'EADDRINUSE' || e.code === 'EACCES') && i + 1 < ports.length) tryListen(i + 1);
        else fail(e);
      });
      server.listen(ports[i], '127.0.0.1', () => {
        server.removeAllListeners('error');
        done();
      });
    };
    tryListen(0);
  });
  port = (server.address() as { port: number }).port;
  // a second start at the same time is found by the lock that the first one created
  const lock = JSON.stringify({ pid: process.pid, port, root } satisfies Lock);
  try {
    writeFileSync(lockFile, lock, { flag: 'wx' });
  } catch {
    const other = await holderOf(lockFile, root, key, log);
    // a lock that names the port of this process was left by an edit command that died, since a
    // live one would still hold the port. the answer came from this process
    if (other && other.port !== port) {
      people.end();
      await new Promise((done) => server.close(done));
      throw new AlreadyRunning(other);
    }
    const tmp = `${lockFile}.${randomBytes(6).toString('hex')}.tmp`;
    writeFileSync(tmp, lock);
    renameRetriedSync(tmp, lockFile);
  }
  const unlock = () => {
    try {
      if (readFileSync(lockFile, 'utf8') === lock) unlinkSync(lockFile);
    } catch {}
  };
  try {
    writeFileSync(join(root, '.session', 'port'), `${port}\n`);
  } catch {}
  history = new History(join(root, '.session'), authority, { ...options.history, log });
  history.onChange(() => people.news());
  people.feed({
    rev: () => history.rev,
    write: (answer) => {
      answer.history = history.rev;
    },
  });
  // a restore is told as a toast to each page of a version before it, also to a page that was
  // dropped while it was away
  people.feed({
    rev: () => history.restores,
    write: (answer, _seen, since) => {
      const restored = history.restoredAfter(since);
      if (restored) answer.restored = restored;
    },
  });
  // a change from outside that replaced text of a person is told in the same way
  people.feed({
    rev: () => history.overwritten,
    write: (answer, _seen, since) => {
      if (history.overwrittenAfter(since)) answer.overwritten = true;
    },
  });
  people.feed({
    rev: () => figures.rev,
    write: (answer) => {
      answer.figures = figures.state();
    },
  });
  comments = new Comments(join(root, '.session'), authority, history.found, { ...options.comments, log });
  comments.onChange(() => people.news());
  people.feed({
    rev: () => comments.v,
    write: (answer, seen) => {
      answer.comments = comments.since(seen);
    },
  });
  // the times up to which the person of a page read, after a read on another page of the person
  people.feed({
    rev: () => comments.reads,
    of: (person) => comments.readsOf(person),
    write: (answer, _seen, _since, person) => {
      answer.comments = { ...(answer.comments ?? { v: comments.v, changed: [], removed: [] }), ...comments.times(person) };
    },
  });
  disk.start();

  if (options.relay) {
    const address = relayAddress(options.relay);
    const saved = loadConfig();
    const secret = process.env.SLIDES_RELAY_SECRET || (address !== null && address === relayAddress(saved.relay) ? saved.secret : undefined);
    if (!address) log(`${ADDRESS_RULE}, and the session is not shared`);
    else if (!secret || secret.length < 16) log('the secret of the relay is not set, and the session is not shared');
    // not awaited, so that the caller can stop the command, with its last write, while the relay is asked
    else void serial(() => connect(address, secret)).then(() => log(`shared at ${relay!.link}`), (e) => log(`the session is not shared: ${(e as Error).message}`));
  }

  let closing: Promise<number> | null = null;
  let written!: (unwritten: number) => void;
  const unwritten = new Promise<number>((done) => (written = done));
  return {
    url: `http://127.0.0.1:${port}/${key}/`,
    port,
    key,
    root,
    authority,
    link: () => (relay?.active ? relay.link : null),
    unwritten,
    close: () =>
      (closing ??= (async () => {
        closed = true;
        for (const client of [...zips.keys()]) dropZip(client);
        // a start during the stop begins a new edit command rather than finding this one
        unlock();
        const told = people.end();
        // a compile that runs is stopped at once, and index.html, the history, and the comments do
        // not wait for it
        const figuresStopped = figures.stop();
        const unwritten = await disk.stop();
        await tex.stop();
        await appliedTable.stop();
        if (unwritten) {
          const kept = keepUnwritten(root, disk.bom ? `\ufeff${authority.text}` : authority.text);
          log(kept ? `the text of the session is kept in ${kept}` : 'the text of the session could not be kept in any file');
        }
        history.stopSync();
        // comments.stopSync logs the file and the reason when it is not written
        const all = unwritten + (comments.stopSync() ? 0 : 1);
        written(all);
        await figuresStopped;
        // a share in progress sees closed and stops its link, hence the stop waits behind it. the relay
        // keeps the record of the end for a guest who was not waiting at the edit command
        await Promise.race([serial(async () => relay?.stop(people.endedBy())), new Promise((done) => setTimeout(done, 2500))]);
        // a request that arrives in this time is answered, e.g. a poll with ended, rather than reset
        // by the close, also the next poll of a page of the host that was between two polls
        await Promise.all([new Promise((done) => setTimeout(done, CLOSE_WAIT)), Promise.race([told, new Promise((done) => setTimeout(done, TOLD_WAIT))])]);
        await new Promise<void>((done) => {
          server.close(() => done());
          setTimeout(() => {
            server.closeAllConnections();
          }, 300);
        });
        return all;
      })()),
  };
}
