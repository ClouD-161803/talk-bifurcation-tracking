// the comments of the edit command: a thread anchored on the text that a page read, its replies,
// edits, deletes, resolve, and reopen within their limits, the changes told to the pages but not a
// shift of an anchor, the file .session/comments.json written at most once in a given time and at a
// stop, read again at a start with its anchors moved by the patches that the history found, or set
// aside when it cannot be read, and the requests of a session

import assert from 'node:assert/strict';
import fs, { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Authority, Comments, checksum, diff, slidesOf, startTagAt } from '../theme/edit.mjs';
import { DECK, post, raw, startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const ANN = 'AnnAnnAnnAnnAnnAnnAnn1';
const BO = 'BoBoBoBoBoBoBoBoBoBoBo';

// a .session folder, removed with the test after its comments are stopped
const opened = new Map();
function sessionDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'slides comments-'));
  opened.set(dir, []);
  t.after(() => {
    for (const comments of opened.get(dir)) comments.stopSync();
    opened.delete(dir);
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function open(dir, text, options = {}, found = null) {
  const { authority: authorityOptions, ...rest } = options;
  const authority = new Authority(text, authorityOptions);
  const logged = [];
  const comments = new Comments(dir, authority, found, { log: (m) => logged.push(m), ...rest });
  opened.get(dir).push(comments);
  return { authority, comments, logged };
}

const replace = (authority, from, to) => authority.enter(diff(authority.text, authority.text.replace(from, to)), ANN);
// the range of the start tag that begins with open, and of the start tag of the slide that holds inside
const tagRange = (text, open) => {
  const t = startTagAt(text, text.indexOf(open));
  return { start: t.start, end: t.end };
};
const slideRange = (text, inside) => {
  const at = text.indexOf(inside);
  const s = slidesOf(text).find((x) => x.start <= at && at < x.end);
  return { start: s.start, end: s.open };
};
const reads = (text, anchor, what) => assert.equal(anchor && text.slice(anchor.start, anchor.start + what.length), what);
const onDeck = (authority, text) => ({ base: authority.version, anchor: null, slide: null, text });
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const bytesOf = (x) => Buffer.byteLength(JSON.stringify(x));

test('a thread is anchored on the text that the page read, and moved to the current text', (t) => {
  const { authority, comments } = open(sessionDir(t), DECK);
  const base = authority.version;
  const read = authority.text;
  replace(authority, '<h2>One</h2>', '<h2>One</h2>\n  <p>New</p>');
  const thread = comments.add(ANN, { base, anchor: tagRange(read, '<p>Second'), slide: slideRange(read, 'Second'), text: 'Look', mentions: [BO, BO] });
  reads(authority.text, thread.anchor, '<p>Second slide</p>');
  reads(authority.text, thread.slide, '<section>\n  <h2>Two');
  assert.equal(thread.anchor.tag, 'p');
  assert.deepEqual([thread.author, thread.text, thread.replies, thread.mentions], [ANN, 'Look', [], [BO]]);
  const onSlide = comments.add(BO, { base, anchor: null, slide: slideRange(read, 'Second'), text: 'Slide' });
  assert.deepEqual([onSlide.anchor, onSlide.slide], [thread.slide, thread.slide]);
  const deck = comments.add(BO, onDeck(authority, 'Deck'));
  assert.deepEqual([deck.anchor, deck.slide], [null, null]);
  // an anchor sent without its slide is given the slide that holds it
  const bare = comments.add(BO, { base: authority.version, anchor: tagRange(authority.text, '<p>New'), slide: null, text: 'x' });
  reads(authority.text, bare.slide, '<section>\n  <h2>One');
  assert.deepEqual(comments.list(ANN).comments.map((c) => c.id), [thread.id, onSlide.id, deck.id, bare.id]);
  assert.equal(comments.list(ANN).at, authority.version);
});

test('a thread is refused for anchors that are not start tags, a stale base, and a text out of bounds', (t) => {
  const { authority, comments } = open(sessionDir(t), DECK, { authority: { maxOps: 2 } });
  const text = authority.text;
  const ok = { base: authority.version, anchor: tagRange(text, '<p>Second'), slide: slideRange(text, 'Second'), text: 'x' };
  const status = (body) => comments.add(ANN, body).status ?? 200;
  assert.equal(status({ ...ok, anchor: { start: ok.anchor.start + 1, end: ok.anchor.end } }), 400);
  assert.equal(status({ ...ok, anchor: { start: ok.anchor.start, end: ok.anchor.end + 1 } }), 400);
  assert.equal(status({ ...ok, anchor: { start: 0, end: 'x' } }), 400);
  assert.equal(status({ ...ok, anchor: [] }), 400);
  assert.equal(status({ ...ok, slide: tagRange(text, '<h2>Two') }), 400);
  assert.equal(status({ ...ok, slide: slideRange(text, 'First') }), 400);
  assert.equal(status({ ...ok, base: 'nope.0' }), 409);
  assert.equal(status({ ...ok, base: 7 }), 409);
  assert.equal(status({ ...ok, text: '  ' }), 400);
  assert.equal(status({ ...ok, text: null }), 400);
  assert.equal(status({ ...ok, text: 'é'.repeat(4001) }), 413);
  assert.equal(status({ ...ok, text: 'é'.repeat(4000) }), 200);
  assert.equal(status({ ...ok, mentions: ['short'] }), 400);
  assert.equal(status({ ...ok, mentions: 'x' }), 400);
  for (let i = 0; i < 3; i++) replace(authority, /First slide[^<]*/, `First slide ${i}`);
  assert.equal(status(ok), 409, 'the base is older than the log');
});

test('a thread takes replies, edits, deletes, a resolve, and a reopen, within its limits', (t) => {
  const { authority, comments } = open(sessionDir(t), DECK, { maxBytes: 60_000 });
  const thread = comments.add(ANN, onDeck(authority, 'Question'));
  const replied = comments.reply(thread.id, BO, { text: 'Answer', mentions: [ANN] });
  const reply = replied.replies[0];
  assert.deepEqual([reply.author, reply.text, replied.mentions], [BO, 'Answer', [ANN]]);
  assert.equal(comments.edit(thread.id, BO, { text: 'Not mine' }).status, 403);
  assert.equal(comments.edit(thread.id, ANN, { text: 'Question, edited' }).text, 'Question, edited');
  assert.equal(typeof comments.list(ANN).comments[0].edited, 'number');
  assert.equal(comments.edit(thread.id, BO, { reply: reply.id, text: 'Answer, edited' }).replies[0].text, 'Answer, edited');
  assert.equal(comments.edit(thread.id, BO, { reply: 'nope', text: 'x' }).status, 404);
  assert.equal(comments.edit(thread.id, ANN, { text: '' }).status, 400);
  assert.equal(comments.remove(thread.id, ANN, { reply: reply.id }).status, 403);
  assert.deepEqual(comments.remove(thread.id, BO, { reply: reply.id }).replies, []);
  assert.equal(comments.resolve(thread.id, BO, true).resolved.by, BO);
  assert.equal(comments.resolve(thread.id, ANN, false).resolved, undefined);
  assert.equal(comments.reply('nope', BO, { text: 'x' }).status, 404);
  for (let i = 0; i < 200; i++) assert.equal(comments.reply(thread.id, BO, { text: `r${i}` }).replies.length, i + 1);
  assert.equal(comments.reply(thread.id, BO, { text: 'one too many' }).status, 409);
  // the bytes of every thread as the comments are sent, together
  let added = 0;
  while (comments.add(ANN, onDeck(authority, 'x'.repeat(4000))).id) added++;
  const size = Buffer.byteLength(JSON.stringify(comments.list(ANN).comments));
  assert.ok(added > 0 && size <= 60_000 && size + 4000 > 60_000, `${added} threads of ${size} bytes`);
  assert.equal(comments.add(ANN, onDeck(authority, 'x'.repeat(4000))).status, 413);
  assert.equal(comments.remove(thread.id, BO, {}).status, 403);
  assert.equal(comments.remove(thread.id, ANN, {}), null);
  assert.equal(comments.list(ANN).comments.length, added);
  assert.ok(comments.add(ANN, onDeck(authority, 'x'.repeat(4000))).id, 'a delete gives the bytes back');
});

test('a deck holds at most 2000 threads', (t) => {
  const { authority, comments } = open(sessionDir(t), DECK);
  for (let i = 0; i < 2000; i++) assert.ok(comments.add(ANN, onDeck(authority, `t${i}`)).id);
  assert.equal(comments.add(ANN, onDeck(authority, 'one too many')).status, 409);
});

test('the changes of the threads are told, and a shift of an anchor is not', (t) => {
  const { authority, comments } = open(sessionDir(t), DECK);
  let told = 0;
  comments.onChange(() => told++);
  const v0 = comments.v;
  const text = authority.text;
  const thread = comments.add(ANN, { base: authority.version, anchor: tagRange(text, '<p>Second'), slide: slideRange(text, 'Second'), text: 'x' });
  const gone = comments.add(ANN, onDeck(authority, 'y'));
  const first = comments.since(v0);
  assert.deepEqual(new Set(first.changed), new Set([thread, gone]));
  assert.deepEqual([first.v, first.removed], [comments.v, []]);
  const v1 = comments.v;
  replace(authority, 'First slide', 'First slide, longer');
  assert.equal(comments.v, v1);
  assert.deepEqual(comments.since(v1), { v: v1, changed: [], removed: [] });
  reads(authority.text, comments.list(ANN).comments[0].anchor, '<p>Second slide</p>');
  // the element of the thread removed
  replace(authority, '  <p>Second slide</p>\n', '');
  const fell = comments.since(v1);
  assert.equal(fell.changed.length, 1);
  assert.deepEqual(fell.changed[0].removed, { text: '<p>Second slide</p>' });
  reads(authority.text, fell.changed[0].anchor, '<section>\n  <h2>Two');
  const v2 = comments.v;
  assert.equal(comments.remove(gone.id, ANN, {}), null);
  assert.deepEqual(comments.since(v2), { v: comments.v, changed: [], removed: [gone.id] });
  assert.deepEqual(comments.since(-1), { v: comments.v, changed: null, removed: null });
  assert.equal(told, 4);
});

test('the file is written at most once in the given time, and at a stop', { timeout: 60_000 }, async (t) => {
  const dir = sessionDir(t);
  const file = join(dir, 'comments.json');
  const read = () => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  };
  const { authority, comments } = open(dir, DECK, { every: 300 });
  comments.add(ANN, onDeck(authority, 'first'));
  await until(() => read()?.comments.length === 1, 'the first write');
  const firstWrite = statSync(file).mtimeMs;
  comments.add(ANN, onDeck(authority, 'second'));
  assert.equal(read().comments.length, 1);
  await until(() => read()?.comments.length === 2, 'the second write');
  assert.ok(statSync(file).mtimeMs - firstWrite >= 250, `written again after ${statSync(file).mtimeMs - firstWrite} ms`);
  comments.add(ANN, onDeck(authority, 'third'));
  assert.equal(comments.seen(BO, Date.now() - 5) > 0, true);
  assert.equal(comments.seen(BO, 1), comments.list(BO).seen, 'the time of reading does not go back');
  comments.stopSync();
  const saved = read();
  assert.deepEqual(saved.comments.map((c) => c.text), ['first', 'second', 'third']);
  assert.equal(saved.sum, checksum(DECK));
  await comments.idle();
  assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.tmp')), []);
  const again = open(dir, DECK);
  assert.deepEqual(again.comments.list(BO).comments.map((c) => c.text), ['first', 'second', 'third']);
  assert.equal(again.comments.list(BO).seen, saved.seen[BO]);
  assert.equal(again.comments.list(ANN).seen, 0);
  assert.deepEqual(again.logged, []);
});

test('a stop while a write waits for its temporary file keeps the text of the stop', { timeout: 60_000 }, async (t) => {
  const dir = sessionDir(t);
  const { authority, comments } = open(dir, DECK, { every: 0 });
  // begun resolves in the turn in which the timer of comments calls write, hence before any file
  // call of this write can end. a second timer may run in a later turn, after the write is over
  const write = comments.write;
  const begun = new Promise((done) => {
    comments.write = function () {
      const writing = write.call(this);
      done();
      return writing;
    };
  });
  comments.add(ANN, onDeck(authority, 'first'));
  await begun;
  assert.ok(comments.writing, 'a write is in progress');
  comments.add(ANN, onDeck(authority, 'second'));
  comments.stopSync();
  await comments.idle();
  const saved = JSON.parse(readFileSync(join(dir, 'comments.json'), 'utf8'));
  assert.deepEqual(saved.comments.map((c) => c.text), ['first', 'second']);
  assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.tmp')), []);
});

test('at a start, the anchors are moved by the patches that the history found, or fall back', (t) => {
  const dir = sessionDir(t);
  const first = open(dir, DECK);
  const base = first.authority.version;
  first.comments.add(ANN, { base, anchor: tagRange(DECK, '<p>Second'), slide: slideRange(DECK, 'Second'), text: 'p' });
  first.comments.add(ANN, { base, anchor: tagRange(DECK, '<h2>One'), slide: slideRange(DECK, 'One'), text: 'h' });
  first.comments.stopSync();
  // index.html changed while the edit command was not running
  const changed = DECK.replace('<section>', '<section>\n  <h2>Zero</h2>\n</section>\n<section>').replace('<h2>One</h2>', '<h2>One</h2>\n  <p>Added</p>');
  const moved = open(dir, changed, {}, { before: DECK, patches: diff(DECK, changed) });
  const [p, h] = moved.comments.list(ANN).comments;
  reads(changed, p.anchor, '<p>Second slide</p>');
  reads(changed, p.slide, '<section>\n  <h2>Two');
  reads(changed, h.anchor, '<h2>One</h2>');
  reads(changed, h.slide, '<section>\n  <h2>One');
  assert.equal(p.removed, undefined);
  moved.comments.stopSync();
  // without the patches, an anchor that is not a start tag of its name falls back to its slide
  const edited = changed.replace('<h2>Two</h2>', '<h2>Two!</h2>');
  const third = open(dir, edited);
  const [p3, h3] = third.comments.list(ANN).comments;
  reads(edited, p3.anchor, '<section>\n  <h2>Two!');
  assert.deepEqual(p3.removed, { text: null });
  reads(edited, h3.anchor, '<h2>One</h2>');
  assert.equal(h3.removed, undefined);
  third.comments.stopSync();
});

test('a file of comments that cannot be read is moved aside', async (t) => {
  for (const content of ['not json', JSON.stringify({ sum: 'x', comments: [{ id: 'bad' }], seen: {} })]) {
    await t.test(content.slice(0, 12), () => {
      const dir = sessionDir(t);
      writeFileSync(join(dir, 'comments.json'), content);
      const { comments, logged } = open(dir, DECK);
      assert.equal(logged.length, 1, logged.join('\n'));
      assert.match(logged[0], /could not be read/);
      const aside = readdirSync(dir).filter((n) => n.startsWith('comments-unreadable-'));
      assert.equal(aside.length, 1);
      assert.equal(readFileSync(join(dir, aside[0]), 'utf8'), content);
      assert.deepEqual(comments.list(ANN).comments, []);
    });
  }
});

test('a thread sent with an old base is moved to the current text in less than half the time that the operations since took', (t) => {
  const slide = (k) => ['<section>', `  <h2>Slide ${k}</h2>`, ...Array.from({ length: 4 }, (_, i) => `  <p style="left: ${i}px">Paragraph ${i} of slide ${k}, on the manifold.</p>`), '</section>'].join('\n');
  const deck = ['<!doctype html>', '<body>', ...Array.from({ length: 200 }, (_, k) => slide(k)), '</body>', ''].join('\n');
  const { authority, comments } = open(sessionDir(t), deck, { authority: { maxOps: 1000 } });
  const read = authority.text;
  const base = authority.version;
  comments.add(ANN, { base, anchor: tagRange(read, '<p style="left: 1px">Paragraph 1 of slide 5,'), slide: null, text: 'x' });
  const drags = [];
  let text = read;
  for (let k = 0; k < 600; k++) {
    const after = text.replace(`left: ${k % 4}px">Paragraph ${k % 4} of slide ${(k * 7) % 200},`, `left: ${k % 4}5px">Paragraph ${k % 4} of slide ${(k * 7) % 200},`);
    drags.push(diff(text, after));
    text = after;
  }
  const t0 = process.hrtime.bigint();
  for (const patches of drags) assert.equal(authority.enter(patches, ANN).answer.ok, true);
  const entered = Number(process.hrtime.bigint() - t0);
  // the best of three, since another process may take the processor for a while
  let added = Infinity;
  for (let attempt = 0; attempt < 3 && 2 * added >= entered; attempt++) {
    const t1 = process.hrtime.bigint();
    const thread = comments.add(BO, { base, anchor: tagRange(read, '<p style="left: 2px">Paragraph 2 of slide 9,'), slide: null, text: 'old base' });
    added = Math.min(added, Number(process.hrtime.bigint() - t1));
    reads(authority.text, thread.anchor, '<p style="left: 2px">Paragraph 2 of slide 9,');
  }
  assert.ok(2 * added < entered, `the thread took ${(added / 1e6).toFixed(1)} ms, and the operations ${(entered / 1e6).toFixed(1)} ms`);
});

test('the comments stay under the body limit of the relay, counted in bytes as they are sent, and a deletion is never refused', async (t) => {
  const odd = '\u0001'.repeat(4000);
  await t.test('a limit given', () => {
    const { authority, comments } = open(sessionDir(t), DECK, { maxBytes: 100_000 });
    const ids = [];
    for (let n = 0; n < 100; n++) {
      const thread = comments.add(ANN, onDeck(authority, odd));
      if (!thread.id) {
        assert.equal(thread.status, 413);
        break;
      }
      ids.push(thread.id);
    }
    assert.ok(ids.length >= 1 && ids.length < 100, `${ids.length} threads added`);
    assert.ok(bytesOf(comments.list(ANN)) <= 100_000, `${bytesOf(comments.list(ANN))} bytes`);
    assert.equal(comments.reply(ids[0], BO, { text: odd }).status, 413);
    assert.equal(comments.edit(ids[0], ANN, { text: odd }).id, ids[0]);
    assert.equal(comments.remove(ids[0], ANN, {}), null);
    assert.ok(comments.add(ANN, onDeck(authority, odd)).id, 'a delete gives the bytes back');
  });

  await t.test('the limit of the edit command', () => {
    const { authority, comments } = open(sessionDir(t), DECK);
    let added = 0;
    while (added < 2000 && comments.add(ANN, onDeck(authority, odd)).id) added++;
    const size = bytesOf(comments.list(ANN));
    assert.ok(size <= 8 * 1024 * 1024, `${added} threads of ${size} bytes`);
  });

  await t.test('the texts of removed elements past the limit', () => {
    const deck = DECK.replace('<p>Second slide</p>', ['<p>A', '<p>B', '<p>C'].map((p) => `${p}${'\u0001'.repeat(3000)}</p>`).join('\n  '));
    const { authority, comments } = open(sessionDir(t), deck, { maxBytes: 30_000 });
    for (const p of ['<p>A', '<p>B', '<p>C']) assert.ok(comments.add(ANN, { base: authority.version, anchor: tagRange(deck, p), slide: slideRange(deck, p), text: p }).id);
    replace(authority, /\n {2}<p>A[^]*C\u0001+<\/p>/, '');
    const list = comments.list(ANN);
    assert.ok(list.comments.every((c) => c.removed), 'every element is removed');
    assert.ok(list.comments.some((c) => c.removed.text === null), 'a removed text is left out');
    assert.ok(bytesOf(list) <= 30_000 + 1000, `${bytesOf(list)} bytes`);
  });
});

test('a thread on an element of any tag name is read again at a start, and a thread that cannot be read is left out without the others', async (t) => {
  for (const [name, open_] of [['a custom element of a long name', `<orbit-${'x'.repeat(64)}>`], ['a no-break space after the name', '<p class="lead">']]) {
    await t.test(name, () => {
      const dir = sessionDir(t);
      const deck = DECK.replace('<p>Second slide</p>', `${open_}Second slide</p>`);
      const first = open(dir, deck);
      const thread = first.comments.add(ANN, { base: first.authority.version, anchor: tagRange(deck, open_), slide: slideRange(deck, 'Second'), text: 'tag' });
      assert.ok(thread.id);
      first.comments.add(ANN, onDeck(first.authority, 'deck'));
      first.comments.stopSync();
      const again = open(dir, deck);
      assert.deepEqual(again.comments.list(ANN).comments.map((c) => c.text), ['tag', 'deck']);
      reads(deck, again.comments.list(ANN).comments[0].anchor, open_);
      assert.deepEqual(again.logged, []);
    });
  }

  await t.test('a malformed thread among good ones', () => {
    const dir = sessionDir(t);
    const first = open(dir, DECK);
    first.comments.add(ANN, onDeck(first.authority, 'kept'));
    first.comments.stopSync();
    const file = join(dir, 'comments.json');
    const saved = readJson(file);
    saved.comments.push({ id: 'bad', text: 7 });
    const content = JSON.stringify(saved);
    writeFileSync(file, content);
    const again = open(dir, DECK);
    assert.deepEqual(again.comments.list(ANN).comments.map((c) => c.text), ['kept']);
    assert.equal(again.logged.length, 1, again.logged.join('\n'));
    assert.match(again.logged[0], /could not be read/);
    const aside = readdirSync(dir).filter((n) => n.startsWith('comments-unreadable-'));
    assert.equal(aside.length, 1);
    assert.equal(readFileSync(join(dir, aside[0]), 'utf8'), content);
    again.comments.add(ANN, onDeck(again.authority, 'new'));
    again.comments.stopSync();
    assert.deepEqual(readJson(file).comments.map((c) => c.text), ['kept', 'new']);
  });
});

test('a shift of the anchors by typing is written to the file', async (t) => {
  const dir = sessionDir(t);
  const file = join(dir, 'comments.json');
  const { authority, comments } = open(dir, DECK, { every: 0 });
  const text = authority.text;
  comments.add(ANN, { base: authority.version, anchor: tagRange(text, '<p>Second'), slide: slideRange(text, 'Second'), text: 'x' });
  await until(() => readJson(file)?.comments.length === 1, 'the first write');
  await comments.idle();
  replace(authority, 'First slide', 'First slide, longer');
  comments.stopSync();
  const saved = readJson(file);
  assert.equal(saved.sum, checksum(authority.text));
  reads(authority.text, saved.comments[0].anchor, '<p>Second slide</p>');
  reads(authority.text, saved.comments[0].slide, '<section>\n  <h2>Two');
});

test('a time of reading in the future is taken as the time now', (t) => {
  const { comments } = open(sessionDir(t), DECK, { now: () => 1_000_000 });
  assert.equal(comments.seen(BO, 5_000_000), 1_000_000);
  assert.equal(comments.list(BO).seen, 1_000_000);
});

test('a file of comments that cannot be read is copied aside when it cannot be moved, and is not written over when it cannot be copied either', async (t) => {
  const { renameSync, copyFileSync } = fs;
  const restore = () => {
    Object.assign(fs, { renameSync, copyFileSync });
    syncBuiltinESMExports();
  };
  t.after(restore);
  const locked = (what) => () => {
    throw Object.assign(new Error(`${what} is locked`), { code: 'EBUSY' });
  };
  // a rename onto an aside file fails, as when another program holds the file open on Windows
  fs.renameSync = (from, to) => (String(to).includes('unreadable') ? locked('rename')() : renameSync(from, to));
  syncBuiltinESMExports();

  await t.test('copied', () => {
    const dir = sessionDir(t);
    const file = join(dir, 'comments.json');
    writeFileSync(file, 'not json');
    const { authority, comments } = open(dir, DECK);
    const aside = readdirSync(dir).filter((n) => n.startsWith('comments-unreadable-'));
    assert.equal(aside.length, 1);
    assert.equal(readFileSync(join(dir, aside[0]), 'utf8'), 'not json');
    assert.ok(comments.add(ANN, onDeck(authority, 'new')).id);
    comments.stopSync();
    assert.deepEqual(readJson(file).comments.map((c) => c.text), ['new']);
  });

  await t.test('neither moved nor copied', () => {
    fs.copyFileSync = locked('copy');
    syncBuiltinESMExports();
    const dir = sessionDir(t);
    const file = join(dir, 'comments.json');
    writeFileSync(file, 'not json');
    const { authority, comments, logged } = open(dir, DECK);
    assert.equal(comments.add(ANN, onDeck(authority, 'new')).status, 503);
    comments.stopSync();
    assert.equal(readFileSync(file, 'utf8'), 'not json');
    assert.match(logged.join('\n'), /read only/);
  });
});

// the comments of a session through its requests. the folder is removed after the edit command
// stops, unless it is kept for a later session
async function session(t, folder = talkFolder(t), keep = false) {
  const edit = await startEdit(folder.talk, { env: { XDG_CONFIG_HOME: folder.config, APPDATA: folder.config } });
  t.after(async () => {
    await stopEdit(edit);
    if (!keep) rmSync(folder.root, { recursive: true, force: true });
  });
  const api = (route) => `${edit.base}.session/${route}`;
  const hello = async (name) => (await post(edit.port, api('hello'), { name })).json();
  const deck = async () => {
    const r = await raw(edit.port, 'GET', `${edit.base}index.html`);
    return { text: r.text, base: r.headers['x-session-version'] };
  };
  const get = async (page) => (await raw(edit.port, 'GET', `${api('comments')}?token=${page.token}`)).json();
  const call = (route, page, body = {}) => post(edit.port, api(route), { token: page.token, ...body });
  const events = async (page, since) => (await raw(edit.port, 'GET', `${api('events')}?token=${page.token}&since=${since}`)).json();
  return { ...folder, edit, api, hello, deck, get, call, events };
}

test('the requests of the comments, and the events that tell the other pages of them', { timeout: 120_000 }, async (t) => {
  const s = await session(t);
  const ann = await s.hello('Ann');
  const bo = await s.hello('Bo');
  const empty = await s.get(ann);
  assert.deepEqual(empty, { v: 0, at: ann.v, comments: [], seen: 0 });
  const { text, base } = await s.deck();
  const created = await s.call('comments', ann, { base, anchor: tagRange(text, '<p>Second'), slide: slideRange(text, 'Second'), text: 'Look', mentions: [bo.person] });
  assert.equal(created.status, 200);
  const thread = created.json();
  reads(text, thread.anchor, '<p>Second slide</p>');
  const told = await s.events(bo, base);
  assert.deepEqual(told.comments, { v: 1, changed: [thread], removed: [] });
  // a shift of the anchor is not told
  const at = text.indexOf('First slide');
  const shifted = (await s.call('op', ann, { seq: 1, base, patches: [{ start: at, end: at, text: 'The ' }] })).json();
  assert.equal(shifted.ok, true);
  const after = await s.events(bo, told.v);
  assert.equal(after.ops.length, 1);
  assert.equal(after.comments, undefined);
  reads((await s.deck()).text, (await s.get(bo)).comments[0].anchor, '<p>Second slide</p>');
  const reply = (await s.call(`comments/${thread.id}/reply`, bo, { text: 'Seen' })).json().replies[0];
  assert.equal((await s.call(`comments/${thread.id}/edit`, bo, { text: 'x' })).status, 403);
  assert.equal((await s.call(`comments/${thread.id}/edit`, ann, { text: 'Look again' })).json().text, 'Look again');
  assert.equal((await s.call(`comments/${thread.id}/delete`, ann, { reply: reply.id })).status, 403);
  assert.equal((await s.call(`comments/${thread.id}/resolve`, bo)).json().resolved.by, bo.person);
  assert.equal((await s.call(`comments/${thread.id}/reopen`, ann)).json().resolved, undefined);
  assert.deepEqual((await s.call('comments/seen', bo, { time: 5 })).json(), { seen: 5 });
  assert.equal((await s.get(bo)).seen, 5);
  assert.equal((await s.call('comments/seen', bo, { time: 'x' })).status, 400);
  const changed = await s.events(bo, shifted.v);
  assert.deepEqual(changed.comments.changed.map((c) => [c.id, c.text, c.replies.length]), [[thread.id, 'Look again', 1]]);
  assert.deepEqual((await s.call(`comments/${thread.id}/delete`, bo, { reply: reply.id })).json().replies, []);
  assert.deepEqual((await s.call(`comments/${thread.id}/delete`, ann)).json(), {});
  const deleted = await s.events(bo, shifted.v);
  assert.deepEqual(deleted.comments, { v: (await s.get(bo)).v, changed: [], removed: [thread.id] });
  // refusals
  assert.equal((await s.call('comments/nope/reply', bo, { text: 'x' })).status, 404);
  assert.equal((await s.call('comments/a.b/reply', bo, { text: 'x' })).status, 404);
  assert.equal((await s.call(`comments/${thread.id}/nope`, bo)).status, 404);
  assert.equal((await s.call('comments', { token: 'n'.repeat(22) }, { base, anchor: null, slide: null, text: 'x' })).status, 404);
  assert.equal((await raw(s.edit.port, 'GET', `${s.api('comments')}?token=${'n'.repeat(22)}`)).status, 404);
  assert.equal((await raw(s.edit.port, 'PUT', s.api('comments'), { body: '{}', headers: { 'content-type': 'application/json' } })).status, 405);
  assert.equal((await raw(s.edit.port, 'POST', s.api('comments'), { body: '{}', headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await raw(s.edit.port, 'POST', s.api('comments'), { body: 'null', headers: { 'content-type': 'application/json' } })).status, 400);
  assert.equal((await s.call('comments', ann, { base: 'x.1', anchor: null, slide: null, text: 'x' })).status, 409);
  assert.equal((await s.call('comments', ann, { base, anchor: { start: 1, end: 2 }, slide: null, text: 'x' })).status, 400);
  assert.equal((await s.call('comments', ann, { base, anchor: null, slide: null, text: 'x'.repeat(4001) })).status, 413);
});

test('the comments are kept over a restart, and follow a change of index.html made while the edit command was not running', { timeout: 120_000 }, async (t) => {
  const folder = talkFolder(t);
  const first = await session(t, folder, true);
  const ann = await first.hello('Ann');
  const { text, base } = await first.deck();
  assert.equal((await first.call('comments', ann, { base, anchor: tagRange(text, '<p>Second'), slide: slideRange(text, 'Second'), text: 'Look' })).status, 200);
  await stopEdit(first.edit);
  const file = join(folder.talk, 'index.html');
  const changed = readFileSync(file, 'utf8').replace('<section>', '<section>\n  <h2>Zero</h2>\n</section>\n<section>').replace('<h2>Two</h2>', '<h2>Two</h2>\n  <p>Added</p>');
  writeFileSync(file, changed);
  const second = await session(t, folder);
  const bo = await second.hello('Bo');
  const { comments, at } = await second.get(bo);
  const now = await second.deck();
  assert.equal(at, now.base);
  assert.deepEqual(comments.map((c) => c.text), ['Look']);
  reads(now.text, comments[0].anchor, '<p>Second slide</p>');
  reads(now.text, comments[0].slide, '<section>\n  <h2>Two');
});
