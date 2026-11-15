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
