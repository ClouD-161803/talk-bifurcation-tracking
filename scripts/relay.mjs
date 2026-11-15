// the relay of the synchronous editor: a reverse HTTP tunnel through which the guests of a session
// reach the edit command of the host, which listens on 127.0.0.1 only. it keeps everything in
// memory, and it never reads or writes a file. run it with
//
//   SLIDES_RELAY_SECRET=<the secret of the group, 16 or more characters> node scripts/relay.mjs --port N
//
// or with --secret-file <path> in place of the variable, so that a service definition does not
// hold the secret. the file holds the secret alone, and whitespace at its ends is left out
//
// the protocol, which a Cloudflare Worker with a Durable Object per key can serve as well:
//
//   GET /                          answers relay
//   POST /host/<key>               registers the edit command for key, with
//                                  Authorization: Bearer <secret>. key is 22 to 128 characters of
//                                  base64url. answers { token }, which every later request of the
//                                  host carries in x-relay-token beside the secret. 409 while
//                                  another edit command pulls for key, unless the request carries
//                                  the token of the session
//   DELETE /host/<key>             ends the session of key
//   POST /host/<key>/pull          a long poll of at most 25 s, several at once, answered with
//                                  [{ id, method, path, query, headers, body }], where path is the
//                                  raw path with the key, query the raw query, and body the bytes in
//                                  base64. [] when nothing came
//   POST /host/<key>/push/<id>     the answer to request id: the status in x-relay-status, the
//                                  headers in x-relay-headers as a JSON object, and the raw body
//   ANY /<key>/<rest>              a request of a guest, queued for the edit command of key and
//                                  answered with its pushed answer. 502 when no edit command is
//                                  registered for key, and 504 when it does not answer in 60 s
//
// limits: 16 MB per body, 256 MB of bodies held at once, 256 waiting requests per session, 64
// sessions, and a session dropped after 90 s without a pull. hop-by-hop headers, cookies, and credentials are not forwarded

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DEFAULTS = {
  bodyBytes: 16 * 1024 * 1024,
  waiting: 256,
  sessions: 64,
  idleMs: 90_000,
  guestMs: 60_000,
  pullMs: 25_000,
  pullsPerSession: 8,
  // a pull answers at most this many requests, of at most about this many bytes of body
  batchCount: 32,
  batchBytes: 24 * 1024 * 1024,
  pathBytes: 8192,
  headers: 64,
  // the bodies of the guests held at once over every session
  memoryBytes: 256 * 1024 * 1024,
  connections: 2048,
};

const KEY = /^[A-Za-z0-9_-]{22,128}$/;
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'trailers', 'transfer-encoding', 'upgrade', 'host', 'content-length']);
const PRIVATE = new Set(['authorization', 'cookie', 'set-cookie', 'forwarded']);

const digest = (s) => createHash('sha256').update(String(s)).digest();
// a comparison whose time does not depend on where the two strings differ
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && timingSafeEqual(digest(a), digest(b));

// the headers that may cross the relay, without the hop-by-hop ones and those named in Connection
function forwardable(headers, max) {
  const named = new Set(String(headers.connection ?? '').toLowerCase().split(',').map((s) => s.trim()));
  const out = {};
  let count = 0;
  for (const [name, value] of Object.entries(headers)) {
    const k = name.toLowerCase();
    if (HOP.has(k) || PRIVATE.has(k) || named.has(k) || k.startsWith('x-relay-') || k.startsWith('x-forwarded-')) continue;
    if (typeof value !== 'string' && !Array.isArray(value)) continue;
    if (++count > max) break;
    out[k] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

// the body of a request, or null when it is larger than max bytes
async function bodyOf(req, max) {
  if (Number(req.headers['content-length'] ?? 0) > max) return null;
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > max) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function answer(res, status, body = '', headers = {}) {
  if (res.headersSent || res.destroyed) return;
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const type = Buffer.isBuffer(body) || typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json';
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers, 'Content-Length': String(bytes.length) });
  res.end(bytes);
}

/**
 * Starts a relay and returns { port, url, close() }. The limits of DEFAULTS can be lowered by
 * options, e.g. idleMs for a test that does not wait 90 s.
 */
export async function startRelay({ port = 0, host, secret, ...options } = {}) {
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('the secret of the relay must have 16 or more characters');
  const limits = { ...DEFAULTS, ...options };
  // key -> { token, queue, pending, pulls, lastPull }. queue holds the requests not yet pulled,
  // pending every request that waits for its answer, and pulls the waiting pulls
  const sessions = new Map();
  let held = 0;

  function drop(key) {
    const session = sessions.get(key);
    if (!session) return;
    sessions.delete(key);
    for (const pull of session.pulls) pull.done([]);
    for (const entry of session.pending.values()) entry.finish(502, 'the edit command left the session');
  }

  function deliver(session) {
    while (session.pulls.length && session.queue.length) {
      const pull = session.pulls.shift();
      const batch = [];
      let bytes = 0;
      while (session.queue.length && batch.length < limits.batchCount && (batch.length === 0 || bytes + session.queue[0].body.length <= limits.batchBytes)) {
        const item = session.queue.shift();
        bytes += item.body.length;
        batch.push(item);
      }
      pull.done(batch);
    }
  }

  function authorized(req, session) {
    const auth = String(req.headers.authorization ?? '');
    if (!auth.startsWith('Bearer ') || !same(auth.slice(7), secret)) return false;
    return !session || same(req.headers['x-relay-token'], session.token);
  }

  async function hostRequest(req, res, parts) {
    const [key, action, id] = parts;
    if (!KEY.test(key ?? '')) return answer(res, 400, 'the key must be 22 to 128 characters of base64url');
    const session = sessions.get(key);
    if (action === undefined && req.method === 'POST') {
      if (!authorized(req, null)) return answer(res, 401, 'wrong secret');
      if (!session && sessions.size >= limits.sessions) return answer(res, 503, 'the relay holds too many sessions');
      // a session whose edit command has a pull waiting is kept by it, e.g. against a copy of its
      // talk folder. the pulls of a command that died end with its connections, hence it can start again
      if (session && session.pulls.length > 0 && !same(req.headers['x-relay-token'], session.token)) return answer(res, 409, 'this session is already shared by another edit command');
      const token = randomBytes(16).toString('base64url');
      if (session) session.token = token;
      else sessions.set(key, { token, queue: [], pending: new Map(), pulls: [], lastPull: Date.now() });
      return answer(res, 200, { token });
    }
    if (!authorized(req, null)) return answer(res, 401, 'wrong secret');
    if (!session) return answer(res, 404, 'no session of this key');
    if (!authorized(req, session)) return answer(res, 401, 'wrong token');
    if (action === undefined && req.method === 'DELETE') {
      drop(key);
      return answer(res, 200, {});
    }
    if (action === 'pull' && req.method === 'POST' && id === undefined) {
      session.lastPull = Date.now();
      if (session.pulls.length >= limits.pullsPerSession) return answer(res, 429, 'too many pulls');
      const pull = {
        done: (batch) => {
          clearTimeout(pull.timer);
          session.pulls = session.pulls.filter((p) => p !== pull);
          session.lastPull = Date.now();
          answer(res, 200, batch.map(({ id, method, path, query, headers, body }) => ({ id, method, path, query, headers, body: body.toString('base64') })));
        },
        timer: setTimeout(() => pull.done([]), limits.pullMs),
      };
      res.on('close', () => {
        if (session.pulls.includes(pull)) {
          clearTimeout(pull.timer);
          session.pulls = session.pulls.filter((p) => p !== pull);
          session.lastPull = Date.now();
        }
      });
      session.pulls.push(pull);
      return deliver(session);
    }
    if (action === 'push' && req.method === 'POST' && typeof id === 'string') {
      const body = await bodyOf(req, limits.bodyBytes);
      if (!body) return answer(res, 413, 'the answer is larger than the limit of the relay');
      const entry = session.pending.get(id);
      if (!entry) return answer(res, 404, 'no request of this id, it may have timed out');
      const status = Number(req.headers['x-relay-status']);
      let headers = {};
      try {
        const raw = String(req.headers['x-relay-headers'] ?? '{}');
        const parsed = raw.length <= 16384 ? JSON.parse(raw) : {};
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) headers = forwardable(Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string' && !/[\r\n]/.test(v))), limits.headers);
      } catch {}
      if (Number.isInteger(status) && status >= 200 && status <= 599) entry.finish(status, body, headers);
      else entry.finish(502, 'the edit command gave a malformed answer');
      return answer(res, 204);
    }
    return answer(res, 405, 'not a request of the relay protocol');
  }

  async function guestRequest(req, res, url) {
    const q = url.indexOf('?');
    const path = q < 0 ? url : url.slice(0, q);
    const key = path.split('/')[1] ?? '';
    if (!KEY.test(key)) return answer(res, 404, 'not found');
    const session = sessions.get(key);
    if (!session) return answer(res, 502, 'no edit command is registered for this session');
    if (session.pending.size >= limits.waiting) return answer(res, 503, 'the session has too many waiting requests');
    const declared = Number(req.headers['content-length'] ?? 0);
    if (held + Math.min(declared, limits.bodyBytes) > limits.memoryBytes) return answer(res, 503, 'the relay is busy', { Connection: 'close' });
    const id = randomBytes(9).toString('base64url');
    // the place is held before the body is read, so that the cap holds for slow uploads as well
    const entry = {
      bytes: 0,
      release: () => {
        held -= entry.bytes;
        entry.bytes = 0;
      },
      finish: (status, body, headers = {}) => {
        clearTimeout(entry.timer);
        entry.release();
        session.pending.delete(id);
        session.queue = session.queue.filter((item) => item.id !== id);
        answer(res, status, body, headers);
      },
      timer: setTimeout(() => entry.finish(504, 'the edit command did not answer in time'), limits.guestMs),
    };
    session.pending.set(id, entry);
    res.on('close', () => {
      if (session.pending.get(id) === entry) {
        clearTimeout(entry.timer);
        entry.release();
        session.pending.delete(id);
        session.queue = session.queue.filter((item) => item.id !== id);
      }
    });
    const body = await bodyOf(req, limits.bodyBytes);
    if (!body) return entry.finish(413, 'the body is larger than the limit of the relay', { Connection: 'close' });
    if (session.pending.get(id) !== entry || sessions.get(key) !== session) return;
    if (held + body.length > limits.memoryBytes) return entry.finish(503, 'the relay is busy');
    entry.bytes = body.length;
    held += body.length;
    session.queue.push({ id, method: req.method, path, query: q < 0 ? '' : url.slice(q + 1), headers: forwardable(req.headers, limits.headers), body });
    deliver(session);
  }

  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url.length > limits.pathBytes || !url.startsWith('/')) return answer(res, 414, 'the path is too long');
    if (url === '/' && (req.method === 'GET' || req.method === 'HEAD')) return answer(res, 200, 'relay');
    const handler = url.startsWith('/host/') ? hostRequest(req, res, url.split('?')[0].slice('/host/'.length).split('/')) : guestRequest(req, res, url);
    handler.catch(() => answer(res, 500, 'the relay failed'));
  });
  server.headersTimeout = 10_000;
  server.maxConnections = limits.connections;
  server.requestTimeout = Math.max(limits.guestMs, limits.pullMs) + 15_000;

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, session] of sessions) if (session.pulls.length === 0 && now - session.lastPull > limits.idleMs) drop(key);
  }, Math.max(50, Math.min(5000, limits.idleMs / 3)));

  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, host, done);
  });
  const address = server.address();
  return {
    port: address.port,
    url: `http://${address.family === 'IPv6' ? `[${address.address}]` : address.address}:${address.port}`,
    sessions: () => sessions.size,
    // the requests of guests that an edit command pulled and has not answered yet
    pulled: () => [...sessions.values()].reduce((n, s) => n + s.pending.size - s.queue.length, 0),
    close: () =>
      new Promise((done) => {
        clearInterval(sweeper);
        for (const key of [...sessions.keys()]) drop(key);
        server.close(() => done());
        server.closeAllConnections();
      }),
  };
}

const isMain = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  const args = process.argv.slice(2);
  const option = (name) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args[i + 1];
  };
  const port = Number(option('--port') ?? 8787);
  const file = option('--secret-file');
  let secret = process.env.SLIDES_RELAY_SECRET;
  if (file !== undefined) {
    try {
      secret = readFileSync(file, 'utf8').trim();
    } catch (e) {
      process.stderr.write(`The secret file ${file} cannot be read: ${e.message}\n`);
      process.exit(1);
    }
  }
  if (!secret || secret.length < 16) {
    process.stderr.write('Set the secret of the group, of 16 or more characters, in SLIDES_RELAY_SECRET or in the file of --secret-file.\n');
    process.exit(1);
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    process.stderr.write('usage: node scripts/relay.mjs --port N [--host ADDRESS] [--secret-file PATH]\n');
    process.exit(2);
  }
  const relay = await startRelay({ port, host: option('--host'), secret });
  process.stdout.write(`relay listening on port ${relay.port}\n`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => relay.close().then(() => process.exit(0)));
}
