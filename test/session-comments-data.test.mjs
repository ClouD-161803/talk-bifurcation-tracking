// the comments of a session as data, in Chrome, on two or three pages of one edit command: a thread
// made after the merge that follows a break offline, a comment on one of identical paragraphs, a
// thread on one of them while the edits of its page wait, a thread whose answer was lost, what a
// person read kept over a reload and told to the other pages of the person, a listener that
// throws, an element of another name at the offset of an anchor, a reply counted as unread, and an
// answer of GET comments older than the base of the page

import assert from 'node:assert/strict';
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, loads, ONLINE, open, sessionUrl, show, talk, TALK } from './helpers/client.mjs';
import { click, press, type } from './helpers/editor.mjs';
import { goOffline, goOnline, tab } from './helpers/offline.mjs';
import { startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;
const COMMENT_KEY = process.platform === 'darwin' ? 'Mod+Alt+M' : 'Alt+Shift+C';
const PANE = '.beeson-edit-inspector .panel.comments';
const OFFLINE = 'Comments are sent once you are back online';
const ARTICLES = `document.querySelectorAll('${PANE} article').length`;
// the id of each thread in the pane, followed by * when the thread is unread
const UNREAD = `[...document.querySelectorAll('${PANE} article')].map((a) => a.dataset.id + (a.classList.contains('unread') ? '*' : ''))`;
const COUNT = `document.querySelector('.beeson-session-comments').getAttribute('aria-label')`;
// the requests of a page that is offline fail in its console
const REFUSED = [/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/, /status of 502/, /status of 404 .*\/\.session\/events\?/];
const TWINS = TALK.replace('<p>First slide</p>', '<p>TBD</p>\n  <p>TBD</p>\n  <p>TBD</p>');

// the text of the badge of the element of expression, as in session-comments.test.mjs
const badgeOf = (expression, slide = false) => `(() => {
  const el = ${expression};
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const b = [...document.querySelectorAll('.beeson-comment-badge')].find((b) => {
    const q = b.getBoundingClientRect();
    return ${slide} ? Math.abs(q.right - (r.right - 6)) < 2 && Math.abs(q.top - (r.top + 6)) < 2 : Math.abs(q.left - (r.right + 4)) < 2 && Math.abs(q.bottom - (r.top - 4)) < 2;
  });
  return b ? b.textContent + (b.classList.contains('unread') ? '*' : '') : null;
})()`;
// whether each paragraph of slide One has a badge
const TWIN_BADGES = `[0, 1, 2].map((i) => !!${badgeOf("document.querySelectorAll('.reveal .slides > section')[0].querySelectorAll('p')[i]")})`;
const on = (heading, selector = null) => `[...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector('h2')?.textContent.startsWith(${JSON.stringify(heading)}))${selector ? `?.querySelector(${JSON.stringify(selector)})` : ''}`;

// the operations of the page wait until window.__go(), or one at a time with window.__goOne()
const HOLD = `(() => {
  const fetched = window.fetch;
  window.__held = [];
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('/.session/op') && !window.__going) return new Promise((done) => window.__held.push(() => done(fetched.call(this, input, init))));
    return fetched.call(this, input, init);
  };
  window.__goOne = () => window.__held.shift()();
  window.__go = () => {
    window.__going = true;
    for (const go of window.__held.splice(0)) go();
  };
})()`;

async function sees(page, expression, want, what = expression) {
  await front(page);
  let got;
  try {
    await until(async () => {
      got = await page.evaluate(expression);
      return JSON.stringify(got) === JSON.stringify(want);
    }, what, 15_000);
  } catch {
    assert.deepEqual(got, want, what);
  }
}

async function badge(page, heading, selector, want) {
  await show(page, heading);
  await sees(page, badgeOf(on(heading, selector), !selector), want, `the badge on ${selector ?? 'the slide'} of ${heading}`);
}

async function openPane(page) {
  await front(page);
  if (!(await page.evaluate(`window.BeesonEditor.state('view.comments').checked`))) await page.evaluate(`window.BeesonEditor.exec('view.comments')`);
  await page.waitFor(`!!document.querySelector('${PANE}:not([hidden])')`);
}

// a comment of text on the target of the Comment command, sent from the draft of the pane
async function comment(page, text) {
  await front(page);
  await press(page, COMMENT_KEY);
  await page.waitFor(`document.activeElement?.matches('${PANE} .draft textarea')`);
  await type(page, text);
  await click(page, `${PANE} .draft .actions .primary`);
  await page.waitFor(`!document.querySelector('${PANE} .draft')`);
}

async function pair(t, names = ['Ann', 'Ben']) {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const pages = [];
  for (const name of names) pages.push(await open(browser, sessionUrl(server.edit), { name }));
  await converge(server, pages);
  return { browser, server, pages };
}

// talk() of helpers/client.mjs on the deck given
async function talkOf(t, deck) {
  const folder = talkFolder(t, deck);
  for (const dir of ['theme', 'brand']) cpSync(resolve(dir), join(folder.talk, dir), { recursive: true });
  const file = join(folder.talk, 'index.html');
  const server = { ...folder, file, read: () => readFileSync(file, 'utf8') };
  server.edit = await startEdit(folder.talk, { env: { XDG_CONFIG_HOME: folder.config, APPDATA: folder.config } });
  t.after(async () => {
    await stopEdit(server.edit);
    rmSync(folder.root, { recursive: true, force: true });
  });
  return server;
}

// a thread on the deck that page posts with a mention of person, resolved with its id
const mention = (page, text, person) => page.evaluate(`(async () => {
  const c = ${C};
  const thread = await c.transport.post('comments', { token: c.token, anchor: null, slide: null, base: c.base.v, text: ${JSON.stringify(`${text} @{${person}}`)}, mentions: [${JSON.stringify(person)}] });
  return thread.id;
})()`);

const count = (server, text) => server.read().split(text).length - 1;

async function reload(page) {
  const before = await loads(page);
  await page.evaluate('location.reload()').catch(() => {});
  await until(async () => (await loads(page).catch(() => 0)) > before, 'the page to load again');
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  await page.waitFor(ONLINE);
}

test('a thread made after a merge of the offline path is shown on the page that made it', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const a = await tab(browser, url);
  const b = await open(browser, url, { name: 'Ben' });
  await converge(server, [a, b]);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'First');

  // the merge of conflicts.ts follows a break of over 5 s with an edit that waits
  await goOffline(a);
  await show(a, 'One');
  await caretAtEnd(a, el(0, 'h2'));
  await type(a, ' offline');
  await a.waitFor('Date.now() - window.__offAt > 5500', 15_000);
  await goOnline(a);
  await until(() => server.read().includes('<h2>One offline</h2>'), 'the edit made offline to reach index.html');
  await converge(server, [a, b]);

  await show(a, 'Two');
  await click(a, '.reveal .slides > section:nth-child(2) > p');
  await comment(a, 'Second');
  await openPane(b);
  await sees(b, ARTICLES, 2, 'the threads on the other page');
  await sees(a, ARTICLES, 2, 'the threads on the page that made them');
  clean(a, REFUSED);
  clean(b);
});

test('a comment on one of identical paragraphs after a removal is anchored on the paragraph picked', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talkOf(t, TWINS);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [a, b]);

  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) > p');
  await press(a, 'Escape');
  await a.evaluate(`window.BeesonEditor.exec('element.delete')`);
  await until(() => count(server, '<p>TBD</p>') === 2, 'the removal to reach index.html');
  const text = await converge(server, [a, b]);

  await click(a, '.reveal .slides > section:nth-child(1) > p');
  await comment(a, 'On the first');
  const [thread] = await a.evaluate(`${C}.transport.comments(${C}.token).then((r) => r.comments)`);
  assert.equal(thread.anchor.start, text.indexOf('<p>TBD</p>'), 'the anchor is the start tag of the first paragraph');
  await badge(b, 'One', 'p:nth-of-type(1)', '1*');
  await badge(b, 'One', 'p:nth-of-type(2)', null);
  await badge(a, 'One', 'p:nth-of-type(1)', '1');
  clean(a);
  clean(b);
});

test('a thread on one of identical paragraphs is shown at its place while later edits of the page wait', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talkOf(t, TWINS);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [a, b]);
  await show(b, 'One');
  await click(b, '.reveal .slides > section:nth-child(1) > p:nth-of-type(2)');
  await comment(b, 'On the second');
  await show(a, 'One');
  await sees(a, TWIN_BADGES, [false, true, false]);

  // the removal of the first paragraph is acknowledged while the typing after it waits
  await a.evaluate(HOLD);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) > p');
  await press(a, 'Escape');
  await a.evaluate(`window.BeesonEditor.exec('element.delete')`);
  await a.waitFor('window.__held.length === 1');
  await caretAtEnd(a, el(0, 'h2'));
  await type(a, ' held');
  await a.evaluate('window.__goOne()');
  await a.waitFor(`window.__held.length === 1 && ${C}.base.text.split('<p>TBD</p>').length === 3`);
  // the patches of the removal do not tell which twin went, hence the place is the one that the
  // other page shows, which reads as the edit command
  await show(b, 'One');
  const want = await until(async () => {
    const got = await b.evaluate(TWIN_BADGES);
    return got.filter(Boolean).length === 1 && got;
  }, 'the badge on one paragraph of the other page');
  await show(a, 'One');
  await sees(a, TWIN_BADGES, want, 'the badges of the paragraphs while the typing waits');
  await badge(a, 'One', null, null);

  await a.evaluate('window.__go()');
  await until(() => server.read().includes('<h2>One held</h2>'), 'the typing to reach index.html');
  await converge(server, [a, b]);
  await show(a, 'One');
  await sees(a, TWIN_BADGES, want);
  await show(b, 'One');
  await sees(b, TWIN_BADGES, want);
  clean(a);
  clean(b);
});
