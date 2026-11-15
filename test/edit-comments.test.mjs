// the comments of the edit command: a thread anchored on the text that a page read, its replies,
// edits, deletes, resolve, and reopen within their limits, the changes told to the pages but not a
// shift of an anchor, the file .session/comments.json written at most once in a given time and at a
// stop, read again at a start with its anchors moved by the patches that the history found, or set
// aside when it cannot be read, and the requests of a session

import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
  const { authority, comments } = open(sessionDir(t), DECK, { maxChars: 60_000 });
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
  // the characters of every text of the deck together
  let added = 0;
  while (comments.add(ANN, onDeck(authority, 'x'.repeat(4000))).id) added++;
  assert.equal(added, 14);
  assert.equal(comments.add(ANN, onDeck(authority, 'x'.repeat(4000))).status, 413);
  assert.equal(comments.remove(thread.id, BO, {}).status, 403);
  assert.equal(comments.remove(thread.id, ANN, {}), null);
  assert.equal(comments.list(ANN).comments.length, added);
  assert.ok(comments.add(ANN, onDeck(authority, 'x'.repeat(4000))).id, 'a delete gives the characters back');
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
