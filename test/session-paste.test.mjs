// slides pasted from a plain deck into a page of a session. a file that the session does not take
// is not added by the paste, which names it with the reason, and the later edits of the page still
// reach index.html

import assert from 'node:assert/strict';
import { cpSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { clean, converge, open, sessionUrl, talk } from './helpers/client.mjs';
import { A, BACKDROP, DIR, FILES, QUERY, copySlide, openDeck, pasteSlides, pasted, status, withMacrosOfA } from './helpers/cross-deck.mjs';
import { edit } from './helpers/offline.mjs';

const MB = 1024 * 1024;
// a paste asks the edit command for each path of a pasted file, and for each path under media/ that
// it would take, which are answered with 404
const PROBED = /status of 404 .*\/(data|figs|media)\//;
const media = (server) => (existsSync(join(server.talk, 'media')) ? readdirSync(join(server.talk, 'media')).sort() : []);

/**
 * Deck A of test/pages/cross-deck copied into the talk folder at the same path, where it finds the
 * theme/ of the talk, and opened in the plain editor at the address of the edit command. change(dir)
 * runs on the copy before the page is opened.
 */
async function deckA(browser, server, change = () => {}) {
  const dir = join(server.talk, DIR, 'a');
  cpSync(resolve(DIR, 'a'), dir, { recursive: true });
  change(dir);
  return openDeck(browser, `${server.edit.url}${A}?${QUERY}`, A);
}

test('a slide pasted into a session comes without the file of trajectories of its backdrop, and the later edits of the page reach index.html', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const a = await deckA(browser, server);
  const text = await copySlide(a, BACKDROP);
  await a.close();
  const ann = await open(browser, sessionUrl(server.edit));
  await pasteSlides(ann, 'One', text);
  await pasted(ann);
  // the note of the paste is shown until the next edit
  const { message } = await status(ann);
  await edit(ann, 0, 'p', ' typed');
  const after = await converge(server, [ann]);
  assert.match(after, /<p>First slide typed<\/p>/);
  assert.match(after, /data-trajectories="data\/path\.js"/);
  assert.deepEqual(media(server), []);
  assert.ok(message.includes('data/path.js was not copied: path.js cannot be sent to the others, since a session takes only PNG, JPEG, GIF, WebP, AVIF, SVG, MP4, and WebM files.'), message);
  clean(ann, [PROBED]);
});

test('a picture over the limit of a session is not added by a paste, and the later edits of the page reach index.html', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const a = await deckA(browser, server, (dir) => writeFileSync(join(dir, 'figs/orbit.png'), Buffer.alloc(17 * MB)));
  const text = await copySlide(a, FILES);
  await a.close();
  const ann = await withMacrosOfA(await open(browser, sessionUrl(server.edit)));
  await pasteSlides(ann, 'One', text);
  await pasted(ann);
  // the note of the paste is shown until the next edit
  const { message } = await status(ann);
  await edit(ann, 0, 'p', ' typed');
  const after = await converge(server, [ann]);
  assert.match(after, /<p>First slide typed<\/p>/);
  assert.match(after, /<img src="figs\/orbit\.png"/);
  assert.deepEqual(media(server), ['clip.mp4', 'clip.png', 'shared.png']);
  assert.ok(message.includes('figs/orbit.png was not copied: orbit.png is larger than 16 MB, the largest file that can be sent to the others.'), message);
  clean(ann, [PROBED]);
});
