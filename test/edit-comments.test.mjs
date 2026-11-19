import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs, { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { Authority, Comments, checksum, diff, slidesOf, start, startTagAt } from '../theme/edit.mjs';
import { DECK, post, raw, startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const ANN = 'AnnAnnAnnAnnAnnAnnAnn1';
const BO = 'BoBoBoBoBoBoBoBoBoBoBo';

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
  const thread = comments.add(ANN, { base, anchor: tagRange(read, '<p>Second'), slide: slideRange(read, 'Second'), text: `Look @{${BO}} @{${BO}}` });
  reads(authority.text, thread.anchor, '<p>Second slide</p>');
  reads(authority.text, thread.slide, '<section>\n  <h2>Two');
  assert.equal(thread.anchor.tag, 'p');
  assert.deepEqual([thread.author, thread.text, thread.replies, thread.mentions], [ANN, `Look @{${BO}} @{${BO}}`, [], [BO]]);
  const onSlide = comments.add(BO, { base, anchor: null, slide: slideRange(read, 'Second'), text: 'Slide' });
  assert.deepEqual([onSlide.anchor, onSlide.slide], [thread.slide, thread.slide]);
  const deck = comments.add(BO, onDeck(authority, 'Deck'));
  assert.deepEqual([deck.anchor, deck.slide], [null, null]);
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
  assert.equal(status({ ...ok, text: '😀'.repeat(4001) }), 413);
  assert.equal(status({ ...ok, text: '😀'.repeat(4000) }), 200, 'an emoji counts as one character, not as its two UTF-16 code units');
  const people = Array.from({ length: 51 }, (_, i) => `@{${`${i}`.padStart(22, 'P')}}`);
  assert.deepEqual(comments.add(ANN, { ...ok, text: people.join(' ') }), { status: 413, error: 'the comment has more than 50 mentions' });
  assert.equal(status({ ...ok, text: people.slice(1).join(' ') }), 200);
  for (let i = 0; i < 3; i++) replace(authority, /First slide[^<]*/, `First slide ${i}`);
  assert.equal(status(ok), 409, 'the base is older than the log');
});

test('a thread takes replies, edits, deletes, a resolve, and a reopen, within its limits', (t) => {
  const { authority, comments } = open(sessionDir(t), DECK, { maxBytes: 60_000 });
  const thread = comments.add(ANN, onDeck(authority, 'Question'));
  const replied = comments.reply(thread.id, BO, { text: `Answer @{${ANN}}` });
  const reply = replied.replies[0];
  assert.deepEqual([reply.author, reply.text, replied.mentions], [BO, `Answer @{${ANN}}`, [ANN]]);
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

test('the mentions of a thread are read from the texts of its comments, and an edit or a delete that takes out an @name takes out its mention', (t) => {
  const { authority, comments } = open(sessionDir(t), DECK);
  const CY = 'CyCyCyCyCyCyCyCyCyCyCy';
  const thread = comments.add(ANN, { ...onDeck(authority, `For @{${BO}}`), mentions: [CY] });
  assert.deepEqual(thread.mentions, [BO]);
  const reply = comments.reply(thread.id, CY, { text: `cc @{${ANN}} and @\u2060{${CY}}`, mentions: [CY] }).replies[0];
  assert.deepEqual(comments.list(ANN).comments[0].mentions, [BO, ANN], 'a brace typed after an @ by hand is not a mention');
  assert.deepEqual(comments.edit(thread.id, ANN, { text: 'For nobody' }).mentions, [ANN]);
  assert.deepEqual(comments.remove(thread.id, CY, { reply: reply.id }).mentions, []);
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

test('a thread of a removed slide is attached again by an undo, also after a restart, and not by an equal element added elsewhere', (t) => {
  const dir = sessionDir(t);
  const notes = '<section>\n  <h2></h2>\n  <p>Notes</p>\n</section>\n';
  const deck = DECK.replace('</body>', `${notes}</body>`);
  const first = open(dir, deck);
  const slide = slideRange(deck, '<h2></h2>');
  const base = first.authority.version;
  first.comments.add(ANN, { base, anchor: tagRange(deck, '<h2></h2>'), slide, text: 'heading' });
  first.comments.add(ANN, { base, anchor: null, slide, text: 'slide' });
  replace(first.authority, notes, '');
  const gone = (comments) => comments.list(ANN).comments.forEach((c) => assert.deepEqual([c.anchor, c.slide, !!c.removed], [null, null, true], c.text));
  gone(first.comments);
  first.comments.stopSync();
  const again = open(dir, first.authority.text);
  gone(again.comments);
  again.authority.enter(diff(again.authority.text, deck), ANN);
  const [heading, onSlide] = again.comments.list(ANN).comments;
  reads(deck, heading.anchor, '<h2></h2>\n  <p>Notes');
  reads(deck, heading.slide, '<section>\n  <h2></h2>\n  <p>Notes');
  assert.equal(heading.removed, undefined);
  reads(deck, onSlide.anchor, '<section>\n  <h2></h2>\n  <p>Notes');
  assert.equal(onSlide.removed, undefined);
  replace(again.authority, notes, '');
  replace(again.authority, 'First slide', 'First slide, longer');
  replace(again.authority, '</body>', '<section>\n  <h2></h2>\n  <p></p>\n</section>\n</body>');
  gone(again.comments);
  replace(again.authority, '<h2>Two</h2>', '<h2>Two</h2>\n  <h2></h2>');
  gone(again.comments);
});

test('a thread of a removed element longer than 4 kB keeps its check in the file, by which an undo after a restart attaches it again', (t) => {
  const dir = sessionDir(t);
  const long = `<pre><code>${'y'.repeat(12_000)}</code></pre>`;
  const deck = DECK.replace('<p>Second slide</p>', `<p>Second slide</p>\n  ${long}`);
  const first = open(dir, deck);
  first.comments.add(ANN, { base: first.authority.version, anchor: tagRange(deck, '<pre>'), slide: slideRange(deck, '<pre>'), text: 'code' });
  replace(first.authority, `\n  ${long}`, '');
  first.comments.stopSync();
  const data = readJson(join(dir, 'comments.json'));
  const [saved] = data.comments;
  assert.deepEqual(saved.removed, { text: { tag: '<pre>', sum: checksum(long) } });
  const other = sessionDir(t);
  writeFileSync(join(other, 'comments.json'), JSON.stringify({ ...data, comments: [{ ...saved, removed: { text: { tag: '<pre>', sum: 'x' } } }] }));
  const refused = open(other, first.authority.text);
  assert.deepEqual([refused.comments.list(ANN).comments, refused.logged.length], [[], 1]);
  const again = open(dir, first.authority.text);
  const [kept] = again.comments.list(ANN).comments;
  reads(first.authority.text, kept.anchor, '<section>\n  <h2>Two');
  assert.deepEqual(kept.removed, saved.removed);
  again.authority.enter(diff(again.authority.text, deck), ANN);
  const [thread] = again.comments.list(ANN).comments;
  reads(deck, thread.anchor, '<pre><code>yyy');
  assert.equal(thread.removed, undefined);
});

test('the new threads since a version are listed in the order in which they were made, as the list gives them', (t) => {
  const { authority, comments } = open(sessionDir(t), DECK, { now: () => 1000 });
  const v0 = comments.v;
  const x = comments.add(ANN, onDeck(authority, 'x'));
  const y = comments.add(ANN, onDeck(authority, 'y'));
  assert.deepEqual(comments.list(ANN).comments.map((c) => c.id), [x.id, y.id]);
  assert.deepEqual(comments.since(v0).changed.map((c) => c.id), [x.id, y.id]);
});

test('a read time is written after the given time since the last write, and at a stop', { timeout: 60_000 }, async (t) => {
  const dir = sessionDir(t);
  const file = join(dir, 'comments.json');
  const { authority, comments } = open(dir, DECK, { every: 600_000 });
  const quick = sessionDir(t);
  const fast = open(quick, DECK, { every: 0 }).comments;
  let writes = 0;
  const write = comments.write;
  comments.write = function () {
    writes++;
    return write.call(this);
  };
  comments.add(ANN, onDeck(authority, 'first'));
  assert.deepEqual(readJson(file).comments.map((c) => c.text), ['first']);
  const read = comments.seen(BO, Date.now() - 5);
  await until(() => readJson(file).seen[BO] === read, 'the first read time');
  await comments.idle();
  const late = comments.seen(BO, Date.now());
  fast.seen(BO, 1);
  await until(() => readJson(join(quick, 'comments.json'))?.seen[BO] === 1, 'the read time in the store without an interval');
  await fast.idle();
  assert.equal(readJson(file).seen[BO], read, 'the second read time waits for the interval');
  assert.equal(writes, 1);
  assert.equal(comments.seen(BO, 1), late, 'the time of reading does not go back');
  comments.stopSync();
  const saved = readJson(file);
  assert.equal(saved.seen[BO], late);
  assert.equal(saved.sum, checksum(DECK));
  await comments.idle();
  assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.tmp')), []);
  const again = open(dir, DECK);
  assert.deepEqual(again.comments.list(BO).comments.map((c) => c.text), ['first']);
  assert.equal(again.comments.list(BO).seen, late);
  assert.equal(again.comments.list(ANN).seen, 0);
  assert.deepEqual(again.logged, []);
});

test('a change of a thread is in the file before it is answered', (t) => {
  const dir = sessionDir(t);
  const file = join(dir, 'comments.json');
  const { authority, comments } = open(dir, DECK);
  const saved = () => readJson(file)?.comments ?? [];
  const thread = comments.add(ANN, onDeck(authority, 'Question'));
  assert.deepEqual(saved().map((c) => c.text), ['Question']);
  const reply = comments.reply(thread.id, BO, { text: 'Answer' }).replies[0];
  assert.deepEqual(saved()[0].replies.map((r) => r.text), ['Answer']);
  comments.edit(thread.id, ANN, { text: 'Question, edited' });
  assert.equal(saved()[0].text, 'Question, edited');
  comments.resolve(thread.id, BO, true);
  assert.equal(saved()[0].resolved.by, BO);
  comments.resolve(thread.id, ANN, false);
  assert.equal(saved()[0].resolved, undefined);
  comments.remove(thread.id, BO, { reply: reply.id });
  assert.deepEqual(saved()[0].replies, []);
  comments.remove(thread.id, ANN, {});
  assert.deepEqual(saved(), []);
});

test('a change of a thread that cannot be written is taken back and refused', (t) => {
  const dir = sessionDir(t);
  const file = join(dir, 'comments.json');
  const { authority, comments, logged } = open(dir, DECK);
  const thread = comments.add(ANN, onDeck(authority, 'Question'));
  const reply = comments.reply(thread.id, BO, { text: `Answer @{${ANN}}` }).replies[0];
  const before = structuredClone(comments.list(ANN));
  const bytes = comments.bytes;
  let told = 0;
  comments.onChange(() => told++);
  fs.chmodSync(dir, 0o555);
  try {
    try {
      writeFileSync(join(dir, 'probe'), '');
      return t.skip('the folder cannot be made read only here, e.g. on Windows');
    } catch {}
    const refused = (x, error) => assert.deepEqual(x, { status: 503, error });
    refused(comments.add(ANN, onDeck(authority, 'Lost')), 'The host could not save the comment');
    refused(comments.reply(thread.id, ANN, { text: `Lost @{${BO}}` }), 'The host could not save the comment');
    refused(comments.edit(thread.id, ANN, { text: `Lost @{${BO}}` }), 'The host could not save the comment');
    refused(comments.edit(thread.id, BO, { reply: reply.id, text: 'Lost, and a longer text' }), 'The host could not save the comment');
    refused(comments.remove(thread.id, BO, { reply: reply.id }), 'The host could not delete the comment');
    refused(comments.remove(thread.id, ANN, {}), 'The host could not delete the comment');
    refused(comments.resolve(thread.id, BO, true), 'The host could not resolve the thread');
    assert.deepEqual(comments.list(ANN), before);
    assert.equal(comments.bytes, bytes, 'the bytes counted for the limit');
    assert.equal(told, 0);
    assert.match(logged.join('\n'), /could not write/);
    fs.chmodSync(dir, 0o755);
    assert.equal(comments.resolve(thread.id, BO, true).resolved.by, BO);
    fs.chmodSync(dir, 0o555);
    refused(comments.resolve(thread.id, BO, false), 'The host could not reopen the thread');
  } finally {
    fs.chmodSync(dir, 0o755);
  }
  assert.deepEqual(readJson(file).comments.map((c) => [c.text, c.replies.length, !!c.resolved]), [['Question', 1, true]]);
});

test('a stop or a change of a thread while a write waits for its temporary file keeps its text', { timeout: 60_000 }, async (t) => {
  const dir = sessionDir(t);
  const { authority, comments } = open(dir, DECK, { every: 0 });
  const write = comments.write;
  const begun = new Promise((done) => {
    comments.write = function () {
      const writing = write.call(this);
      done();
      return writing;
    };
  });
  comments.add(ANN, onDeck(authority, 'first'));
  const read = comments.seen(BO, Date.now() - 5);
  const keepNodeWaiting = setInterval(() => {}, 1000);
  await begun.finally(() => clearInterval(keepNodeWaiting));
  assert.ok(comments.writing, 'a write is in progress');
  comments.add(ANN, onDeck(authority, 'second'));
  await comments.idle();
  const file = join(dir, 'comments.json');
  assert.deepEqual(readJson(file).comments.map((c) => c.text), ['first', 'second'], 'the older text of the write is not renamed over the file');
  const late = comments.seen(ANN, Date.now());
  comments.stopSync();
  await comments.idle();
  const saved = readJson(file);
  assert.deepEqual(saved.comments.map((c) => c.text), ['first', 'second']);
  assert.deepEqual([saved.seen[BO], saved.seen[ANN]], [read, late]);
  assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.tmp')), []);
});

test('at a start, the anchors are moved by the patches that the history found, or fall back', (t) => {
  const dir = sessionDir(t);
  const first = open(dir, DECK);
  const base = first.authority.version;
  first.comments.add(ANN, { base, anchor: tagRange(DECK, '<p>Second'), slide: slideRange(DECK, 'Second'), text: 'p' });
  first.comments.add(ANN, { base, anchor: tagRange(DECK, '<h2>One'), slide: slideRange(DECK, 'One'), text: 'h' });
  first.comments.stopSync();
  const changed = DECK.replace('<section>', '<section>\n  <h2>Zero</h2>\n</section>\n<section>').replace('<h2>One</h2>', '<h2>One</h2>\n  <p>Added</p>');
  const moved = open(dir, changed, {}, { before: DECK, patches: diff(DECK, changed) });
  const [p, h] = moved.comments.list(ANN).comments;
  reads(changed, p.anchor, '<p>Second slide</p>');
  reads(changed, p.slide, '<section>\n  <h2>Two');
  reads(changed, h.anchor, '<h2>One</h2>');
  reads(changed, h.slide, '<section>\n  <h2>One');
  assert.equal(p.removed, undefined);
  moved.comments.stopSync();
  const file = join(dir, 'comments.json');
  const saved = readJson(file);
  const edited = changed.replace('<h2>Two</h2>', '<h2>Two!</h2>');
  const third = open(dir, edited);
  const [p3, h3] = third.comments.list(ANN).comments;
  reads(edited, p3.anchor, '<p>Second slide</p>');
  reads(edited, p3.slide, '<section>\n  <h2>Two!');
  assert.equal(p3.removed, undefined);
  reads(edited, h3.anchor, '<h2>One</h2>');
  assert.equal(h3.removed, undefined);
  third.comments.stopSync();
  for (const c of saved.comments) delete c.check;
  writeFileSync(file, JSON.stringify(saved));
  const fourth = open(dir, edited);
  const [p4, h4] = fourth.comments.list(ANN).comments;
  reads(edited, p4.anchor, '<section>\n  <h2>Two!');
  assert.deepEqual(p4.removed, { text: null });
  reads(edited, h4.anchor, '<h2>One</h2>');
  assert.equal(h4.removed, undefined);
  fourth.comments.stopSync();
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
  const { writeFileSync: write } = fs;
  t.after(() => {
    fs.writeFileSync = write;
    syncBuiltinESMExports();
  });
  fs.writeFileSync = (file, ...rest) => {
    if (String(file).includes('.comments.json.')) for (const end = performance.now() + 40; performance.now() < end; );
    return write(file, ...rest);
  };
  syncBuiltinESMExports();
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
  const tag = '<p style="left: 2px">Paragraph 2 of slide 9,';
  const timed = (body) => {
    const t1 = process.hrtime.bigint();
    const thread = comments.add(BO, { ...body, slide: null });
    const time = Number(process.hrtime.bigint() - t1);
    reads(authority.text, thread.anchor, tag);
    return time;
  };
  let old = Infinity;
  let current = Infinity;
  for (let attempt = 0; attempt < 5 && !(2 * (old - current) < entered); attempt++) {
    old = Math.min(old, timed({ base, anchor: tagRange(read, tag), text: 'old base' }));
    current = Math.min(current, timed({ base: authority.version, anchor: tagRange(authority.text, tag), text: 'current base' }));
  }
  const ms = (ns) => (ns / 1e6).toFixed(1);
  assert.ok(2 * (old - current) < entered, `the thread of the old base took ${ms(old)} ms, the thread of the current base ${ms(current)} ms, and the operations ${ms(entered)} ms`);
});

const LIST = DECK.replace('<h2>Two</h2>', '<h2>Two</h2>\n  <p>One</p>\n  <p>Two</p>');

test('at a start after a crash, a thread is placed by the check of its element, not by its offset alone', async (t) => {
  await t.test('an element of the same name at the old offset', () => {
    const dir = sessionDir(t);
    const first = open(dir, LIST);
    first.comments.add(ANN, { base: first.authority.version, anchor: tagRange(LIST, '<p>Two'), slide: slideRange(LIST, '<p>Two'), text: 'two' });
    first.comments.stopSync();
    const shifted = LIST.replace('  <p>One</p>', '  <p>New</p>\n  <p>One</p>');
    assert.equal(shifted.indexOf('<p>One'), LIST.indexOf('<p>Two'));
    const [thread] = open(dir, shifted).comments.list(ANN).comments;
    reads(shifted, thread.anchor, '<p>Two</p>');
    reads(shifted, thread.slide, '<section>\n  <h2>Two');
    assert.equal(thread.removed, undefined);
  });

  await t.test('an element changed after the last write falls back to its slide', () => {
    const dir = sessionDir(t);
    const first = open(dir, LIST);
    first.comments.add(ANN, { base: first.authority.version, anchor: tagRange(LIST, '<p>Two'), slide: slideRange(LIST, '<p>Two'), text: 'two' });
    first.comments.stopSync();
    const edited = LIST.replace('<p>Two</p>', '<p>Two, edited</p>');
    const [thread] = open(dir, edited).comments.list(ANN).comments;
    reads(edited, thread.anchor, '<section>\n  <h2>Two');
    assert.deepEqual(thread.removed, { text: null });
  });

  await t.test('a file written without the checks is read as before', () => {
    const dir = sessionDir(t);
    const first = open(dir, LIST);
    first.comments.add(ANN, { base: first.authority.version, anchor: tagRange(LIST, '<p>Two'), slide: slideRange(LIST, '<p>Two'), text: 'two' });
    first.comments.stopSync();
    const file = join(dir, 'comments.json');
    const saved = readJson(file);
    for (const c of saved.comments) delete c.check;
    writeFileSync(file, JSON.stringify(saved));
    const edited = LIST.replace('<p>Two</p>', '<p>Two, edited</p>');
    const [thread] = open(dir, edited).comments.list(ANN).comments;
    reads(edited, thread.anchor, '<p>Two, edited</p>');
    assert.equal(thread.removed, undefined);
  });
});

test('a thread sent again after it was refused is checked at a start by its element as it was sent again', (t) => {
  const { renameSync } = fs;
  t.after(() => {
    fs.renameSync = renameSync;
    syncBuiltinESMExports();
  });
  let held = true;
  fs.renameSync = (from, to) => {
    if (held && String(to).endsWith('comments.json')) throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' });
    return renameSync(from, to);
  };
  syncBuiltinESMExports();
  const dir = sessionDir(t);
  const { authority, comments } = open(dir, DECK);
  const id = randomUUID();
  const send = () => comments.add(ANN, { id, base: authority.version, anchor: tagRange(authority.text, '<p>Second'), slide: slideRange(authority.text, 'Second'), text: 'Look' });
  assert.equal(send().status, 503);
  replace(authority, 'Second slide', 'Second slide, edited');
  held = false;
  assert.equal(send().id, id);
  comments.stopSync();
  const later = authority.text.replace('First slide', 'First slide, typed');
  const [thread] = open(dir, later).comments.list(ANN).comments;
  reads(later, thread.anchor, '<p>Second slide, edited</p>');
  assert.equal(thread.removed, undefined);
});

test('after the edit command was killed, a start places a thread by the check of its element', (t) => {
  const dir = sessionDir(t);
  const L0 = DECK.replace('<p>Second slide</p>', '<ul>\n    <li>Build</li>\n  </ul>');
  const first = open(dir, L0);
  first.comments.add(ANN, { base: first.authority.version, anchor: tagRange(L0, '<li>Build'), slide: slideRange(L0, '<li>Build'), text: 'build' });
  replace(first.authority, '<li>Build</li>', '<li>Test</li>\n    <li>Build</li>');
  first.comments.stopSync();
  const L2 = first.authority.text.replace('<li>Test</li>', '<li>Mock</li>\n    <li>Test</li>');
  const [thread] = open(dir, L2, {}, { before: L0, patches: diff(L0, L2) }).comments.list(ANN).comments;
  reads(L2, thread.anchor, '<li>Build</li>');
  assert.equal(thread.removed, undefined);
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

  await t.test('a thread of a removed element whose slide is malformed', () => {
    const dir = sessionDir(t);
    const first = open(dir, DECK);
    first.comments.add(ANN, onDeck(first.authority, 'kept'));
    first.comments.stopSync();
    const file = join(dir, 'comments.json');
    const saved = readJson(file);
    const [good] = saved.comments;
    const slide = '<section>\n  <p>Gone</p>\n</section>';
    const check = { tag: '<section>', sum: checksum(slide) };
    const slides = { string: slide, check, number: 7, null: null, 'check without a tag': { ...check, tag: '' }, 'check with a malformed sum': { ...check, sum: 'zz' } };
    for (const [name, value] of Object.entries(slides)) saved.comments.push({ ...good, id: name.replaceAll(' ', '-'), text: name, removed: { text: '<p>Gone</p>', slide: value } });
    writeFileSync(file, JSON.stringify(saved));
    const again = open(dir, DECK);
    assert.deepEqual(
      again.comments.list(ANN).comments.map((c) => [c.text, c.removed?.slide]),
      [['kept', undefined], ['string', slide], ['check', check]],
    );
    assert.equal(again.logged.length, 1, again.logged.join('\n'));
  });
});

function heapGrowthAfterCollections(act, bound) {
  setFlagsFromString('--expose-gc');
  const gc = runInNewContext('gc');
  const used = (collect = true) => {
    if (collect) {
      gc();
      gc();
    }
    return process.memoryUsage().heapUsed;
  };
  const before = used();
  act();
  let grown = used(false) - before;
  for (let again = 0; again < 8 && grown >= bound; again++) grown = used() - before;
  return grown;
}

test('the texts of removed elements do not keep the earlier texts of the deck in memory', (t) => {
  const n = 100;
  const filler = `<section>\n  <p>${'x'.repeat(100_000)}</p>\n</section>\n`;
  const deck = DECK.replace('<p>Second slide</p>', Array.from({ length: n }, (_, k) => `<p>Paragraph ${k} of the slide</p>`).join('\n  ')).replace('</body>', `${filler}</body>`);
  const { authority, comments } = open(sessionDir(t), deck, { authority: { maxOps: 10 } });
  for (let k = 0; k < n; k++) comments.add(ANN, { base: authority.version, anchor: tagRange(deck, `<p>Paragraph ${k} `), slide: null, text: `p${k}` });
  const bound = (n * deck.length) / 10;
  const grown = heapGrowthAfterCollections(() => {
    for (let k = 0; k < n; k++) replace(authority, `\n  <p>Paragraph ${k} of the slide</p>`, '');
  }, bound);
  assert.ok(comments.list(ANN).comments.every((c) => c.removed?.text?.startsWith('<p>Paragraph')));
  assert.ok(grown < bound, `the heap grew by ${(grown / 1e6).toFixed(1)} MB`);
});

test('the checks of removed elements longer than 4 kB do not keep the earlier texts of the deck in memory', (t) => {
  const n = 50;
  const long = (k) => `<p class="paragraph-${k}">${'y'.repeat(5000)}</p>`;
  const filler = `<section>\n  <p>${'x'.repeat(100_000)}</p>\n</section>\n`;
  const deck = DECK.replace('<p>Second slide</p>', Array.from({ length: n }, (_, k) => long(k)).join('\n  ')).replace('</body>', `${filler}</body>`);
  const { authority, comments } = open(sessionDir(t), deck, { authority: { maxOps: 10 } });
  for (let k = 0; k < n; k++) comments.add(ANN, { base: authority.version, anchor: tagRange(deck, `<p class="paragraph-${k}">`), slide: null, text: `p${k}` });
  const bound = (n * deck.length) / 10;
  const grown = heapGrowthAfterCollections(() => {
    for (let k = 0; k < n; k++) replace(authority, `\n  ${long(k)}`, '');
  }, bound);
  assert.ok(comments.list(ANN).comments.every((c) => c.removed?.text?.tag?.startsWith('<p class="paragraph-')));
  assert.ok(grown < bound, `the heap grew by ${(grown / 1e6).toFixed(1)} MB`);
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

test('typing that only shifts the anchors does not write the file until the stop', async (t) => {
  const dir = sessionDir(t);
  const file = join(dir, 'comments.json');
  const { authority, comments } = open(dir, DECK, { every: 0 });
  const text = authority.text;
  comments.add(ANN, { base: authority.version, anchor: tagRange(text, '<p>Second'), slide: slideRange(text, 'Second'), text: 'x' });
  await comments.idle();
  let writes = 0;
  const write = comments.write;
  comments.write = function () {
    writes++;
    return write.call(this);
  };
  for (let k = 0; k < 20; k++) {
    replace(authority, 'First slide', `First slide ${k}`);
    await new Promise((done) => setTimeout(done, 5));
    await comments.idle();
  }
  assert.equal(writes, 0, 'a shift of the anchors alone is not written while the session runs');
  comments.stopSync();
  assert.equal(readJson(file).sum, checksum(authority.text));
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

  await t.test('some threads unreadable, and the file neither moved nor copied', () => {
    const dir = sessionDir(t);
    const file = join(dir, 'comments.json');
    const first = open(dir, DECK);
    const question = first.comments.add(ANN, onDeck(first.authority, 'Question'));
    const reply = first.comments.reply(question.id, ANN, { text: 'Reply' }).replies[0];
    const done = first.comments.add(ANN, onDeck(first.authority, 'Done'));
    first.comments.resolve(done.id, ANN, true);
    first.comments.stopSync();
    const data = readJson(file);
    data.comments.push({ text: 'not a thread' });
    writeFileSync(file, JSON.stringify(data));
    const written = readFileSync(file, 'utf8');
    const { comments, logged } = open(dir, DECK);
    assert.deepEqual(comments.list(ANN).comments.map((c) => c.text), ['Question', 'Done']);
    const refused = (x, what) => assert.deepEqual(x, readOnlyFailure, what);
    const readOnlyFailure = comments.add(ANN, onDeck(first.authority, 'Lost'));
    assert.equal(readOnlyFailure.status, 503);
    refused(comments.reply(question.id, ANN, { text: 'Lost' }), 'reply');
    refused(comments.edit(question.id, ANN, { text: 'Lost' }), 'edit');
    refused(comments.edit(question.id, ANN, { reply: reply.id, text: 'Lost' }), 'edit of a reply');
    refused(comments.remove(question.id, ANN, { reply: reply.id }), 'delete of a reply');
    refused(comments.remove(question.id, ANN, {}), 'delete');
    refused(comments.resolve(question.id, ANN, true), 'resolve');
    refused(comments.resolve(done.id, ANN, false), 'reopen');
    comments.stopSync();
    assert.equal(readFileSync(file, 'utf8'), written);
    assert.match(logged.join('\n'), /read only/);
  });
});

test('a comments.json that cannot be renamed over refuses a comment at once, lets the edit command answer between the tries of its delayed write, and is written once the rename works', { timeout: 120_000 }, async (t) => {
  const { root, talk } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(talk, '.session', 'comments.json');
  const { renameSync } = fs;
  const onto = (to) => String(to).endsWith(join('.session', 'comments.json'));
  let held = false;
  let busy = 0;
  let tries = 0;
  let onTry = null;
  fs.renameSync = (from, to) => {
    if (onto(to)) {
      tries++;
      onTry?.();
      if (held || busy > 0) {
        busy = Math.max(0, busy - 1);
        throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' });
      }
    }
    return renameSync(from, to);
  };
  syncBuiltinESMExports();
  t.after(() => {
    fs.renameSync = renameSync;
    syncBuiltinESMExports();
  });
  const running = await start({ folder: talk, port: 0, log: () => {} });
  t.after(() => running.close());
  const api = (route) => `/${running.key}/.session/${route}`;
  const ann = (await post(running.port, api('hello'), { name: 'Ann' })).json();
  const deck = () => raw(running.port, 'GET', `/${running.key}/index.html`);
  const base = (await deck()).headers['x-session-version'];
  const comment = (text) => post(running.port, api('comments'), { token: ann.token, base, anchor: null, slide: null, text });
  const saved = () => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  };

  held = true;
  tries = 0;
  const refused = await comment('second');
  assert.equal(refused.status, 503);
  assert.equal(tries, 3);

  tries = 0;
  let answeredAfter = null;
  onTry = () => {
    if (tries !== 1) return;
    deck().then((r) => (answeredAfter = r.status === 200 ? tries : r.status));
  };
  assert.equal((await post(running.port, api('comments/seen'), { token: ann.token, time: 5 })).status, 200);
  await until(() => tries >= 2, 'a second try of the delayed write');
  onTry = null;
  assert.equal(answeredAfter, 1, 'the deck was answered between the first and the second try of the delayed write');
  held = false;
  await until(() => saved()?.seen[ann.person] === 5, 'the read time to be written');
  assert.equal((await comment('second')).status, 200);
  assert.deepEqual(saved().comments.map((c) => c.text), ['second']);

  busy = 5;
  assert.equal((await post(running.port, api('comments/seen'), { token: ann.token, time: 6 })).status, 200);
  await running.close();
  assert.equal(saved().seen[ann.person], 6);
});

test('a delayed write that keeps failing logs one line at the first failure and one when the file is written again', { timeout: 60_000 }, async (t) => {
  const dir = sessionDir(t);
  const file = join(dir, 'comments.json');
  const { renameSync } = fs;
  let held = true;
  let tries = 0;
  fs.renameSync = (from, to) => {
    if (String(to) === file) {
      tries++;
      if (held) throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' });
    }
    return renameSync(from, to);
  };
  syncBuiltinESMExports();
  t.after(() => {
    fs.renameSync = renameSync;
    syncBuiltinESMExports();
  });
  const { comments, logged } = open(dir, DECK, { every: 10 });
  const failing = (n) => logged.filter((m) => m.startsWith(`could not write ${file}, trying again`)).length === n;
  for (const time of [1, 2]) {
    held = true;
    tries = 0;
    comments.seen(BO, time);
    await until(() => tries >= 4, 'four tries of the delayed write');
    assert.ok(failing(time), logged.join('\n'));
    held = false;
    await until(() => readJson(file)?.seen[BO] === time, 'the read time to be written');
    await comments.idle();
    assert.equal(logged.filter((m) => m === `wrote ${file} again`).length, time, logged.join('\n'));
  }
  assert.equal(logged.length, 4, logged.join('\n'));
});

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
  assert.deepEqual(empty, { v: 0, at: ann.v, comments: [], seen: 0, read: {} });
  const { text, base } = await s.deck();
  const created = await s.call('comments', ann, { base, anchor: tagRange(text, '<p>Second'), slide: slideRange(text, 'Second'), text: `Look @{${bo.person}}` });
  assert.equal(created.status, 200);
  const thread = created.json();
  reads(text, thread.anchor, '<p>Second slide</p>');
  const told = await s.events(bo, base);
  assert.deepEqual(told.comments, { v: 1, changed: [thread], removed: [] });
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
  assert.deepEqual((await s.call('comments/seen', bo, { time: 5 })).json(), { seen: 5, read: {} });
  assert.equal((await s.get(bo)).seen, 5);
  assert.equal((await s.call('comments/seen', bo, { time: 'x' })).status, 400);
  const changed = await s.events(bo, shifted.v);
  assert.deepEqual(changed.comments.changed.map((c) => [c.id, c.text, c.replies.length]), [[thread.id, 'Look again', 1]]);
  assert.deepEqual((await s.call(`comments/${thread.id}/delete`, bo, { reply: reply.id })).json().replies, []);
  assert.deepEqual((await s.call(`comments/${thread.id}/delete`, ann)).json(), {});
  const deleted = await s.events(bo, shifted.v);
  assert.deepEqual(deleted.comments, { v: (await s.get(bo)).v, changed: [], removed: [thread.id] });
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

test('the comments are kept over a restart, and follow a change of index.html made while the edit command was not running', { timeout: 120_000, skip: process.platform === 'win32' && 'signals' }, async (t) => {
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

test('a thread and a reply answered 200 are kept when the edit command is killed right after', { timeout: 120_000 }, async (t) => {
  const folder = talkFolder(t);
  const first = await session(t, folder, true);
  const ann = await first.hello('Ann');
  const { base } = await first.deck();
  const created = await first.call('comments', ann, { base, anchor: null, slide: null, text: 'Kept?' });
  assert.equal(created.status, 200);
  assert.equal((await first.call(`comments/${created.json().id}/reply`, ann, { text: 'Kept too?' })).status, 200);
  first.edit.child.kill('SIGKILL');
  await first.edit.exited;
  const second = await session(t, folder);
  const bo = await second.hello('Bo');
  assert.deepEqual((await second.get(bo)).comments.map((c) => [c.text, c.replies.map((r) => r.text)]), [['Kept?', ['Kept too?']]]);
});

test('a stop that cannot write comments.json names the file and ends with code 1', { timeout: 120_000, skip: process.platform === 'win32' && 'signals' }, async (t) => {
  const folder = talkFolder(t);
  const s = await session(t, folder);
  const ann = await s.hello('Ann');
  const { base } = await s.deck();
  assert.equal((await s.call('comments', ann, { base, anchor: null, slide: null, text: 'Written' })).status, 200);
  const file = join(folder.talk, '.session', 'comments.json');
  rmSync(file);
  fs.mkdirSync(file);
  assert.equal((await s.call('comments/seen', ann, { time: Date.now() })).status, 200);
  s.edit.child.kill('SIGTERM');
  assert.equal(await s.edit.exited, 1);
  assert.ok(s.edit.stderr.includes(`could not write ${join(fs.realpathSync(folder.talk), '.session', 'comments.json')}: `), s.edit.stderr);
});

test('a thread or a reply sent again with the id that its page made is made once', { timeout: 120_000 }, async (t) => {
  const s = await session(t);
  const ann = await s.hello('Ann');
  const bo = await s.hello('Bo');
  const { text, base } = await s.deck();
  const id = randomUUID();
  const body = { id, base, anchor: tagRange(text, '<p>Second'), slide: slideRange(text, 'Second'), text: 'Look' };
  const first = (await s.call('comments', ann, body)).json();
  assert.equal(first.id, id);
  const { v } = await s.get(bo);
  const again = await s.call('comments', ann, body);
  assert.equal(again.status, 200);
  assert.deepEqual(again.json(), first);
  assert.deepEqual((await s.get(bo)).comments.map((c) => c.id), [id]);
  assert.equal((await s.get(bo)).v, v, 'a request sent again changes nothing');
  assert.equal((await s.call('comments', bo, body)).status, 409, 'the id of the thread of another person');
  assert.equal((await s.call('comments', ann, { ...body, id: 'x'.repeat(36) })).status, 400);
  assert.equal((await s.call('comments', ann, { ...body, id: 7 })).status, 400);
  const reply = randomUUID();
  const replied = (await s.call(`comments/${id}/reply`, bo, { id: reply, text: 'Seen' })).json();
  assert.deepEqual(replied.replies.map((r) => r.id), [reply]);
  assert.deepEqual((await s.call(`comments/${id}/reply`, bo, { id: reply, text: 'Seen' })).json(), replied);
  assert.equal((await s.call(`comments/${id}/reply`, ann, { id: reply, text: 'Seen' })).status, 409, 'the id of the reply of another person');
  assert.equal((await s.call(`comments/${id}/reply`, bo, { id: 'x', text: 'Seen' })).status, 400);
  assert.match((await s.call('comments', ann, { ...body, id: undefined })).json().id, /^[A-Za-z0-9_-]+$/);
});

test('the time up to which a person read a thread is kept, told to the other pages of the person, and dropped with the thread', { timeout: 120_000, skip: process.platform === 'win32' && 'signals' }, async (t) => {
  const folder = talkFolder(t);
  const first = await session(t, folder, true);
  const ann = await first.hello('Ann');
  const other = (await post(first.edit.port, first.api('hello'), { name: 'Ann', person: ann.person })).json();
  assert.equal(other.person, ann.person);
  const bo = await first.hello('Bo');
  const { base } = await first.deck();
  let last = 0;
  const thread = async (text) => {
    await until(() => Date.now() > last, 'the clock to pass the time of the thread before');
    const made = (await first.call('comments', bo, { base, anchor: null, slide: null, text: `${text} @{${ann.person}}` })).json();
    last = made.time;
    return made;
  };
  const x = await thread('X');
  const y = await thread('Y');
  const z = await thread('Z');
  const told = await first.events(other, other.v);
  assert.deepEqual(told.comments.changed.map((c) => c.id).sort(), [x.id, y.id, z.id].sort());

  const read = (await first.call('comments/seen', ann, { time: y.time, thread: y.id })).json();
  assert.deepEqual(read, { seen: 0, read: { [y.id]: y.time } });
  const reached = await first.events(other, told.v);
  assert.deepEqual([reached.comments?.seen, reached.comments?.read], [0, { [y.id]: y.time }], 'the read reaches the other page of the person');
  assert.deepEqual((await first.get(other)).read, { [y.id]: y.time });
  assert.deepEqual((await first.get(bo)).read, {});
  assert.deepEqual((await first.call('comments/seen', ann, { time: y.time - 1, thread: y.id })).json().read, { [y.id]: y.time });
  assert.equal((await first.call('comments/seen', ann, { time: 1, thread: 'nope' })).status, 404);
  assert.equal((await first.call('comments/seen', ann, { time: 'x', thread: y.id })).status, 400);
  await first.call('comments/seen', ann, { time: z.time, thread: z.id });
  assert.deepEqual((await first.call('comments/seen', ann, { time: x.time })).json(), { seen: x.time, read: { [y.id]: y.time, [z.id]: z.time } });
  assert.deepEqual((await first.call('comments/seen', ann, { time: y.time })).json(), { seen: y.time, read: { [z.id]: z.time } });
  await stopEdit(first.edit);

  const second = await session(t, folder);
  const again = (await post(second.edit.port, second.api('hello'), { name: 'Ann', person: ann.person })).json();
  const bo2 = (await post(second.edit.port, second.api('hello'), { name: 'Bo', person: bo.person })).json();
  assert.equal(again.person, ann.person);
  assert.deepEqual([(await second.get(again)).seen, (await second.get(again)).read], [y.time, { [z.id]: z.time }], 'the times are kept over a restart');
  assert.deepEqual((await second.call(`comments/${z.id}/delete`, bo2)).json(), {});
  assert.deepEqual((await second.get(again)).read, {}, 'the time of a deleted thread is dropped');
});
