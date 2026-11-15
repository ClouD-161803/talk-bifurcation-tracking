// the relay of the synchronous editor: a reverse HTTP tunnel through which the guests of a session
// reach the edit command of the host, which listens on 127.0.0.1 only. it keeps everything in
// memory, and it never reads or writes a file.
//
// a relay is for one group whose members trust one another, since a deck is a web page and the
// sessions of a relay share its origin. run it with
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
// limits: 16 MB per body, 256 MB of bodies held at once, of which a session holds a quarter at
// most and 4 MB are kept for bodies of at most 64 kB, 256 waiting requests per session, 64
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
  // the part of memoryBytes that the bodies of one session may hold, so that one guest cannot
  // stop the answers of every session
  sessionShare: 1 / 4,
  // the place of memoryBytes kept for bodies of at most smallBytes, e.g. hello, op, and events,
  // which thus still pass when large answers fill the rest
  reserveBytes: 4 * 1024 * 1024,
  smallBytes: 64 * 1024,
  connections: 2048,
};

const KEY = /^[A-Za-z0-9_-]{22,128}$/;
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'trailers', 'transfer-encoding', 'upgrade', 'host', 'content-length']);
// a header that would reach past the session of one key is never forwarded, since the sessions of
// a relay share its origin
const PRIVATE = new Set(['authorization', 'cookie', 'set-cookie', 'forwarded', 'service-worker-allowed', 'clear-site-data']);

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

// the body of a request, null when it is larger than max bytes, and busy when take refuses the
// place of a chunk, which take is asked for before the chunk is kept. a refusal is resolved once
// the rest of the body is read and dropped, up to DRAIN bytes, since Node closes the socket
// after an answer to an unread body, and a client still writing then gets a reset in its place
const DRAIN = 64 * 1024 * 1024;
function bodyOf(req, max, take = () => true) {
  return new Promise((done, fail) => {
    const chunks = [];
    let length = 0;
    let refusal;
    const stop = (value) => {
      refusal = value;
      req.off('data', onData);
      let dropped = 0;
      req.on('data', (c) => {
        dropped += c.length;
        if (dropped > DRAIN) req.destroy();
      });
    };
    const onData = (chunk) => {
      length += chunk.length;
      if (length > max) return stop(null);
      if (!take(chunk.length)) return stop('busy');
      chunks.push(chunk);
    };
    if (Number(req.headers['content-length'] ?? 0) > max) stop(null);
    else if (!take(0)) stop('busy');
    else req.on('data', onData);
    req.once('end', () => done(refusal === undefined ? Buffer.concat(chunks) : refusal));
    req.once('error', fail);
    req.once('close', () => fail(new Error('the request was aborted')));
  });
}

function answer(res, status, body = '', headers = {}) {
  if (res.headersSent || res.destroyed) return;
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const type = Buffer.isBuffer(body) || typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json';
  // lowercase names, so that a forwarded header replaces a default rather than doubling it
  const all = { 'content-type': type, 'cache-control': 'no-store' };
  for (const [k, v] of Object.entries(headers)) all[k.toLowerCase()] = v;
  all['content-length'] = String(bytes.length);
  res.writeHead(status, all);
  res.end(bytes);
}

/**
 * Starts a relay and returns { port, url, close() }. The limits of DEFAULTS can be lowered by
 * options, e.g. idleMs for a test that does not wait 90 s.
 */
export async function startRelay({ port = 0, host, secret, ...options } = {}) {
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('the secret of the relay must have 16 or more characters');
  const limits = { ...DEFAULTS, ...options };
  // key -> { token, queue, pending, pulls, lastPull, held }. queue holds the requests
  // not yet pulled, pending every request that waits for its answer, pulls the waiting pulls, and
  // held the bytes of the bodies of the session
  const sessions = new Map();
  let held = 0;

  // whether n more bytes of a body of which sofar bytes are held fit in the memory, for session.
  // declared is the length of the body announced in its head, or 0. a small body may use the
  // reserve beyond the share of its session as well, e.g. while slow phones read a video
  function fits(session, sofar, n, declared = 0) {
    const reserve = Math.max(sofar + n, declared) <= limits.smallBytes ? limits.reserveBytes : 0;
    if (held + n > limits.memoryBytes - limits.reserveBytes + reserve) return false;
    return session.held + n <= limits.memoryBytes * limits.sessionShare + reserve;
  }
  function hold(session, n) {
    held += n;
    session.held += n;
  }

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
      else sessions.set(key, { token, queue: [], pending: new Map(), pulls: [], lastPull: Date.now(), held: 0 });
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
      if (!session.pending.has(id)) return answer(res, 404, 'no request of this id, it may have timed out');
      let reserved = 0;
      let body;
      try {
        body = await bodyOf(req, limits.bodyBytes, (n) => {
          if (!fits(session, reserved, n)) return false;
          hold(session, n);
          reserved += n;
          return true;
        });
      } finally {
        // the place of the answer passes to entry.finish, which holds it until the guest has read it
        hold(session, -reserved);
      }
      if (body === 'busy') return answer(res, 503, 'the relay is busy');
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
    if (!fits(session, 0, Math.min(declared, limits.bodyBytes), declared)) {
      await bodyOf(req, limits.bodyBytes, () => false);
      return answer(res, 503, 'the relay is busy', { Connection: 'close' });
    }
    const id = randomBytes(9).toString('base64url');
    const entry = {
      bytes: 0,
      release: () => {
        hold(session, -entry.bytes);
        entry.bytes = 0;
      },
      finish: (status, body, headers = {}) => {
        clearTimeout(entry.timer);
        entry.release();
        session.pending.delete(id);
        session.queue = session.queue.filter((item) => item.id !== id);
        if (res.destroyed || res.writableEnded) return;
        // an answer is held until the guest has read it, and a guest that stops reading is dropped
        const size = Buffer.isBuffer(body) ? body.length : 0;
        hold(session, size);
        res.once('close', () => hold(session, -size));
        res.setTimeout(limits.guestMs, () => res.destroy());
        answer(res, status, body, headers);
      },
      timer: null,
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
    // each chunk is counted against memoryBytes while it is read, so that the cap holds for slow
    // uploads and for a chunked body that declares no length
    const body = await bodyOf(req, limits.bodyBytes, (n) => {
      if (session.pending.get(id) !== entry || !fits(session, entry.bytes, n, declared)) return false;
      hold(session, n);
      entry.bytes += n;
      return true;
    });
    if (session.pending.get(id) !== entry || sessions.get(key) !== session) return;
    if (body === 'busy') return entry.finish(503, 'the relay is busy', { Connection: 'close' });
    if (!body) return entry.finish(413, 'the body is larger than the limit of the relay', { Connection: 'close' });
    session.queue.push({ id, method: req.method, path, query: q < 0 ? '' : url.slice(q + 1), headers: forwardable(req.headers, limits.headers), body });
    // the time of the edit command starts once the body is read, and requestTimeout bounds the upload
    entry.timer = setTimeout(() => entry.finish(504, 'the edit command did not answer in time'), limits.guestMs);
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
    // the bytes of bodies held at once, against memoryBytes
    held: () => held,
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
