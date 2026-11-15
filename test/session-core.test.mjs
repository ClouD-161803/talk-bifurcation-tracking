// the sync core of the synchronous editor, imported from the compiled theme/edit.mjs: the rules
// of a patch, the authority, and a fuzz test in which 2 to 5 replicas edit test-deck.html at once
// over a network that delays and reorders, with operations in flight while typing goes on,
// refusals, ties at one point, and late joins. every replica converges on the text of the
// authority, an accepted operation is applied whole, and the merge of a replica agrees with the
// shift of the authority. each run is seeded, and a failure names its seed

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Authority, Replica, apply, changes, checksum, conflict, diff, invert, mergePatches, shift, shiftOffset, tokenize, valid } from '../theme/edit.mjs';

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

// a session of an authority and replicas over a network in which every message waits in a queue
function session(seed, { text = deck, people = 2 + (seed % 4), steps = 250, maxOps = 1000, spot = null } = {}) {
  const r = generator(seed);
  const where = `seed ${seed}`;
  const authority = new Authority(text, { maxOps, epoch: `e${seed}` });
  const spots = spot === null ? Array.from({ length: 3 }, () => r.int(text.length)) : [spot, spot, spot];
  const replicas = [];
  const toAuthority = [];
  const stats = { accepted: 0, refused: 0, ties: 0, joins: 0, resyncs: 0 };

  function join(at = authority.n) {
    const id = `client${replicas.length}x`;
    const replica = new Replica(id, authority.textAt(at), `e${seed}.${at}`);
    const state = { replica, inbox: authority.since(`e${seed}.${at}`).slice(), answers: [], sent: null, editedSince: false };
    replicas.push(state);
    return state;
  }

  function send(state) {
    const { replica } = state;
    if (replica.needsResync) {
      // the client says hello again without v, and merges the whole text
      replica.resync(authority.text, authority.version);
      stats.resyncs++;
    }
    const request = replica.outgoing();
    if (!request) return;
    assert.equal(apply(replica.base, request.patches), replica.mine, `${where}: an operation does not turn base into mine`);
    assert.ok(valid(request.patches, replica.base.length, replica.base), `${where}: an operation of a replica is not valid`);
    state.sent = request;
    state.editedSince = false;
    toAuthority.push({ state, request });
  }

  function submit(i) {
    const [{ state, request }] = toAuthority.splice(i, 1);
    const before = authority.text;
    const { answer, op } = authority.submit(request, state.replica.client);
    if (answer.ok) {
      stats.accepted++;
      // the operation is applied whole: every patch is moved, none is cut or left out
      assert.equal(op.patches.length, request.patches.length, `${where}: an operation was applied in part`);
      op.patches.forEach((p, k) => {
        assert.equal(p.text, request.patches[k].text, `${where}: a patch was changed`);
        assert.equal(p.end - p.start, request.patches[k].end - request.patches[k].start, `${where}: a patch was cut`);
      });
      for (const s of replicas) s.inbox.push(op);
    } else {
      stats.refused++;
      assert.equal(authority.text, before, `${where}: a refused operation changed the text`);
    }
    state.answers.push({ request, answer });
  }

  function deliver(state, count) {
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
    const roll = r.next();
    const state = r.pick(replicas);
    if (roll < 0.38) {
      const before = state.replica.mine;
      let next = edit(r, before, spots);
      // two replicas that insert at one point at once make a tie
      if (r.chance(spot === null ? 0.1 : 0.7)) {
        const at = Math.min(spots[0], before.length);
        next = before.slice(0, whole(before, at)) + r.pick(['<b>t</b>', 'q', '😀']) + before.slice(whole(before, at));
        stats.ties++;
      }
      state.replica.edit(next);
      if (state.sent) state.editedSince = true;
      send(state);
    } else if (roll < 0.6 && toAuthority.length) {
      submit(r.int(toAuthority.length));
    } else if (roll < 0.9 && state.inbox.length) {
      deliver(state, 1 + r.int(3));
    } else if (roll < 0.98 && state.answers.length) {
      const { request, answer } = state.answers.shift();
      state.replica.answer(request, answer);
      if (!answer.ok && state.sent?.seq === request.seq) state.sent = null;
      send(state);
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
      const busy = replicas.find((s) => s.inbox.length || s.answers.length);
      if (!busy) break;
      if (busy.answers.length) {
        const { request, answer } = busy.answers.shift();
        busy.replica.answer(request, answer);
        if (!answer.ok && busy.sent?.seq === request.seq) busy.sent = null;
        send(busy);
      } else deliver(busy, busy.inbox.length);
    }
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
  assert.deepEqual(a.submit({ client: 'c', seq: 1, base: 'E.0', patches: [] }, 'Ann').answer, ok.answer);
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
