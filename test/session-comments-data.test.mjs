import assert from 'node:assert/strict';
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, loads, ONLINE, open, sessionUrl, show, talk, TALK } from './helpers/client.mjs';
import { click, clickText, press, type } from './helpers/editor.mjs';
import { goOffline, goOnline, tab } from './helpers/offline.mjs';
import { startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;
const COMMENT_KEY = process.platform === 'darwin' ? 'Mod+Alt+M' : 'Shift+F2';
const PANE = '.beeson-edit-inspector .panel.comments';
const LOST = 'Not sent. The connection to the host was lost.';
const ARTICLES = `document.querySelectorAll('${PANE} article').length`;
const UNREAD = `[...document.querySelectorAll('${PANE} article')].map((a) => a.dataset.id + (a.classList.contains('unread') ? '*' : ''))`;
const COUNT = `document.querySelector('.beeson-session-comments').getAttribute('aria-label')`;
const BUTTON = `(() => {
  const b = document.querySelector('.beeson-session-comments');
  const c = b.querySelector('.count');
  const r = c.getBoundingClientRect();
  const o = b.getBoundingClientRect();
  const drawn = r.width > 0 && r.height > 0 && r.left >= o.left && r.right <= o.right && r.top >= o.top && r.bottom <= o.bottom;
  return [b.title === b.getAttribute('aria-label') ? b.title : null, c.textContent, drawn ? (r.width < 14 ? 'dot' : 'number') : null];
})()`;
const REFUSED = [/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|ERR_SOCKET_NOT_CONNECTED/, /status of 502/, /status of 404 .*\/\.session\/events\?/];
const TWINS = TALK.replace('<p>First slide</p>', '<p>TBD</p>\n  <p>TBD</p>\n  <p>TBD</p>');

const badgeOf = (expression, slide = false) => `(() => {
  const el = ${expression};
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const b = [...document.querySelectorAll('.beeson-comment-badge')].find((b) => {
    const q = b.getBoundingClientRect();
    return ${slide} ? Math.abs(q.right - (r.right - 6)) < 2 && Math.abs(q.top - (r.top + 6)) < 2 : [4, 18].some((x) => Math.abs(q.left - (r.right + x)) < 2) && Math.abs(q.bottom - (r.top - 4)) < 2;
  });
  return b ? b.textContent + (b.classList.contains('unread') ? '*' : '') : null;
})()`;
const TWIN_BADGES = `[0, 1, 2].map((i) => !!${badgeOf("document.querySelectorAll('.reveal .slides > section')[0].querySelectorAll('p')[i]")})`;
const on = (heading, selector = null) => `[...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector('h2')?.textContent.startsWith(${JSON.stringify(heading)}))${selector ? `?.querySelector(${JSON.stringify(selector)})` : ''}`;

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
  await clickText(a, '.reveal .slides > section:nth-child(1) > p');
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

  await a.evaluate(HOLD);
  await show(a, 'One');
  await clickText(a, '.reveal .slides > section:nth-child(1) > p');
  await press(a, 'Escape');
  await a.evaluate(`window.BeesonEditor.exec('element.delete')`);
  await a.waitFor('window.__held.length === 1');
  await caretAtEnd(a, el(0, 'h2'));
  await type(a, ' held');
  await a.evaluate('window.__goOne()');
  await a.waitFor(`window.__held.length === 1 && ${C}.base.text.split('<p>TBD</p>').length === 3`);
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

test('a thread whose answer was lost is made once when it is sent again', { timeout: 300_000 }, async (t) => {
  const { server, pages: [a, b] } = await pair(t);
  await b.evaluate(`(() => {
    const fetched = window.fetch;
    let lose = 1;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input.url;
      if (lose && url.endsWith('/.session/comments') && init?.method === 'POST') {
        lose--;
        return fetched.call(this, input, init).then(() => Promise.reject(new TypeError('Failed to fetch')));
      }
      return fetched.call(this, input, init);
    };
  })()`);
  await show(b, 'One');
  await click(b, '.reveal .slides > section:nth-child(1) p');
  await press(b, COMMENT_KEY);
  await b.waitFor(`document.activeElement?.matches('${PANE} .draft textarea')`);
  await type(b, 'Sent once');
  await click(b, `${PANE} .draft .actions .primary`);
  await sees(b, `document.querySelector('${PANE} .draft .error:not([hidden])')?.textContent ?? null`, LOST);
  await sees(b, `document.querySelector('${PANE} .draft .actions .primary').disabled`, false);
  await click(b, `${PANE} .draft .actions .primary`);
  await b.waitFor(`!document.querySelector('${PANE} .draft')`);
  const kept = await b.evaluate(`${C}.transport.comments(${C}.token).then((r) => r.comments.map((c) => c.text))`);
  assert.deepEqual(kept, ['Sent once'], 'the threads of the edit command');
  await openPane(a);
  await sees(a, ARTICLES, 1, 'the threads on the other page');
  await sees(b, ARTICLES, 1, 'the threads on the page that sent them');
  assert.equal(await converge(server, [a, b]), TALK);
  clean(a);
  clean(b);
});

test('what a person read of a thread is kept over a reload', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  const ann = await a.evaluate(`${C}.person`);
  const x = await mention(b, 'X', ann);
  const y = await mention(b, 'Y', ann);
  await openPane(a);
  await sees(a, COUNT, 'Comments, 2 unread');
  await sees(a, ARTICLES, 2);
  await click(a, `${PANE} article[data-id="${y}"] .text`);
  await sees(a, COUNT, 'Comments, 1 unread');
  await sees(a, UNREAD, [`${x}*`, y]);
  await sees(a, `document.querySelector('${PANE} article[data-id="${y}"]').getAttribute('aria-label')`, 'Thread by Ben');

  await reload(a);
  await openPane(a);
  await sees(a, UNREAD, [`${x}*`, y]);
  await sees(a, COUNT, 'Comments, 1 unread');
  clean(a);
  clean(b);
});

test('what a person read of a thread reaches the other pages of the person', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const a = await tab(browser, url);
  const other = await tab(browser, url);
  const b = await open(browser, url, { name: 'Ben' });
  await converge(server, [a, other, b]);
  const ann = await a.evaluate(`${C}.person`);
  assert.equal(await other.evaluate(`${C}.person`), ann, 'the tabs are one person');
  const x = await mention(b, 'X', ann);
  const y = await mention(b, 'Y', ann);
  await openPane(other);
  await sees(other, UNREAD, [`${x}*`, `${y}*`]);
  await sees(other, COUNT, 'Comments, 2 unread');

  await openPane(a);
  await sees(a, ARTICLES, 2);
  await click(a, `${PANE} article[data-id="${y}"] .text`);
  await sees(a, COUNT, 'Comments, 1 unread');
  await sees(a, UNREAD, [`${x}*`, y]);
  await sees(other, COUNT, 'Comments, 1 unread');
  await sees(other, UNREAD, [`${x}*`, y]);
  clean(a);
  clean(other);
  clean(b);
});

test('a listener that throws does not stop the page', { timeout: 300_000 }, async (t) => {
  const { server, pages: [a, b] } = await pair(t);
  await b.evaluate(`(${C}.on('comments', () => { throw new Error('a listener of the test throws'); }), true)`);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'A comment');
  await openPane(b);
  await sees(b, ARTICLES, 1, 'the thread on the page whose listener throws');
  await caretAtEnd(a, el(0, 'h2'));
  await type(a, ' typed');
  await until(() => server.read().includes('<h2>One typed</h2>'), 'the typing to reach index.html');
  await sees(b, `${C}.base.text.includes('<h2>One typed</h2>')`, true, 'the typing on the page whose listener throws');
  await converge(server, [a, b]);
  clean(a);
  clean(b, [/a listener of the test throws/]);
});

test('an element of another name at the offset of an anchor is not taken', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'On the paragraph');
  await badge(b, 'One', 'p', '1*');
  await b.evaluate(`(() => {
    const c = ${C};
    const at = c.port.offsetOf(${el(0, 'p')});
    const heading = ${el(0, 'h2')};
    const elementsAt = c.port.elementsAt;
    c.port.elementsAt = () => elementsAt().set(at, heading);
    c.emit('base', c.base.text, c.base.v, []);
  })()`);
  await badge(b, 'One', null, '1*');
  await badge(b, 'One', 'h2', null);
  clean(a);
  clean(b);
});

test('the badges of four threads are placed with one read of the elements of the deck', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  for (const [heading, slide] of [['One', 1], ['Two', 2]]) {
    await show(a, heading);
    for (const selector of ['h2', 'p']) {
      await click(a, `.reveal .slides > section:nth-child(${slide}) ${selector}`);
      await comment(a, `On ${selector} of ${heading}`);
    }
  }
  await badge(b, 'Two', 'p', '1*');
  const reads = await b.evaluate(`(() => {
    const c = ${C};
    let reads = 0;
    for (const map of [c.app.pairing.elements, c.app.pairing.inner]) {
      const of = map[Symbol.iterator].bind(map);
      map[Symbol.iterator] = () => (reads++, of());
    }
    c.emit('base', c.base.text, c.base.v, []);
    return new Promise((done) => requestAnimationFrame(() => setTimeout(() => done(reads))));
  })()`);
  assert.ok(reads <= 2, `the elements and the inner elements are read once, and they were read ${reads} times`);
  await badge(b, 'Two', 'p', '1*');
  clean(a);
  clean(b);
});

test('a reply of another person in a thread of the person is unread until the person reads it', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'Mine');
  const id = await a.evaluate(`document.querySelector('${PANE} article').dataset.id`);
  await sees(a, COUNT, 'Comments');
  await b.evaluate(`${C}.transport.post('comments/${id}/reply', { token: ${C}.token, text: 'A reply', mentions: [] }).then(() => true)`);
  await sees(a, COUNT, 'Comments, 1 unread');
  await badge(a, 'One', 'p', '1*');
  await openPane(a);
  await click(a, `${PANE} article[data-id="${id}"] .text`);
  await sees(a, COUNT, 'Comments');
  await badge(a, 'One', 'p', '1');
  clean(a);
  clean(b);
});

test('a dot on the button Comments shows an unread open thread while no comment of For You is unread', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  const ann = await a.evaluate(`${C}.person`);
  const post = (text) => b.evaluate(`${C}.transport.post('comments', { token: ${C}.token, anchor: null, slide: null, base: ${C}.base.v, text: ${JSON.stringify(text)}, mentions: [] }).then((t) => t.id)`);
  const act = (id, route) => b.evaluate(`${C}.transport.post('comments/${id}/${route}', { token: ${C}.token }).then(() => true)`);
  const none = ['Comments', '', null];
  const dot = ['Comments, unread threads', '', 'dot'];
  await sees(a, BUTTON, none);
  const g = await post('For everyone');
  await sees(a, BUTTON, dot);
  const m = await mention(b, 'For Ann', ann);
  await sees(a, BUTTON, ['Comments, 1 unread', '1', 'number']);
  await openPane(a);
  await click(a, `${PANE} article[data-id="${m}"] .text`);
  await sees(a, BUTTON, dot);
  await act(g, 'resolve');
  await sees(a, BUTTON, none);
  await act(g, 'reopen');
  await sees(a, BUTTON, dot);
  await click(a, `${PANE} article[data-id="${g}"] .text`);
  await sees(a, BUTTON, none);
  clean(a);
  clean(b);
});

const HELD_COMMENTS = `{
  const fetched = window.fetch;
  window.__comments = [];
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const answer = fetched.call(this, input, init);
    if (url.includes('/.session/events')) {
      return answer.then(async (r) => {
        if (!r.ok) return r;
        const body = await r.json();
        delete body.comments;
        return new Response(JSON.stringify(body), { status: r.status, headers: r.headers });
      });
    }
    if (!url.includes('/.session/comments?') || window.__goingComments) return answer;
    return answer.then((r) => new Promise((done) => window.__comments.push(() => done(r))));
  };
  window.__goComments = () => {
    window.__goingComments = true;
    for (const go of window.__comments.splice(0)) go();
  };
}`;

test('an answer of GET comments older than the base is moved through the operations applied since', { timeout: 300_000 }, async (t) => {
  const { server, pages: [a, b] } = await pair(t);
  await show(a, 'Two');
  await click(a, '.reveal .slides > section:nth-child(2) > p');
  await comment(a, 'On the paragraph');
  await badge(a, 'Two', 'p', '1');

  await a.send('Page.addScriptToEvaluateOnNewDocument', { source: HELD_COMMENTS });
  await reload(a);
  await a.waitFor('window.__comments.length === 1');
  await show(b, 'One');
  await caretAtEnd(b, el(0, 'h2'));
  await type(b, ' typed');
  await until(() => server.read().includes('<h2>One typed</h2>'), 'the typing to reach index.html');
  await a.waitFor(`${C}.base.text.includes('<h2>One typed</h2>')`);
  assert.equal(await a.evaluate('window.__comments.length'), 1, 'the answer of GET comments waits');
  await a.evaluate('window.__goComments()');
  await badge(a, 'Two', 'p', '1');
  clean(a);
  clean(b);
});

test('an answer of GET comments older than a removal of its element and the Undo of it is moved through both', { timeout: 300_000 }, async (t) => {
  const { server, pages: [a, b] } = await pair(t);
  await show(a, 'Two');
  await click(a, '.reveal .slides > section:nth-child(2) > p');
  await comment(a, 'On the paragraph');
  await badge(a, 'Two', 'p', '1');
  await a.send('Page.addScriptToEvaluateOnNewDocument', { source: HELD_COMMENTS });
  await reload(a);
  await a.waitFor('window.__comments.length === 1');
  await show(b, 'One');
  await caretAtEnd(b, el(0, 'h2'));
  await type(b, ' typed');
  await until(() => server.read().includes('<h2>One typed</h2>'), 'the typing to reach index.html');
  const before = server.read();
  await show(b, 'Two');
  await clickText(b, '.reveal section.present > p');
  await press(b, 'Escape');
  await b.evaluate(`window.BeesonEditor.exec('element.delete')`);
  await until(() => !server.read().includes('Second slide'), 'the removal to reach index.html');
  await a.waitFor(`!${C}.base.text.includes('Second slide')`);
  await front(b);
  await press(b, 'Mod+Z');
  await until(() => server.read() === before, 'the undo to reach index.html');
  await a.waitFor(`${C}.base.text === ${JSON.stringify(before)}`);
  assert.equal(await a.evaluate('window.__comments.length'), 1, 'the answer of GET comments waits');
  await a.evaluate('window.__goComments()');
  await badge(a, 'Two', 'p', '1');
  clean(a);
  clean(b);
});

test('a comment written on one page of a person is not unread on another page of the person', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const a = await tab(browser, url);
  const other = await tab(browser, url);
  await converge(server, [a, other]);
  await openPane(other);
  await a.evaluate(`${C}.transport.post('comments', { token: ${C}.token, anchor: null, slide: null, base: ${C}.base.v, text: 'Written by Ann', mentions: [] })`);
  await sees(other, `[...document.querySelectorAll('${PANE} article')].map((a) => a.classList.contains('unread'))`, [false]);
  await sees(other, COUNT, 'Comments');
  clean(a);
  clean(other);
});

test('a draft whose element is not found in the source says so and is not sent', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann']);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await press(a, COMMENT_KEY);
  await a.waitFor(`document.activeElement?.matches('${PANE} .draft textarea')`);
  await type(a, 'On a paragraph without an offset');
  await a.evaluate(`(() => { const port = ${C}.port; const find = port.offsetOf.bind(port); port.offsetOf = (x) => (x.localName === 'p' ? null : find(x)); })()`);
  await click(a, `${PANE} .draft .actions .primary`);
  await sees(a, `document.querySelector('${PANE} .draft .error:not([hidden])')?.textContent ?? null`, 'The element is not found in the deck. Try again.');
  assert.deepEqual(await a.evaluate(`${C}.transport.comments(${C}.token).then((r) => r.comments.length)`), 0);
  clean(a);
});

test('a thread refused for a base that left the log is sent again on a new base', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann']);
  await a.evaluate(`(() => {
    const fetched = window.fetch;
    let refuse = 1;
    window.__refused = 0;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input.url;
      if (refuse && url.endsWith('/.session/comments') && init?.method === 'POST') {
        refuse--;
        window.__refused++;
        return Promise.resolve(new Response(JSON.stringify({ error: 'base is not in the log, read the deck again' }), { status: 409, headers: { 'Content-Type': 'application/json' } }));
      }
      return fetched.call(this, input, init);
    };
  })()`);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'Sent on a new base');
  assert.equal(await a.evaluate('window.__refused'), 1, 'the first thread is refused');
  assert.deepEqual(await a.evaluate(`${C}.transport.comments(${C}.token).then((r) => r.comments.map((c) => c.text))`), ['Sent on a new base']);
  clean(a);
});

test('the keys typed in a deck of 2 MB add less than 30 texts of the deck to the memory of a page', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const scene = `<script type="application/json">${JSON.stringify('x'.repeat(2 * 2 ** 20))}</script>`;
  const server = await talkOf(t, TALK.replace('<script src="theme/vendor', `${scene}\n<script src="theme/vendor`));
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const deck = (await converge(server, [a])).length;
  const held = async () => {
    await a.send('HeapProfiler.collectGarbage');
    return (await a.send('Runtime.getHeapUsage')).usedSize;
  };
  await show(a, 'One');
  await caretAtEnd(a, el(0, 'h2'));
  const before = await held();
  for (let i = 0; i < 80; i++) {
    await type(a, 'k');
    await a.waitFor(`${C}.acked()`);
  }
  await converge(server, [a]);
  const texts = ((await held()) - before) / deck;
  assert.ok(texts < 30, `80 keys added ${texts.toFixed(1)} texts of the deck of ${deck} characters to the heap of the page`);
  clean(a);
});
