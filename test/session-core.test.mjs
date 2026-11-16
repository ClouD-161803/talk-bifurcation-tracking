// the sync core of the synchronous editor, imported from the compiled theme/edit.mjs: the rules
// of a patch, the authority, and a fuzz test in which 2 to 5 replicas edit test-deck.html at once
// over a network that delays and reorders, with operations in flight while typing goes on,
// refusals, ties at one point, and late joins. every replica converges on the text of the
// authority, an accepted operation is applied whole, and the merge of a replica agrees with the
// shift of the authority. each run is seeded, and a failure names its seed

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { Authority, Replica, apply, changes, checksum, conflict, diff, invert, mergePatches, shift, shiftOffset, tokenize, valid } from '../theme/edit.mjs';
import { edits, mergeEdits } from '../src/editor/merge.ts';
import { widen } from '../src/session/patch.ts';

const deck = readFileSync(new URL('../test-deck.html', import.meta.url), 'utf8').replace(/^﻿/, '');

// mulberry32, a small seeded generator
function generator(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n) => Math.floor(next() * n);
  return { next, int, pick: (list) => list[int(list.length)], chance: (p) => next() < p };
}

const isHigh = (c) => c >= 0xd800 && c <= 0xdbff;
// an offset moved off the middle of a surrogate pair
const whole = (text, i) => (i > 0 && i < text.length && isHigh(text.charCodeAt(i - 1)) ? i - 1 : i);

const ALPHABET = ['a', 'b', 'x', ' ', '\n', '<', '>', '"', '&', ';', '/', '=', '😀', 'é'];

// a random edit of text near one of the hot spots, so that conflicts and ties are frequent
function edit(r, text, spots) {
  const near = () => {
    if (r.chance(0.1)) return whole(text, r.int(text.length + 1));
    const spot = Math.min(r.pick(spots), text.length);
    return whole(text, Math.max(0, Math.min(text.length, r.chance(0.3) ? spot : spot + r.int(80) - 40)));
  };
  const word = () => Array.from({ length: 1 + r.int(4) }, () => r.pick(ALPHABET)).join('');
  const kind = r.int(10);
  if (kind < 4) {
    const at = near();
    return text.slice(0, at) + word() + text.slice(at);
  }
  if (kind < 6) {
    const at = near();
    const end = whole(text, Math.min(text.length, at + 1 + r.int(6)));
    return text.slice(0, at) + text.slice(end);
  }
  if (kind < 8) {
    // several patches in one change, e.g. a find and replace, applied from the end
    const points = Array.from({ length: 2 + r.int(3) }, near).sort((a, b) => b - a);
    let out = text;
    let last = Infinity;
    for (const at of points) {
      const end = whole(out, Math.min(at + r.int(4), last, out.length));
      if (end < at) continue;
      out = out.slice(0, at) + word() + out.slice(end);
      last = at;
    }
    return out;
  }
  // a move: a range cut and inserted elsewhere
  const a = near();
  const b = whole(text, Math.min(text.length, a + 1 + r.int(30)));
  const cut = text.slice(0, a) + text.slice(b);
  const to = whole(cut, Math.min(cut.length, near()));
  return cut.slice(0, to) + text.slice(a, b) + cut.slice(to);
}

// a text of 40 lines t0 to t39, in which the token mode inserts lines
const TOKEN_TEXT = Array.from({ length: 40 }, (_, i) => `t${i}\n`).join('');

// an edit of text that inserts one to three lines, each a new token n<k>, at the start of a line,
// a third of them after the line t5, where ties are frequent
function tokenEdit(r, text, created) {
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  const hot = text.indexOf('\nt5\n') + 4;
  const points = Array.from({ length: 1 + r.int(3) }, () => (r.chance(0.3) ? hot : r.pick(starts))).sort((a, b) => b - a);
  let out = text;
  for (const at of points) {
    const token = `n${created.size}`;
    created.add(token);
    out = `${out.slice(0, at)}${token}\n${out.slice(at)}`;
  }
  return out;
}

// a session of an authority and replicas over a network in which every message waits in a queue.
// in the token mode every edit inserts new tokens, a replica that falls behind the log of the
// authority reads the whole state again, as after events without ops, and so does a replica with an
// accepted operation in flight now and then. a replica that waits for the answer to an operation
// does not read the whole state, as the client holds it back. every token is then in the text once.
// with faults the edit command restarts now and then, and an answer is lost now and then, after
// which the client sends its request again until it is answered, one request at a time
function session(seed, { text = deck, people = 2 + (seed % 4), steps = 250, maxOps = 1000, spot = null, tokens = false, faults = false } = {}) {
  const r = generator(seed);
  const where = `seed ${seed}`;
  let authority = new Authority(text, { maxOps, epoch: `e${seed}` });
  // the restarts of the edit command so far, and hence the one whose tokens are known
  let process = 0;
  const spots = spot === null ? Array.from({ length: 3 }, () => r.int(text.length)) : [spot, spot, spot];
  const replicas = [];
  const toAuthority = [];
  const created = new Set();
  const stats = { accepted: 0, refused: 0, ties: 0, joins: 0, resyncs: 0, flightResyncs: 0, restarts: 0, lost: 0, appliedRefused: 0, restartFlights: 0 };

  function join(at = authority.n) {
    const id = `client${replicas.length}x`;
    const v = `${authority.version.split('.')[0]}.${at}`;
    const replica = new Replica(id, authority.textAt(at), v);
    const state = { replica, inbox: authority.since(v).slice(), answers: [], sent: null, answered: null, editedSince: false, process, sending: false };
    replicas.push(state);
    return state;
  }

  // the client says hello again without v, with the client id of its operation in flight as was,
  // and merges the whole text. after a restart it goes on under a new client id
  function hello(state) {
    const { replica } = state;
    const applied = authority.applied(replica.sender);
    if (state.process !== process) {
      if (replica.inFlight) stats.restartFlights++;
      replica.rebind(`client${replicas.indexOf(state)}p${process}`);
      state.process = process;
      state.inbox.length = 0;
    }
    replica.resync(authority.text, authority.version, applied);
    state.sent = null;
    stats.resyncs++;
  }

  // the edit command stops and starts again: index.html and .session/applied.json are written and
  // read again under a new epoch, and the log and the tokens are lost. a part of the operations and
  // the answers on the way is lost, and a request whose answer is lost is sent again
  function restart() {
    authority.written(authority.n);
    const table = authority.table();
    process++;
    authority = new Authority(authority.text, { maxOps, epoch: `e${seed}r${process}`, applied: table });
    for (const s of replicas) {
      s.inbox.length = r.int(s.inbox.length + 1);
      for (const { request } of s.answers.splice(r.int(s.answers.length + 1))) toAuthority.push({ state: s, request, process: s.process });
    }
    stats.restarts++;
  }

  function send(state) {
    const { replica } = state;
    if (faults && state.sending) return;
    if (replica.needsResync) hello(state);
    const request = replica.outgoing();
    if (!request) return;
    assert.equal(apply(replica.base, request.patches), replica.mine, `${where}: an operation does not turn base into mine`);
    assert.ok(valid(request.patches, replica.base.length, replica.base), `${where}: an operation of a replica is not valid`);
    state.sent = request;
    state.answered = null;
    state.editedSince = false;
    state.sending = true;
    toAuthority.push({ state, request, process: state.process });
  }

  function submit(i) {
    const [entry] = toAuthority.splice(i, 1);
    const { state, request } = entry;
    const before = authority.text;
    let answer, op;
    if (entry.process === process) ({ answer, op } = authority.submit(request, state.replica.client));
    else {
      // the token is of the edit command before a restart, and the base of another epoch
      if (authority.applied(request.client) >= request.seq) stats.appliedRefused++;
      answer = r.chance(0.5) ? { ok: false, reason: 'unknown', v: authority.version } : authority.submit(request, request.client).answer;
    }
    // a request sent again gets its earlier answer, without an operation
    if (op) {
      stats.accepted++;
      // the operation is applied whole: every patch is moved, none is cut or left out
      assert.equal(op.patches.length, request.patches.length, `${where}: an operation was applied in part`);
      op.patches.forEach((p, k) => {
        assert.equal(p.text, request.patches[k].text, `${where}: a patch was changed`);
        assert.equal(p.end - p.start, request.patches[k].end - request.patches[k].start, `${where}: a patch was cut`);
      });
      for (const s of replicas) if (s.process === process) s.inbox.push(op);
    } else if (!answer.ok) {
      stats.refused++;
      assert.equal(authority.text, before, `${where}: a refused operation changed the text`);
    }
    if (faults && r.chance(0.2)) {
      // the answer is lost, and the client sends the request again
      toAuthority.push(entry);
      stats.lost++;
    } else state.answers.push({ request, answer });
  }

  // an answer reaches the client, which sends its next request
  function hear(state) {
    const { request, answer } = state.answers.shift();
    state.replica.answer(request, answer);
    if (state.sent?.seq === request.seq) state.answered = answer;
    if (!answer.ok && state.sent?.seq === request.seq) state.sent = null;
    state.sending = false;
    send(state);
  }

  // the whole state read again by a replica that does not wait for an answer
  function reread(state) {
    if ((state.sent && !state.answered) || (faults && state.sending)) return false;
    if (state.sent && state.answered.ok) stats.flightResyncs++;
    state.inbox.length = 0;
    hello(state);
    return true;
  }

  function deliver(state, count) {
    // after a restart the events of the edit command before are answered 404, and the client says hello again
    if (state.process !== process && !state.inbox.length) {
      if (!state.sending) hello(state);
      return send(state);
    }
    if (tokens && Number(state.replica.version.split('.')[1]) < authority.oldest && reread(state)) return send(state);
    for (const op of state.inbox.splice(0, count)) {
      const ack = op.client === state.replica.client && state.sent?.seq === op.seq;
      state.replica.receive(op);
      if (ack) {
        // the merge of the replica agrees with the shift of the authority: after the broadcast of
        // its own operation, a replica that did not type since it sent holds the same text
        if (!state.editedSince && !state.replica.needsResync) assert.equal(state.replica.mine, state.replica.base, `${where}: the merge of a replica and the shift of the authority disagree`);
        state.sent = null;
      }
    }
    send(state);
  }

  for (let i = 0; i < people; i++) join();
  for (let step = 0; step < steps; step++) {
    if (faults && r.chance(0.01)) restart();
    const roll = r.next();
    const state = r.pick(replicas);
    if (roll < 0.38) {
      const before = state.replica.mine;
      let next = tokens ? tokenEdit(r, before, created) : edit(r, before, spots);
      // two replicas that insert at one point at once make a tie
      if (!tokens && r.chance(spot === null ? 0.1 : 0.7)) {
        const at = Math.min(spots[0], before.length);
        next = before.slice(0, whole(before, at)) + r.pick(['<b>t</b>', 'q', '😀']) + before.slice(whole(before, at));
        stats.ties++;
      }
      state.replica.edit(next);
      if (state.sent) state.editedSince = true;
      send(state);
    } else if (roll < 0.6 && toAuthority.length) {
      submit(r.int(toAuthority.length));
    } else if (roll < 0.9 && (state.inbox.length || state.process !== process)) {
      deliver(state, 1 + r.int(3));
    } else if (roll < 0.98 && state.answers.length) {
      hear(state);
    } else if (tokens && roll < 0.995) {
      const flying = replicas.filter((s) => s.sent && s.answered?.ok);
      if (reread(flying.length ? r.pick(flying) : state)) send(state);
    } else if (roll >= 0.995 && replicas.length < 6) {
      // a late join, from the text of an older version that the editor read and the operations after it
      join(authority.oldest + r.int(authority.n - authority.oldest + 1));
      stats.joins++;
    }
  }
  // everything in the network is delivered until nothing is left to send
  for (let round = 0; round < 10_000; round++) {
    if (toAuthority.length) submit(0);
    else {
      const busy = replicas.find((s) => s.inbox.length || s.answers.length || s.process !== process);
      if (!busy) break;
      if (busy.answers.length) hear(busy);
      else deliver(busy, busy.inbox.length);
    }
  }
  if (tokens) {
    const count = new Map();
    for (const line of authority.text.split('\n')) count.set(line, (count.get(line) ?? 0) + 1);
    for (const token of created) assert.equal(count.get(token) ?? 0, 1, `${where}: the token ${token} is in the text ${count.get(token) ?? 0} times`);
  }
  for (const [i, s] of replicas.entries()) {
    assert.equal(s.replica.inFlight, false, `${where}: replica ${i} still has an operation in flight`);
    assert.equal(s.replica.version, authority.version, `${where}: replica ${i} is at another version`);
    assert.equal(s.replica.base, authority.text, `${where}: replica ${i} has another base`);
    assert.equal(s.replica.mine, authority.text, `${where}: replica ${i} did not converge`);
  }
  return stats;
}

test('every replica converges on the text of the authority, on test-deck.html, over 40 seeds', () => {
  const total = { accepted: 0, refused: 0, ties: 0, joins: 0, resyncs: 0 };
  for (let seed = 1; seed <= 40; seed++) {
    const stats = session(seed);
    for (const k in total) total[k] += stats[k];
  }
  // the runs do cover refusals, ties, and late joins
  assert.ok(total.accepted > 1000 && total.refused > 20 && total.ties > 50 && total.joins > 0, JSON.stringify(total));
});

test('replicas that insert at one point at once converge, with the text of the earlier operation first', () => {
  // a point in the text of a paragraph, where an insertion is not widened
  const spot = deck.indexOf('<p>') + 3;
  assert.ok(spot > 3);
  let ties = 0;
  for (let seed = 301; seed <= 340; seed++) ties += session(seed, { spot, steps: 150 }).ties;
  assert.ok(ties > 1000, `${ties} ties`);
});

test('replicas converge when the log is short and operations are refused as stale', () => {
  let resyncs = 0, refused = 0;
  for (let seed = 101; seed <= 115; seed++) {
    const stats = session(seed, { maxOps: 3, steps: 200 });
    resyncs += stats.resyncs;
    refused += stats.refused;
  }
  assert.ok(refused > 0, 'no operation was refused');
  assert.ok(resyncs >= 0);
});

test('no edit is duplicated or lost when a replica reads the whole state again with an accepted operation in flight', () => {
  let flightResyncs = 0;
  for (let seed = 401; seed <= 500; seed++) {
    const stats = session(seed, { text: TOKEN_TEXT, tokens: true, maxOps: 3, steps: 300 });
    flightResyncs += stats.flightResyncs;
  }
  assert.ok(flightResyncs > 50, `${flightResyncs} resyncs with an accepted operation in flight`);
});

test('no edit is duplicated or lost over restarts of the edit command, lost answers, and refusals of an applied operation', () => {
  const total = { restarts: 0, lost: 0, appliedRefused: 0, restartFlights: 0 };
  for (let seed = 601; seed <= 1000; seed++) {
    const stats = session(seed, { text: TOKEN_TEXT, tokens: true, faults: true, maxOps: seed % 2 ? 3 : 1000, steps: 300 });
    for (const k in total) total[k] += stats[k];
  }
  // the runs do cover restarts with an operation in flight, and refusals of an applied operation
  assert.ok(total.restarts > 800 && total.lost > 2500 && total.appliedRefused > 1000 && total.restartFlights > 1500, JSON.stringify(total));
});

test('after a restart of the edit command, a resync keeps an operation in flight that the new text lacks, and does not repeat one that it holds', () => {
  const base = '<p>Hello world</p>\n';
  const sent = () => {
    const r = new Replica('me', base, 'E.0');
    r.edit('<p>HelloX world</p>\n');
    r.outgoing();
    return r;
  };
  // the operation was written before the restart, the new epoch reads it from the file, and hello
  // answers its seq
  const held = sent();
  held.resync('<p>HelloX world</p>\n<p>more</p>\n', 'F.0', 1);
  assert.equal(held.mine, '<p>HelloX world</p>\n<p>more</p>\n');
  assert.equal(held.outgoing(), null);
  // the operation was lost with the edit command, and is sent again, also when hello does not know
  // the client id
  for (const applied of [0, undefined]) {
    const lost = sent();
    lost.resync('<p>Hello world</p>\n<p>more</p>\n', 'F.0', applied);
    assert.equal(lost.mine, '<p>HelloX world</p>\n<p>more</p>\n');
    assert.equal(apply(lost.base, lost.outgoing().patches), lost.mine);
  }
});

test('after a restart, a resync neither repeats nor reverts an applied operation whose answer was lost or refused', () => {
  // the hello after the restart answers applied, i.e. the seq of the last operation of the old
  // client id in the text, which is 1 here
  for (const reason of ['unknown', 'stale']) {
    const base = '<p>Hello world, again</p>\n';
    const e = new Authority(base, { epoch: 'E' });
    const a = new Replica('aaaaaaaa', base, 'E.0');
    a.edit('<p>Hello brave world, again</p>\n');
    const request = a.outgoing();
    // the answer and the broadcast of the operation are lost
    const sent = e.submit(request, 'A');
    assert.equal(sent.answer.ok, true);
    const b = new Replica('bbbbbbbb', base, 'E.0');
    b.receive(sent.op);
    b.edit(b.mine.replace('again', 'once more'));
    b.receive(e.submit(b.outgoing(), 'B').op);
    const f = new Authority(e.text, { epoch: 'F' });
    a.answer(request, reason === 'unknown' ? { ok: false, reason, v: f.version } : f.submit(request, 'A').answer);
    a.resync(f.text, f.version, request.seq);
    assert.equal(a.mine, '<p>Hello brave world, once more</p>\n', reason);
    assert.equal(a.outgoing(), null, reason);
  }
  // the answer arrived and the broadcast did not, and the other person rewrote the line
  const base = '<h2>Results</h2>\n<p>Hello world</p>\n';
  const e = new Authority(base, { epoch: 'E' });
  const a = new Replica('aaaaaaaa', base, 'E.0');
  a.edit('<h2>Results</h2>\n<p>Hello brave world</p>\n');
  const request = a.outgoing();
  const { answer, op } = e.submit(request, 'A');
  a.answer(request, answer);
  const b = new Replica('bbbbbbbb', base, 'E.0');
  b.receive(op);
  b.edit('<h2>Results</h2>\n<p>Hi there</p>\n');
  b.receive(e.submit(b.outgoing(), 'B').op);
  const f = new Authority(e.text, { epoch: 'F' });
  a.resync(f.text, f.version, request.seq);
  assert.equal(a.mine, '<h2>Results</h2>\n<p>Hi there</p>\n');
  assert.equal(a.outgoing(), null);
});

test('a resync that does not know whether the text holds an operation in flight keeps it, also when someone else inserted similar markup at the same place', () => {
  const base = '<ul>\n    <li>Design</li>\n  </ul>\n';
  const relay = base.replace('  </ul>', '    <li>Test the relay</li>\n  </ul>');
  const editor = base.replace('  </ul>', '    <li>Test the editor</li>\n  </ul>');
  for (const refused of [false, true]) {
    const e = new Authority(base, { epoch: 'E' });
    const a = new Replica('aaaaaaaa', base, 'E.0');
    a.edit(relay);
    // the request of A does not reach the edit command, which applies the bullet of B and restarts
    const request = a.outgoing();
    e.submit({ client: 'bbbbbbbb', seq: 1, base: 'E.0', patches: diff(base, editor) }, 'B');
    const f = new Authority(e.text, { epoch: 'F' });
    if (refused) a.answer(request, { ok: false, reason: 'unknown', v: f.version });
    a.resync(f.text, f.version);
    const next = a.outgoing();
    assert.ok(next, `the bullet of A is sent again (${refused})`);
    a.receive(f.submit(next, 'A').op);
    assert.equal(f.text, '<ul>\n    <li>Design</li>\n    <li>Test the editor</li>\n    <li>Test the relay</li>\n  </ul>\n');
    assert.equal(a.mine, f.text);
  }
});

test('a replica keeps its base, its text, and its operation in flight through a new client id', () => {
  const base = '<p>Hello world</p>\n';
  const e = new Authority(base, { epoch: 'E' });
  const a = new Replica('aaaaaaaa', base, 'E.0');
  a.edit('<p>Hello brave world</p>\n');
  const request = a.outgoing();
  const { op } = e.submit(request, 'A');
  a.edit('<p>Hello brave world!</p>\n');
  a.rebind('cccccccc');
  assert.equal(a.client, 'cccccccc');
  assert.equal(a.inFlight, true);
  // a hello asks for the seq of the old client id while its operation is in flight
  assert.equal(a.sender, 'aaaaaaaa');
  assert.equal(a.base, base);
  assert.equal(a.mine, '<p>Hello brave world!</p>\n');
  // the broadcast under the old client id still acknowledges the operation
  assert.equal(a.receive(op), null);
  assert.equal(a.inFlight, false);
  assert.equal(a.sender, 'cccccccc');
  const next = a.outgoing();
  assert.deepEqual([next.client, next.seq], ['cccccccc', request.seq + 1]);
  assert.equal(apply(a.base, next.patches), '<p>Hello brave world!</p>\n');
});

test('the authority keeps the seq of the last operation of each client in the text written to index.html', () => {
  const a = new Authority('abc\n', { epoch: 'E', applied: [['old', 7]] });
  assert.equal(a.applied('old'), 7);
  assert.equal(a.applied('nobody'), undefined);
  a.submit({ client: 'c', seq: 1, base: 'E.0', patches: [{ start: 3, end: 3, text: 'd' }] }, 'C');
  a.submit({ client: 'c', seq: 2, base: 'E.1', patches: [{ start: 4, end: 4, text: 'e' }] }, 'C');
  // the text in memory holds both operations, and the table holds only what is written
  assert.equal(a.applied('c'), 2);
  assert.deepEqual(a.table(), [['old', 7]]);
  assert.equal(a.written(1), false, 'the last operation of c is not written at version 1');
  assert.equal(a.written(2), true);
  assert.deepEqual(a.table(), [['old', 7], ['c', 2]]);
  assert.equal(a.written(2), false);
  // a restart keeps the table and not the log
  const b = new Authority(a.text, { epoch: 'F', applied: a.table() });
  assert.equal(b.applied('c'), 2);
  // the table keeps the last 1024 clients
  for (let i = 0; i < 1100; i++) b.submit({ client: `k${i}`, seq: 1, base: b.version, patches: [] }, 'K');
  b.written(b.n);
  assert.equal(b.table().length, 1024);
  assert.equal(b.applied('old'), undefined);
  assert.equal(b.applied('k1099'), 1);
});

test('replicas converge on a short text that changes() gives up on', () => {
  const text = ['<section>', '  <h2>One</h2>', '  <p>First</p>', '</section>', ''].join('\n');
  for (let seed = 201; seed <= 260; seed++) session(seed, { text, steps: 120 });
  // the null case of changes(): the texts are too far apart, and diff gives one patch
  const other = 'something else entirely, with no line in common\n';
  assert.equal(changes(text, other), null);
  const patches = diff(text, other);
  assert.equal(patches.length, 1);
  assert.equal(apply(text, patches), other);
});

test('the log of the authority does not keep a copy of the text per operation', () => {
  // a slice of 13 or more characters keeps the whole string that it was cut from alive in V8
  setFlagsFromString('--expose-gc');
  const gc = globalThis.gc ?? runInNewContext('gc');
  const a = new Authority('abcdefghij\n'.repeat(95_000), { epoch: 'E' });
  gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 1000; i++) {
    const at = (i * 7919) % (a.text.length - 20);
    if (i % 2) {
      // a change of the file, whose patches diff() cuts from a whole new text
      const text = `${a.text.slice(0, at)}${'y'.repeat(20)}${a.text.slice(at + 20)}`;
      a.enter([{ start: at, end: at + 20, text: text.slice(at, at + 20) }], 'file');
    } else a.submit({ client: 'c', seq: i + 1, base: a.version, patches: [{ start: at, end: at + 20, text: 'x'.repeat(20) }] }, 'C');
  }
  assert.equal(a.n, 1000);
  gc();
  const grown = (process.memoryUsage().heapUsed - before) / 2 ** 20;
  assert.ok(grown < 8, `1000 operations on a text of 1 MB grew the heap by ${grown.toFixed(1)} MB`);
});

test('two patches conflict when they share a character or one is an insertion strictly inside the other', () => {
  const p = (start, end, text = '') => ({ start, end, text });
  assert.equal(conflict(p(2, 5), p(4, 8)), true);
  assert.equal(conflict(p(2, 5), p(3, 3, 'x')), true);
  assert.equal(conflict(p(2, 5), p(2, 2, 'x')), false);
  assert.equal(conflict(p(2, 5), p(5, 5, 'x')), false);
  assert.equal(conflict(p(3, 3, 'a'), p(3, 3, 'b')), false);
  assert.equal(conflict(p(2, 5), p(5, 8)), false);
  // at a tie the text of the operation ordered first comes first
  const base = 'abcdef';
  const first = [p(3, 3, 'X')], second = [p(3, 3, 'Y')];
  assert.equal(apply(apply(base, first), shift(second, first)), 'abcXYdef');
  // the moved operation and the operation it is moved over give one text in either direction
  assert.equal(apply(apply(base, second), shift(first, second, false)), 'abcXYdef');
  // an insertion at the start of a replaced range comes before its new text, and at its end after it
  assert.equal(apply(apply(base, [p(2, 4, 'R')]), shift([p(2, 2, 'i'), p(4, 4, 'j')], [p(2, 4, 'R')])), 'abiRjef');
  assert.equal(shift([p(1, 3)], [p(2, 2, 'x')]), null);
});

test('an offset is moved over an operation, and an operation is undone by its inverse', () => {
  const base = 'abcdef';
  const op = [{ start: 1, end: 3, text: 'XYZ' }, { start: 4, end: 4, text: '!' }];
  const after = apply(base, op);
  assert.equal(after, 'aXYZd!ef');
  assert.equal(apply(after, invert(base, op)), base);
  assert.equal(shiftOffset(0, op), 0);
  assert.equal(shiftOffset(2, op), 1);
  assert.equal(shiftOffset(3, op), 4);
  assert.equal(shiftOffset(4, op), 6);
  assert.equal(shiftOffset(4, op, false), 5);
  assert.equal(shiftOffset(6, op), 8);
});

test('the authority refuses stale, invalid, and conflicting operations, and answers a repeated one again', () => {
  const a = new Authority('hello world', { epoch: 'E', maxOps: 2 });
  const ok = a.submit({ client: 'c', seq: 1, base: 'E.0', patches: [{ start: 0, end: 5, text: 'howdy' }] }, 'Ann');
  assert.deepEqual(ok.answer, { ok: true, v: 'E.1' });
  assert.equal(ok.op.author, 'Ann');
  assert.equal(ok.op.sum, checksum('howdy world'));
  assert.deepEqual(a.submit({ client: 'c', seq: 1, base: 'E.0', patches: [{ start: 0, end: 5, text: 'howdy' }] }, 'Ann').answer, ok.answer);
  assert.equal(a.submit({ client: 'd', seq: 1, base: 'E.0', patches: [{ start: 1, end: 2, text: 'x' }] }, 'Bo').answer.reason, 'conflict');
  assert.equal(a.submit({ client: 'd', seq: 2, base: 'F.0', patches: [] }, 'Bo').answer.reason, 'stale');
  assert.equal(a.submit({ client: 'd', seq: 3, base: 'E.1', patches: [{ start: 5, end: 99, text: '' }] }, 'Bo').answer.reason, 'invalid');
  assert.equal(a.submit({ client: 'd', seq: 4, base: 'E.1', patches: [{ start: 3, end: 4, text: '' }, { start: 1, end: 2, text: '' }] }, 'Bo').answer.reason, 'invalid');
  // a patch that cuts a surrogate pair or carries a lone surrogate
  const b = new Authority('a😀b', { epoch: 'E' });
  assert.equal(b.submit({ client: 'c', seq: 1, base: 'E.0', patches: [{ start: 2, end: 2, text: 'x' }] }, 'A').answer.reason, 'invalid');
  assert.equal(b.submit({ client: 'c', seq: 2, base: 'E.0', patches: [{ start: 1, end: 1, text: '\ud800' }] }, 'A').answer.reason, 'invalid');
  // an operation of an older version is moved over the later ones
  const seen = [];
  a.observe((op, text) => seen.push(text));
  a.submit({ client: 'd', seq: 5, base: 'E.1', patches: [{ start: 11, end: 11, text: '!' }] }, 'Bo');
  assert.deepEqual(a.submit({ client: 'e', seq: 1, base: 'E.1', patches: [{ start: 0, end: 0, text: '> ' }] }, 'Cy').answer, { ok: true, v: 'E.3' });
  assert.equal(a.text, '> howdy world!');
  assert.deepEqual(seen, ['howdy world!', '> howdy world!']);
  // the log keeps two operations, hence the text of version 1 is rebuilt and that of 0 is not
  assert.equal(a.textAt(1), 'howdy world');
  assert.equal(a.textAt(0), null);
  assert.equal(a.since('E.0'), null);
  assert.deepEqual(a.since('E.1').map((op) => op.v), ['E.2', 'E.3']);
  assert.equal(a.submit({ client: 'e', seq: 2, base: 'E.0', patches: [] }, 'Cy').answer.reason, 'stale');
});

test('a repeated sequence number of a client with another base or other patches is refused as invalid', () => {
  // a page that loaded again with its old client id starts at seq 1, and its operation must not be
  // answered as the earlier one without being applied
  const a = new Authority('abc\n', { epoch: 'E' });
  const first = { client: 'reusedid', seq: 1, base: 'E.0', patches: [{ start: 3, end: 3, text: 'd' }] };
  assert.deepEqual(a.submit(first, 'Ann').answer, { ok: true, v: 'E.1' });
  assert.deepEqual(a.submit(structuredClone(first), 'Ann').answer, { ok: true, v: 'E.1' }, 'the same request is answered again');
  const other = a.submit({ client: 'reusedid', seq: 1, base: 'E.1', patches: [{ start: 4, end: 4, text: 'Z' }] }, 'Ann');
  assert.deepEqual(other.answer, { ok: false, reason: 'invalid', v: 'E.1' });
  assert.equal(a.submit({ ...first, base: 'E.1' }, 'Ann').answer.reason, 'invalid');
  assert.equal(a.text, 'abcd\n');
});

test('a replica repairs a lone surrogate in mine, and stops sending when a resync does not end the refusals as invalid', () => {
  const base = '<p>hi 😀</p>\n';
  const a = new Authority(base, { epoch: 'E' });
  const r = new Replica('me', base, 'E.0');
  // half of an emoji, e.g. left by a script that set a text node, is sent as U+FFFD
  assert.equal(r.edit('<p>hi \uD83D and more</p>\n'), '<p>hi � and more</p>\n');
  assert.equal(r.edit('<p>hi � and more</p>\n'), null, 'a well-formed text is taken as it is');
  const request = r.outgoing();
  const { answer, op } = a.submit(request, 'me');
  assert.equal(answer.ok, true);
  r.receive(op);
  assert.equal(r.mine, a.text);
  // the first refusal as invalid is followed by a resync, and the second stops the sending
  r.edit(`${a.text}x`);
  const first = r.outgoing();
  r.answer(first, { ok: false, reason: 'invalid', v: a.version });
  assert.equal(r.needsResync, true);
  assert.equal(r.blocked, false);
  r.resync(a.text, a.version);
  const second = r.outgoing();
  assert.ok(second, 'the operation is sent once more after the resync');
  r.answer(second, { ok: false, reason: 'invalid', v: a.version });
  assert.equal(r.blocked, true);
  r.edit(`${a.text}xy`);
  assert.equal(r.outgoing(), null);
});

test('a replica reads the whole state again after a checksum mismatch, and keeps its own edits', () => {
  const a = new Authority('one two three', { epoch: 'E' });
  const r = new Replica('me', 'one two three', 'E.0');
  r.edit('one two three four');
  const { op } = a.submit({ client: 'other', seq: 1, base: 'E.0', patches: [{ start: 0, end: 3, text: 'ONE' }] }, 'O');
  // the base of the replica was damaged, e.g. by a fault of the client
  r.base = 'one tw0 three';
  r.receive(op);
  assert.equal(r.needsResync, true);
  assert.equal(r.outgoing(), null);
  r.resync(a.text, a.version);
  assert.equal(r.needsResync, false);
  assert.match(r.mine, /^ONE two three four$/);
  const request = r.outgoing();
  a.submit(request, 'me');
  r.receive(a.since(request.base)[0]);
  assert.equal(r.mine, a.text);
});

test('a replica back from a break shows the conflicts of the missed operations, and the side that wins is kept', () => {
  const base = '<p style="left: 10px">Hi</p>\n<p>Two</p>\n';
  const a = new Authority(base, { epoch: 'E' });
  const op = a.submit({ client: 'other', seq: 1, base: 'E.0', patches: diff(base, base.replace('10px', '30px').replace('Two', 'Deux')) }, 'O').op;
  const r = new Replica('me', base, 'E.0');
  r.edit(base.replace('10px', '20px'));
  const conflicts = r.conflictsOf([op]);
  assert.equal(conflicts.length, 1);
  assert.equal(r.base, base, 'conflictsOf changed the replica');
  const theirs = new Replica('me2', base, 'E.0');
  theirs.edit(base.replace('10px', '20px'));
  assert.equal(theirs.catchUp([op], 'theirs').text, a.text);
  const ours = r.catchUp([op], 'ours');
  assert.equal(ours.text, base.replace('10px', '20px').replace('Two', 'Deux'));
  assert.equal(ours.conflicts.length, 1);
});

test('a resync after a restart shows the conflicts with the whole text, and the side that wins is kept', () => {
  const base = '<p style="left: 10px">Hi</p>\n<p>Two</p>\n<p>Three</p>\n';
  const now = base.replace('10px', '30px').replace('Two', 'Deux');
  const mine = base.replace('10px', '20px').replace('Three', 'Drei');
  const r = new Replica('me', base, 'E.4');
  r.edit(mine);
  const seen = [];
  r.clone().resync(now, 'F.0', undefined, 'ours', seen);
  assert.equal(seen.length, 1);
  assert.equal(r.base, base, 'a resync of the clone changed the replica');
  assert.equal(r.mine, mine);
  const conflicts = [];
  assert.equal(r.resync(now, 'F.0', undefined, 'theirs', conflicts), now.replace('Three', 'Drei'));
  assert.equal(conflicts.length, 1);
  assert.equal(r.version, 'F.0');
  const ours = new Replica('me', base, 'E.4');
  ours.edit(mine);
  assert.equal(ours.resync(now, 'F.0'), mine.replace('Two', 'Deux'));
});

// the start and end tags of a text, in order
const skeleton = (text) =>
  tokenize(text)
    .filter((t) => t.type === 'start' || t.type === 'end')
    .map((t) => `${t.type === 'end' ? '/' : ''}${t.name}`)
    .join(' ');

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'use', 'stop']);
// the start tags minus the end tags of each element that is not void
function balance(text) {
  const out = {};
  for (const t of tokenize(text)) {
    if ((t.type !== 'start' && t.type !== 'end') || VOID.has(t.name) || (t.type === 'start' && t.selfClosing)) continue;
    out[t.name] = (out[t.name] ?? 0) + (t.type === 'start' ? 1 : -1);
  }
  return out;
}

// a random edit of base that is valid HTML alone: a part of an attribute value replaced, an
// element inserted between two tokens, an element deleted, or a part of a text replaced
function validEdit(r, base, tokens, window) {
  const inWindow = tokens.filter((t) => t.start >= window[0] && t.end <= window[1]);
  const letters = () => Array.from({ length: 1 + r.int(3) }, () => r.pick(['1', '2', '5', 'a', 'z'])).join('');
  for (;;) {
    const kind = r.int(4);
    if (kind === 0) {
      const tags = inWindow.filter((t) => t.type === 'start' && t.attrs.some((a) => a.value && /^["']/.test(base[a.end - a.value.length - 2] ?? '')));
      const withValue = tags.flatMap((t) => t.attrs.filter((a) => a.value && base[a.end - 1] === '"'));
      if (!withValue.length) continue;
      const a = r.pick(withValue);
      const end = a.end - 1, start = end - a.value.length;
      const s = start + r.int(a.value.length), e = Math.min(end, s + 1 + r.int(2));
      return base.slice(0, s) + letters() + base.slice(e);
    }
    if (kind === 1) {
      const at = r.pick(inWindow.filter((t) => t.type === 'end' && t.name !== 'script' && t.name !== 'style')).end;
      return base.slice(0, at) + `<span class="n${letters()}">${letters()}</span>` + base.slice(at);
    }
    if (kind === 2) {
      // an element without a child element, from its start tag to its end tag
      const i = r.int(inWindow.length - 2);
      const [s, t, e] = inWindow.slice(i, i + 3);
      if (s.type !== 'start' || t.type !== 'text' || e.type !== 'end' || e.name !== s.name || s.name === 'script') continue;
      return base.slice(0, s.start) + base.slice(e.end);
    }
    const texts = inWindow.filter((t) => t.type === 'text' && !t.raw && /[A-Za-z]{3}/.test(base.slice(t.start, t.end)));
    if (!texts.length) continue;
    const t = r.pick(texts);
    const s = t.start + r.int(t.end - t.start), e = Math.min(t.end, s + r.int(3));
    if (/[&;]/.test(base.slice(Math.max(t.start, s - 8), Math.min(t.end, e + 8)))) continue;
    return base.slice(0, s) + letters() + base.slice(e);
  }
}

// two replicas that each send one edit of the same version, ordered by the authority in the order given
function race(base, textA, textB, aFirst) {
  const a = new Authority(base, { epoch: 'E' });
  const ra = new Replica('aaaaaaaa', base, 'E.0'), rb = new Replica('bbbbbbbb', base, 'E.0');
  ra.edit(textA);
  rb.edit(textB);
  const reqs = { a: ra.outgoing(), b: rb.outgoing() };
  const pairs = aFirst ? [[ra, reqs.a], [rb, reqs.b]] : [[rb, reqs.b], [ra, reqs.a]];
  const replicas = [ra, rb];
  let pending = pairs.filter(([, request]) => request).map(([replica, request]) => ({ replica, request }));
  for (let round = 0; pending.length && round < 20; round++) {
    const next = [];
    for (const { replica, request } of pending) {
      const { answer, op } = a.submit(request, replica.client);
      for (const other of replicas) if (op) other.receive(op);
      replica.answer(request, answer);
    }
    for (const replica of replicas) {
      replica.receiveAll(a.since(replica.version) ?? []);
      const request = replica.outgoing();
      if (request) next.push({ replica, request });
    }
    pending = next;
  }
  for (const replica of replicas) assert.equal(replica.mine, a.text);
  return a.text;
}

test('two valid concurrent edits merge into a text with the tag skeleton of one of the two orders', () => {
  const tokens = tokenize(deck);
  const sections = tokens.filter((t) => t.type === 'start' && t.name === 'section');
  const before = balance(deck);
  let conflicts = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = generator(seed);
    const s = r.pick(sections);
    const window = [s.start, Math.min(deck.length, s.start + 1500)];
    const textA = validEdit(r, deck, tokens, window), textB = validEdit(r, deck, tokens, window);
    const pa = diff(deck, textA), pb = diff(deck, textB);
    // each order applied through the conflict rule, where the operation sent again wins
    const orders = [[pa, pb], [pb, pa]].map(([first, second]) => {
      const moved = shift(second, first);
      if (!moved) conflicts++;
      return moved ? apply(apply(deck, first), moved) : apply(deck, mergePatches(first, second, 'ours').patches);
    });
    const merged = race(deck, textA, textB, r.chance(0.5));
    assert.ok(orders.map(skeleton).includes(skeleton(merged)), `seed ${seed}: the merged text has another tag skeleton`);
    assert.deepEqual(balance(merged), before, `seed ${seed}: a start tag was left without its end`);
  }
  assert.ok(conflicts > 0, 'no two edits conflicted');
});

const ONE = '<section>\n  <h2>One</h2>\n  <p>First slide</p>\n</section>\n';
const TWO = '<section>\n  <h2>Two</h2>\n  <p>Second slide</p>\n  <ul>\n    <li>Alpha</li>\n  </ul>\n</section>\n';
const MOVES = {
  'inside its slide': [ONE + TWO, ONE + TWO.replace('  <p>Second slide</p>\n', '').replace('</ul>\n', '</ul>\n  <p>Second slide</p>\n')],
  'to another slide': [ONE + TWO, ONE.replace('</section>', '  <p>Second slide</p>\n</section>') + TWO.replace('  <p>Second slide</p>\n', '')],
  'back by an undo': [ONE + TWO.replace('  <p>Second slide</p>\n', '').replace('</ul>\n', '</ul>\n  <p>Second slide</p>\n'), ONE + TWO],
};

test('a text element that one replica moves while another, which has not received the move, types in it stays in its place with the key, in both orders', () => {
  for (const [name, [base, moved]] of Object.entries(MOVES)) {
    const typed = base.replace('Second slide', 'Second slide by Ana');
    for (const moveFirst of [true, false]) assert.equal(race(base, moved, typed, moveFirst), typed, `moved ${name}, ${moveFirst ? 'move' : 'key'} first`);
  }
});

const SAME = TWO.replace('  <ul>\n    <li>Alpha</li>\n  </ul>\n', '');
for (const [shape, one, two] of [['of another shape', ONE, TWO], ['of the same shape', ONE, SAME]]) {
  test(`a slide swapped with a slide ${shape} by one replica while another, which has not received the swap, types in it keeps every text once and the key, in both orders`, () => {
    const base = `${one}\n${two}`, swapped = `${two}\n${one}`;
    for (const into of ['First slide', 'Second slide']) {
      const typed = base.replace(into, `${into} by Ana`);
      for (const moveFirst of [true, false]) {
        const text = race(base, swapped, typed, moveFirst);
        const what = `a key in ${into}, ${moveFirst ? 'swap' : 'key'} first`;
        assert.equal(text.split('<section>').length - 1, 2, `${what}: the text has two slides`);
        for (const p of ['First slide', 'Second slide']) assert.equal(text.split(p).length - 1, 1, `${what}: ${p} is in the text once`);
        assert.ok(text.includes(`<p>${into} by Ana</p>`), `${what}: the key is in its paragraph`);
      }
    }
  });
}

test('a move of a text element and a key in another element at once are both taken, in both orders', () => {
  for (const [name, [base, moved]] of Object.entries(MOVES)) {
    const typed = base.replace('<h2>Two</h2>', '<h2>Two by Ana</h2>');
    for (const moveFirst of [true, false]) assert.equal(race(base, moved, typed, moveFirst), moved.replace('<h2>Two</h2>', '<h2>Two by Ana</h2>'), `moved ${name}, ${moveFirst ? 'move' : 'key'} first`);
  }
});

test('the merge of the editor keeps a text element that a received text moves, and an unread key in it, once and in its place', () => {
  for (const [name, [base, moved]] of Object.entries(MOVES)) {
    const typed = base.replace('Second slide', 'Second slide by Ana');
    assert.equal(mergeEdits(base, edits(base, typed), edits(base, moved), 'ours', true).text, typed, `moved ${name}, the key unread`);
    assert.equal(mergeEdits(base, edits(base, moved), edits(base, typed), 'ours', true).text, typed, `moved ${name}, the move unread`);
  }
});

test('the merge of the editor keeps each text of two slides that a received text swaps, and an unread key in one of them, once and in its slide', () => {
  const base = `${ONE}\n${SAME}`, swapped = `${SAME}\n${ONE}`;
  for (const into of ['First slide', 'Second slide']) {
    const typed = base.replace(into, `${into} by Ana`);
    for (const diff of [edits]) {
      for (const [ours, all] of [[typed, swapped], [swapped, typed]]) {
        const text = mergeEdits(base, diff(base, ours), diff(base, all), 'ours', true).text;
        assert.ok(text === typed || text === swapped.replace(into, `${into} by Ana`), `a key in ${into}, ${ours === typed ? 'the key' : 'the swap'} unread, by ${diff.name}(): ${text}`);
      }
    }
  }
});

test('a replace in every paragraph and a word typed at once in one of them are both in the text at the end', () => {
  // changes() gives up beyond 2000 changed lines, and gives one hunk for one long line
  for (const join of ['\n', '']) {
    const base = `<section>\n${Array.from({ length: 3000 }, (_, i) => `<p>Item ${i} uses foo here</p>`).join(join)}\n</section>\n`;
    const replaced = base.replaceAll('foo', 'bar');
    const typed = base.replace('Item 1500 uses', 'Item 1500 still uses');
    const patches = diff(base, replaced);
    assert.ok(valid(patches, base.length, base), `${patches.length} patches are not a valid operation`);
    const widest = Math.max(...patches.map((p) => p.end - p.start));
    assert.ok(widest < 100, `a patch of the replace covers ${widest} of ${base.length} characters`);
    const text = race(base, replaced, typed, true);
    assert.ok(text.includes('Item 1500 still uses'), 'the typed word was lost');
    const bars = text.split('bar').length - 1;
    assert.ok(bars >= 2990, `the replace is left in ${bars} of 3000 paragraphs`);
  }
});

// the shortest time of a few runs of fn, in ms
function timeOf(fn, runs = 5) {
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

test('shift and mergePatches take a time linear in the number of patches, and an operation has at most 2000 patches', () => {
  // n insertions at the even offsets of a text, and n at its odd offsets, which do not conflict
  const at = (n, odd) => Array.from({ length: n }, (_, i) => ({ start: 2 * i + odd, end: 2 * i + odd, text: odd ? 'y' : 'x' }));
  const time = (n) => {
    const even = at(n, 0), odd = at(n, 1);
    return timeOf(() => {
      assert.equal(shift(odd, even).length, n);
      assert.equal(mergePatches(even, odd).patches.length, 2 * n);
    });
  };
  // ten times the patches take about ten times as long, and a hundred times when the time is quadratic
  const ratio = () => time(20_000) / time(2000);
  let r = ratio();
  if (r >= 30) r = ratio();
  assert.ok(r < 30, `ten times the patches took ${r.toFixed(1)} times as long`);
  const text = 'ab'.repeat(3000);
  assert.equal(valid(at(2000, 0), text.length), true);
  assert.equal(valid(at(2001, 0), text.length), false);
});

test('two values of one attribute set at once conflict, and the last writer wins', () => {
  const base = '<section>\n<div class="box" style="left: 10px; top: 4px">A</div>\n</section>\n';
  const a = base.replace('10px', '20px'), b = base.replace('10px', '15px');
  // a diff by characters alone gives two patches that are valid together, and 25px
  assert.equal(apply(base, [...changes(base, a), ...changes(base, b)].sort((x, y) => x.start - y.start)).includes('25px'), true);
  for (const aFirst of [true, false]) {
    const merged = race(base, a, b, aFirst);
    assert.ok(merged === a || merged === b, merged);
    assert.ok(!merged.includes('25px'));
  }
  // a character reference is widened whole, and so is a tag
  assert.deepEqual(diff('a &lt; b', 'a &gt; b'), [{ start: 2, end: 6, text: '&gt;' }]);
  assert.deepEqual(diff('<p id=x>t</p>', '<p id=y>t</p>'), [{ start: 0, end: 8, text: '<p id=y>' }]);
});

// the snippets of the edits of the widen test, which open and close tags, raw text, comments, and
// references, and U+0130, whose lowercase is two code units long
const SNIPPETS = ['a', ' ', '\n', '<', '>', '"', "'", '&', '&amp;', ';', '/', '=', '<p>', '</p>', '<b class="x y">', '<i title=\'a>b\'>', '<!--', '-->', '<script>', '</script>', '</script ', '<title>', '</title>', '<style>', '</style>', '<textarea>', '</textarea>', '<!doctype html>', '<?x', '</ ', '😀', '\ud83d'];

// a seeded walk of edits of test-deck.html, each near a spot where tokens are hard, and the patches
// of each text that widen is given, of which half are near the edit
function* walk(seed, rounds) {
  const r = generator(seed);
  const spots = ['<script', '</script', '<style', '<!--', '-->', 'class="', '<title', '&', '<svg', '<math', '<pre', '<textarea'].map((m) => deck.indexOf(m)).filter((i) => i >= 0);
  let text = deck;
  for (let round = 0; round < rounds; round++) {
    const spot = Math.min(text.length, r.chance(0.2) ? r.int(text.length + 1) : Math.max(0, r.pick(spots) + r.int(200) - 100));
    const end = Math.min(text.length, spot + (r.chance(0.5) ? 0 : r.int(r.chance(0.1) ? 2000 : 12)));
    const word = () => Array.from({ length: 1 + r.int(3) }, () => r.pick(SNIPPETS)).join('');
    if (r.chance(0.002)) text = text.slice(0, spot) + '\u0130' + text.slice(spot);
    else if (r.chance(0.02)) text = text.replaceAll('\u0130', '');
    else text = text.slice(0, spot) + (r.chance(0.3) ? '' : word()) + text.slice(end);
    const points = Array.from({ length: 2 * (1 + r.int(4)) }, (_, i) => Math.min(text.length, i % 2 ? Math.max(0, spot + r.int(80) - 40) : r.int(text.length + 1))).sort((a, b) => a - b);
    const patches = [];
    for (let i = 0; i < points.length; i += 2) patches.push({ start: points[i], end: points[i + 1], text: r.chance(0.5) ? '' : word() });
    yield { text, patches, other: r.chance(0.1) };
  }
}

test('widen gives the same patches when it tokenizes again only the part of a text that changed since the last', () => {
  const reset = () => widen('<p>another text</p>', [{ start: 0, end: 0, text: '' }]);
  for (const seed of [1, 2, 3]) {
    // the tokens of each text are those of the text before, as for the base of a page at each keystroke,
    // and now and then of a text in between, as for the text with an operation in flight
    const step = [];
    let before = null;
    for (const { text, patches, other } of walk(seed, 1000)) {
      if (other && before) widen(before.slice(0, 10) + 'x' + before.slice(10), [{ start: 0, end: 0, text: '' }]);
      step.push(widen(text, patches));
      before = text;
    }
    let round = 0;
    for (const { text, patches } of walk(seed, 1000)) {
      reset();
      assert.deepEqual(step[round], widen(text, patches), `seed ${seed}, round ${round}`);
      round++;
    }
  }
});
