// the pane Comments, its badges, and its toasts in Chrome, on pages of one edit command: a comment
// on a held element and on the target of a context menu, the headings of the slides, the text of a
// reply kept through a delete, a resolve, a move, and a reload, the offline state, the mentions, the
// count of the text, the mode of Version History, the keys, the times, the toasts, the direction of
// a text, the badge of a selected element, the contrast, the accessibility tree, the initials, and
// a phone of 390 px

import assert from 'node:assert/strict';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd, frame, front } from './helpers/apply.mjs';
import { C, clean, converge, loads, ONLINE, open, sessionUrl, show, STATE, talk, TALK, TEXT } from './helpers/client.mjs';
import { center, click, clickText, contrast, drag, GROUND, INK, press, type, typeKeys } from './helpers/editor.mjs';
import { NET } from './helpers/net.mjs';
import { copied, goOffline, ROWS, tab } from './helpers/offline.mjs';
import { post as request, startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

// the element of selector on the slide at index
const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;
const COMMENT_KEY = process.platform === 'darwin' ? 'Mod+Alt+M' : 'Shift+F2';
const PANE = '.beeson-edit-inspector .panel.comments';
const OFFLINE = 'Comments can be sent once you are back online';
const REFUSED = [/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|ERR_SOCKET_NOT_CONNECTED/, /status of 502/, /status of 404 .*\/\.session\/events\?/];
const THREADS = `[...document.querySelectorAll('${PANE} article')].map((a) => ({
  anchor: a.querySelector('.anchor')?.textContent ?? null,
  texts: [...a.querySelectorAll('.item .text')].map((p) => p.textContent),
}))`;
const TOASTS = `[...document.querySelectorAll('.beeson-session-toast > span')].map((s) => s.textContent)`;
const COUNT = `document.querySelector('.beeson-session-comments').getAttribute('aria-label')`;
const BUBBLE = `document.querySelector('.beeson-bubble')?.textContent ?? null`;
// the name of the person who holds the element of expression, or null
const HOLDER = (expression) => `(window.BeesonSession.presence().holderOf(${expression})?.name ?? null)`;
// the id of the thread of the focus, or the tag of the focused element outside a thread
const ACTIVE = `document.activeElement?.closest('article')?.dataset.id ?? document.activeElement?.localName ?? null`;
const DRAFT = `${PANE} .draft textarea`;
const ARTICLE = (id) => `${PANE} article[data-id="${id}"]`;

// the controls of selector that are shown and take a tap on less than 32 by 32 px, counting a
// pseudo-element ::after placed around a control, or that are not inside the window
const HITS = (selector) => `[...document.querySelectorAll(${JSON.stringify(selector)})].filter((b) => b.getClientRects().length).map((b) => {
  const r = b.getBoundingClientRect();
  const a = getComputedStyle(b, '::after');
  const out = (v) => (a.content !== 'none' && a.position === 'absolute' ? Math.max(0, -parseFloat(v) || 0) : 0);
  return { name: b.getAttribute('aria-label') || b.textContent.trim() || b.localName, w: Math.round(r.width + out(a.left) + out(a.right)), h: Math.round(r.height + out(a.top) + out(a.bottom)), inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
}).filter((b) => b.w < 32 || b.h < 32 || !b.inside)`;

// waits until expression reads as want on page, in front so that it draws frames, and fails with
// the last value read
async function sees(page, expression, want, what = expression, timeout = 15_000) {
  await front(page);
  let got;
  try {
    await until(async () => {
      got = await page.evaluate(expression);
      return JSON.stringify(got) === JSON.stringify(want);
    }, what, timeout);
  } catch {
    assert.deepEqual(got, want, what);
  }
}

async function openPane(page) {
  await front(page);
  if (!(await page.evaluate(`window.BeesonEditor.state('view.comments').checked`))) await page.evaluate(`window.BeesonEditor.exec('view.comments')`);
  await page.waitFor(`!!document.querySelector('${PANE}:not([hidden])')`);
}

// a click on the item labeled label of the open menu, e.g. a context menu or the menu of a thread
async function menu(page, label) {
  const item = `[...document.querySelectorAll('.beeson-edit-menu [role^="menuitem"]')].find((i) => (i.querySelector('.label') ?? i).textContent === ${JSON.stringify(label)})`;
  await page.waitFor(`!!${item}`);
  const at = await page.evaluate(`(() => { const r = ${item}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await click(page, at);
}

// a tap of a finger at the center of the element of selector, on the page brought to the front,
// since a page behind does not take a touch. it fails after 10 s rather than after the limit of
// the browser
async function touch(page, selector) {
  await front(page);
  const { x, y } = await center(page, selector);
  for (const [type, touchPoints] of [['touchStart', [{ x, y }]], ['touchEnd', []]]) {
    let timer;
    const late = new Promise((_, fail) => (timer = setTimeout(() => fail(new Error(`the page did not take the ${type} on ${selector}`)), 10_000)));
    await Promise.race([page.send('Input.dispatchTouchEvent', { type, touchPoints }), late]).finally(() => clearTimeout(timer));
  }
}

// a new comment of text on what the Comment command targets now, sent from the draft of the pane,
// and the label of its place
async function comment(page, text) {
  await front(page);
  await press(page, COMMENT_KEY);
  await page.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await type(page, text);
  const label = await page.evaluate(`document.querySelector('${PANE} .draft .anchor').textContent`);
  await click(page, `${PANE} .draft .actions .primary`);
  await page.waitFor(`!document.querySelector('${PANE} .draft')`);
  return label;
}

// a comment of text on the slide at index, sent by the page with the transport of the client, with
// each @Name of a person who joined written as a mention, and the id of its thread
const post = (page, slide, text) => page.evaluate(`(async () => {
  const c = ${C};
  const t = c.base.text;
  let at = -1;
  for (let k = 0; k <= ${slide}; k++) at = t.indexOf('<section', at + 1);
  const mentions = [];
  const text = ${JSON.stringify(text)}.replace(/@([A-Za-z]+)/g, (m, name) => {
    const k = c.known.find((k) => k.name === name);
    if (!k) return m;
    mentions.push(k.person);
    return '@{' + k.person + '}';
  });
  const thread = await c.transport.post('comments', { token: c.token, anchor: null, slide: { start: at, end: t.indexOf('>', at) + 1 }, base: c.base.v, text, mentions });
  return thread.id;
})()`);

// a request route on the thread id sent by page, e.g. resolve, delete, or reply
const act = (page, id, route, body = {}) => page.evaluate(`${C}.transport.post('comments/${id}/${route}', { token: ${C}.token, ...${JSON.stringify(body)} }).then(() => true)`);

// the comments as the edit command keeps them
const stored = (page) => page.evaluate(`${C}.transport.comments(${C}.token).then((a) => a.comments.map((t) => ({ text: t.text, mentions: t.mentions, replies: t.replies.map((r) => r.text) })))`);

async function pair(t, names = ['Ann', 'Ben']) {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const pages = [];
  for (const name of names) pages.push(await open(browser, sessionUrl(server.edit), { name }));
  await converge(server, pages);
  return { browser, server, pages };
}

// a talk folder with the slides of slides in place of those of TALK, and with tex next to it as
// tex.js, which the deck loads, when it is given, and the edit command on it
async function talkWith(t, slides, tex = null) {
  const deck = TALK.replace(/<section>[\s\S]*<\/section>\n/, slides);
  const folder = talkFolder(t, tex === null ? deck : deck.replace('<script src="theme/beeson.js">', '<script src="tex.js"></script>\n<script src="theme/beeson.js">'));
  if (tex !== null) writeFileSync(join(folder.talk, 'tex.js'), tex);
  for (const dir of ['theme', 'brand']) cpSync(resolve(dir), join(folder.talk, dir), { recursive: true });
  const file = join(folder.talk, 'index.html');
  const server = { ...folder, file, read: () => readFileSync(file, 'utf8'), edit: await startEdit(folder.talk, { env: { XDG_CONFIG_HOME: folder.config, APPDATA: folder.config } }) };
  t.after(async () => {
    await stopEdit(server.edit);
    rmSync(folder.root, { recursive: true, force: true });
  });
  return server;
}

// the node of the first element of selector in the accessibility tree of Chrome, with its role,
// name, description, properties, and the roles of its children that are not ignored, or null
async function ax(page, selector) {
  await page.send('Accessibility.enable', {});
  const { root } = await page.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (!nodeId) return null;
  const { node } = await page.send('DOM.describeNode', { nodeId });
  const { nodes } = await page.send('Accessibility.getFullAXTree', {});
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const n = nodes.find((x) => x.backendDOMNodeId === node.backendNodeId);
  if (!n) return null;
  const props = Object.fromEntries((n.properties ?? []).map((p) => [p.name, p.value?.relatedNodes ? p.value.relatedNodes.length : p.value?.value]));
  const children = (n.childIds ?? []).map((id) => byId.get(id)).filter((c) => c && !c.ignored).map((c) => c.role?.value);
  return { role: n.role?.value, ignored: !!n.ignored, name: n.name?.value ?? '', description: n.description?.value ?? '', props, children };
}

// waits until the node of selector in the accessibility tree holds every field of want, since
// Chrome updates this tree some time after a change of the page
async function axIs(page, selector, want, what = selector) {
  let got = null;
  const holds = () => got && Object.entries(want).every(([k, v]) => JSON.stringify(k === 'props' ? Object.fromEntries(Object.keys(v).map((p) => [p, got.props[p]])) : got[k]) === JSON.stringify(v));
  try {
    await until(async () => {
      got = await ax(page, selector);
      return holds();
    }, what, 5000);
  } catch {
    assert.fail(`${what}: ${JSON.stringify(got)} does not hold ${JSON.stringify(want)}`);
  }
}

// the texts of the toasts of page from now on, one entry per toast shown, in window.__toasts
const recordToasts = (page) => page.evaluate(`(() => {
  window.__toasts = [];
  let last = '';
  const read = () => {
    const span = document.querySelector('.beeson-session-toast > span');
    const now = span ? span.textContent : '';
    if (now && now !== last) window.__toasts.push(now);
    last = now;
  };
  new MutationObserver(read).observe(document.body, { childList: true, subtree: true, characterData: true });
  return true;
})()`);

// the time in ms that page shows a toast, set to ms through the option toasts of the client where
// it has one, and the time in effect
const toastTime = (page, ms) => page.evaluate(`(() => { const o = window.BeesonSession.toasts; if (o) o.shown = ${ms}; return o ? o.shown : 6000; })()`);

// waits until the clock of page has run ms past now
const elapse = (page, ms) => page.evaluate(`(() => { window.__until = performance.now() + ${ms}; return true; })()`).then(() => page.waitFor('performance.now() > window.__until', ms + 15_000));

test('a held text element takes a comment from the context menu, and its thread opens with the element selected and without a bubble', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  const p = el(0, 'p');
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'Before the hold');
  const id = await a.evaluate(`document.querySelector('${PANE} article').dataset.id`);
  await a.evaluate(`${C}.app.selection.clear()`);

  await show(b, 'One');
  // the caret of Ann left the paragraph for the draft, and the end of her hold reaches Ben later
  await until(async () => (await b.evaluate(HOLDER(p))) === null, 'the paragraph that Ann left to be free on the page of Ben');
  await caretAtEnd(b, p);
  await until(async () => (await a.evaluate(HOLDER(p))) === 'Ben', 'the hold of Ben on the paragraph to reach the page of Ann');

  await t.test('the item Comment of the context menu of a held element anchors the draft on it', async () => {
    await front(a);
    await click(a, '.reveal .slides > section:nth-child(1) p', { button: 'right' });
    await menu(a, 'Comment');
    await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
    assert.equal(await a.evaluate(`document.querySelector('${PANE} .draft .anchor').textContent`), 'On Paragraph: First slide');
    await press(a, 'Escape');
    await a.waitFor(`!document.querySelector('${PANE} .draft')`);
  });

  await t.test('a thread of a held element opens with its slide shown, the thread focused, and the element selected, without a bubble', async () => {
    await show(a, 'Two');
    await a.evaluate(`document.querySelector('.beeson-bubble')?.remove()`);
    await click(a, `${ARTICLE(id)} .text`);
    await sees(a, ACTIVE, id);
    assert.deepEqual(await a.evaluate(`({ slide: Reveal.getIndices().h, selected: ${C}.app.selection.has(${p}), bubble: ${BUBBLE} })`), { slide: 0, selected: true, bubble: null });
  });
  clean(a);
  clean(b);
});

test('the item Comment of the context menu of the background of a slide anchors the draft on the slide', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann']);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  assert.equal(await a.evaluate(`${C}.app.selection.has(${el(0, 'p')})`), true);
  const at = await a.evaluate(`(() => { const r = Reveal.getCurrentSlide().getBoundingClientRect(); return { x: r.right - 30, y: r.bottom - 30 }; })()`);
  await click(a, at, { button: 'right' });
  await menu(a, 'Comment');
  await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  assert.equal(await a.evaluate(`document.querySelector('${PANE} .draft .anchor').textContent`), 'On Slide 1');
  clean(a);
});

test('a person who opens a draft of a comment stops following', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  const ann = await a.evaluate(`${C}.person`);
  await b.evaluate(`window.BeesonSession.follow().start(${JSON.stringify(ann)})`);
  await b.waitFor(`window.BeesonSession.follow().target === ${JSON.stringify(ann)}`);
  // the command on the slide shown, which leaves the selection as it is
  await b.evaluate(`window.BeesonEditor.exec('insert.comment')`);
  await b.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await sees(b, `window.BeesonSession.follow().target`, null);
  clean(a);
  clean(b);
});

test('while the comments are read only, a draft and a reply stay in their fields, the reason is toasted, and only a press sends again', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann']);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'Before');
  const id = await a.evaluate(`document.querySelector('${PANE} article').dataset.id`);
  // from now on the edit command answers each new comment and reply as it does while comments.json
  // can be neither read nor set aside
  const reason = 'the comments could not be read at the start, hence they are read only until the edit command is started again';
  const told = `Not sent. ${reason[0].toUpperCase()}${reason.slice(1)}.`;
  await a.evaluate(`(() => {
    window.__posts = 0;
    const fetched = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input.url;
      if (init?.method === 'POST' && /\\/\\.session\\/comments(\\/[^/]+\\/reply)?$/.test(url)) {
        window.__posts++;
        return Promise.resolve(new Response(JSON.stringify({ error: ${JSON.stringify(reason)} }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
      }
      return fetched.call(this, input, init);
    };
  })()`);
  await recordToasts(a);
  const field = (box) => `(() => { const b = document.querySelector(${JSON.stringify(box)}); return b && { value: b.querySelector('textarea').value, error: b.querySelector('.error:not([hidden])')?.textContent ?? null, sending: b.querySelector('.actions .primary').disabled }; })()`;

  await press(a, COMMENT_KEY);
  await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await type(a, 'A kept draft');
  await click(a, `${PANE} .draft .actions .primary`);
  await sees(a, field(`${PANE} .draft`), { value: 'A kept draft', error: told, sending: false });
  await sees(a, 'window.__toasts', [told]);

  await click(a, `${ARTICLE(id)} .reply textarea`);
  await type(a, 'A kept reply');
  await click(a, `${ARTICLE(id)} .reply .actions .primary`);
  await sees(a, field(`${ARTICLE(id)} .reply`), { value: 'A kept reply', error: told, sending: false });
  await sees(a, 'window.__posts', 2, 'one request for each press');

  await click(a, `${PANE} .draft .actions .primary`);
  await sees(a, 'window.__posts', 3, 'one request for the second press');
  await sees(a, field(`${PANE} .draft`), { value: 'A kept draft', error: told, sending: false });
  assert.deepEqual(await stored(a), [{ text: 'Before', mentions: [], replies: [] }]);
  assert.equal(await a.evaluate('window.__posts'), 3);
  clean(a, [/status of 503/]);
});

// the pressed button is disabled while its request runs, and Chrome then moves its focus to the body
test('after a press of Reply or Comment, the focus is on the thread of a saved reply and in the field of a refused text', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann']);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'Before');
  const id = await a.evaluate(`document.querySelector('${PANE} article').dataset.id`);
  const FOCUS = `(() => {
    const a = document.activeElement;
    return a.matches('${ARTICLE(id)}') ? 'the thread' : a.matches('${ARTICLE(id)} .reply textarea') ? 'the field Reply' : a.matches('${DRAFT}') ? 'the field of the draft' : a.localName;
  })()`;
  const answered = (box) => `(() => { const b = document.querySelector(${JSON.stringify(box)}); return !!b && !b.querySelector('.actions .primary').disabled && !!b.querySelector('.error:not([hidden])'); })()`;

  await click(a, `${ARTICLE(id)} .reply textarea`);
  await type(a, 'A saved reply');
  await click(a, `${ARTICLE(id)} .reply .actions .primary`);
  await sees(a, `[...document.querySelectorAll('${ARTICLE(id)} .text')].map((p) => p.textContent)`, ['Before', 'A saved reply']);
  await sees(a, FOCUS, 'the thread', 'the focus after a saved reply');

  await a.evaluate(`(() => {
    const fetched = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input.url;
      if (!(init?.method === 'POST' && /\\/\\.session\\/comments(\\/[^/]+\\/reply)?$/.test(url))) return fetched.call(this, input, init);
      // the answer comes after two frames, as one of a network does, i.e. after the browser has
      // moved the focus of the disabled button
      return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(new Response(JSON.stringify({ error: 'the comments are read only' }), { status: 503, headers: { 'Content-Type': 'application/json' } })))));
    };
  })()`);
  await click(a, `${ARTICLE(id)} .reply textarea`);
  await type(a, 'A kept reply');
  await click(a, `${ARTICLE(id)} .reply .actions .primary`);
  await sees(a, answered(`${ARTICLE(id)} .reply`), true);
  await sees(a, FOCUS, 'the field Reply', 'the focus after a refused reply');

  await click(a, '.reveal .slides > section:nth-child(1) p');
  await press(a, COMMENT_KEY);
  await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await type(a, 'A kept draft');
  await click(a, `${PANE} .draft .actions .primary`);
  await sees(a, answered(`${PANE} .draft`), true);
  await sees(a, FOCUS, 'the field of the draft', 'the focus after a refused comment');
  clean(a, [/status of 503/]);
});

test('the pane groups the threads by their slide, and two slides with one number in the status bar have a heading each', { timeout: 300_000 }, async (t) => {
  const server = await talkWith(t, `<section>
  <h2>One</h2>
  <p>First slide</p>
</section>

<section>
  <section>
    <h2>Up</h2>
    <p>Upper slide</p>
  </section>
  <section>
    <h2>Down</h2>
    <p>Lower slide</p>
  </section>
</section>

<section>
  <h2>Three</h2>
  <p>Third slide</p>
</section>
`);
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  for (const heading of ['Down', 'Three']) {
    await a.evaluate(`(() => {
      const s = [...document.querySelectorAll('.reveal .slides section')].find((s) => s.querySelector(':scope > h2')?.textContent === ${JSON.stringify(heading)});
      const { h, v } = Reveal.getIndices(s);
      Reveal.slide(h, v);
      window.__shown = s;
    })()`);
    await a.waitFor('Reveal.getCurrentSlide() === window.__shown');
    await click(a, '.reveal section.present > p');
    await comment(a, `On ${heading}`);
  }
  await sees(a, `[...document.querySelectorAll('${PANE} .list > *')].map((n) => n.localName === 'h3' ? 'heading ' + n.textContent : n.querySelector('.text')?.textContent)`, ['heading Slide 3', 'On Down', 'heading Slide 3', 'On Three']);
  clean(a);
});

test('a reply being typed when its thread is deleted by another person becomes the draft of a new comment on the same element', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'To be deleted');
  const id = await a.evaluate(`document.querySelector('${PANE} article').dataset.id`);
  await openPane(b);
  await sees(b, `!!document.querySelector('${ARTICLE(id)}')`, true);
  await click(b, `${ARTICLE(id)} .reply textarea`);
  await type(b, 'A long reply typed by Ben');
  await act(a, id, 'delete');
  await sees(b, `(() => { const d = document.querySelector('${DRAFT}'); return d && [d.value, document.querySelector('${PANE} .draft .anchor').textContent, document.activeElement === d]; })()`, ['A long reply typed by Ben', 'On Paragraph: First slide', true]);
  await sees(b, TOASTS, ['Ann deleted this thread. Your reply is kept as a new comment.']);
  await click(b, `${PANE} .draft .actions .primary`);
  await sees(a, THREADS, [{ anchor: 'On Paragraph: First slide', texts: ['A long reply typed by Ben'] }]);
  clean(a);
  clean(b);
});

test('a reply being typed when its thread is resolved by another person stays, and sending it reopens the thread', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'Thread to resolve');
  const id = await a.evaluate(`document.querySelector('${PANE} article').dataset.id`);
  await openPane(b);
  await sees(b, `!!document.querySelector('${ARTICLE(id)}')`, true);
  await click(b, `${ARTICLE(id)} .reply textarea`);
  await type(b, 'Reply before resolve');
  await act(a, id, 'resolve');
  await sees(b, `!!document.querySelector('${ARTICLE(id)} .resolved-by')`, true);
  assert.deepEqual(await b.evaluate(`(() => {
    const area = document.querySelector('${ARTICLE(id)} .reply textarea');
    return { by: document.querySelector('${ARTICLE(id)} .resolved-by').textContent.replace(/, .*/, ''), value: area?.value, focused: document.activeElement === area };
  })()`), { by: 'Resolved by Ann', value: 'Reply before resolve', focused: true });
  await click(b, `${ARTICLE(id)} .reply .actions .primary`);
  await sees(a, `(() => { const t = document.querySelector('${ARTICLE(id)}'); return t && [!!t.querySelector('.resolved-by'), [...t.querySelectorAll('.text')].map((p) => p.textContent)]; })()`, [false, ['Thread to resolve', 'Reply before resolve']]);
  clean(a);
  clean(b);
});

test('a live update that moves the thread of a reply being typed keeps its node, the focus, and the caret', { timeout: 300_000 }, async (t) => {
  const { server, pages: [a, b] } = await pair(t);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'On One');
  await show(a, 'Two');
  await click(a, '.reveal .slides > section:nth-child(2) > p');
  await comment(a, 'On Two');
  const id = await a.evaluate(`[...document.querySelectorAll('${PANE} article')].find((n) => n.querySelector('.text').textContent === 'On Two').dataset.id`);
  await click(a, `${ARTICLE(id)} .reply textarea`);
  await type(a, 'typing a reply');
  await a.evaluate(`document.querySelector('${ARTICLE(id)}').__mark = 1`);
  // reveal.js blurs the focus when a page is shown again, as each flip of the page in front in this
  // test does, whereas a person on another machine does not show the page of Ann again
  await a.evaluate(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => undefined })`);
  await front(b);
  await click(b, '.beeson-edit-nav .row:nth-of-type(2)');
  await b.evaluate(`window.BeesonEditor.exec('slide.moveUp')`);
  await converge(server, [a, b]);
  await sees(a, `[...document.querySelectorAll('${PANE} article .item:first-child .text')].map((p) => p.textContent)`, ['On Two', 'On One']);
  assert.deepEqual(await a.evaluate(`(() => {
    const area = document.querySelector('${ARTICLE(id)} .reply textarea');
    return { same: document.querySelector('${ARTICLE(id)}').__mark === 1, focused: document.activeElement === area, caret: area.selectionStart, value: area.value };
  })()`), { same: true, focused: true, caret: 14, value: 'typing a reply' });
  await typeKeys(a, 'xyz');
  await sees(a, `document.querySelector('${ARTICLE(id)} .reply textarea').value`, 'typing a replyxyz');
  clean(a);
  clean(b);
});

test('offline, Resolve, Reopen, Edit, Delete, and the send buttons are disabled, and a failed action does not promise a later send', { timeout: 300_000 }, async (t) => {
  const { server, pages: [a] } = await pair(t, ['Ann']);
  const { port } = server.edit;
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'Before the stop');
  const id = await a.evaluate(`document.querySelector('${PANE} article').dataset.id`);
  const one = await post(a, 1, 'Resolved before the stop');
  // the page hears of the thread and of its resolve before the stop, since the edit command writes
  // comments.json before it answers
  await sees(a, `!!document.querySelector('${ARTICLE(one)}')`, true);
  await act(a, one, 'resolve');
  await sees(a, `!!document.querySelector('${ARTICLE(one)}')`, false);
  await click(a, `${ARTICLE(id)} .reply textarea`);
  await type(a, 'Typed before the stop');
  await until(() => readFileSync(join(server.talk, '.session', 'comments.json'), 'utf8').includes('"resolved"'), 'the edit command to write the comments');

  server.edit.child.kill('SIGKILL');
  await server.edit.exited;
  await a.waitFor(`/^Offline/.test(${STATE})`);
  const CONTROLS = (thread) => `[...document.querySelectorAll('${ARTICLE(thread)} :is(.resolve, .text-button, .more, .reply .actions .primary)')].map((b) => [b.getAttribute('aria-label') || b.textContent, b.disabled, b.title])`;
  await sees(a, CONTROLS(id), [['Resolve', true, OFFLINE], ['Thread actions', true, OFFLINE], ['Reply', true, OFFLINE]]);
  await a.evaluate(`document.querySelector('${PANE} .filters [data-filter="resolved"]').click()`);
  await sees(a, CONTROLS(one), [['Reopen', true, OFFLINE], ['Thread actions', true, OFFLINE]]);
  await a.evaluate(`document.querySelector('${PANE} .filters [data-filter="open"]').click()`);
  // the key E on a thread does nothing while offline
  await a.evaluate(`document.querySelector('${ARTICLE(id)}').focus()`);
  await recordToasts(a);
  await press(a, 'E');
  assert.equal(await a.evaluate(`document.querySelector('${ARTICLE(id)} .reply textarea').value`), 'Typed before the stop');

  await server.start(['--port', String(port)]);
  // a toast of a request that the key sent and that failed has come by the restart of the edit command
  assert.deepEqual(await a.evaluate('window.__toasts'), [], 'the toasts after the key E');
  await front(a);
  await click(a, '.beeson-session-action');
  await a.waitFor(ONLINE);
  await sees(a, CONTROLS(id), [['Resolve', false, 'Resolve'], ['Thread actions', false, 'Thread actions'], ['Reply', false, '']]);
  // a request resolve that fails as on a network error
  await a.evaluate(`(() => {
    const fetched = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input.url;
      return url.includes('/resolve') ? Promise.reject(new TypeError('Failed to fetch')) : fetched.call(this, input, init);
    };
  })()`);
  await click(a, `${ARTICLE(id)} .resolve`);
  await sees(a, `${TOASTS}.length`, 1);
  assert.notEqual((await a.evaluate(TOASTS))[0], OFFLINE);
  assert.equal(await converge(server, [a]), TALK);
  clean(a, REFUSED);
});

test('a draft and a reply being typed are kept through a reload of the page, and removed when sent or discarded', { timeout: 300_000 }, async (t) => {
  const { server, pages: [a] } = await pair(t, ['Ann']);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'A thread');
  const id = await a.evaluate(`document.querySelector('${PANE} article').dataset.id`);
  // the times of the writes of the typed texts into sessionStorage
  await a.evaluate(`(() => {
    window.__writes = [];
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (this === sessionStorage && /comment/.test(k) && /Half/.test(v)) window.__writes.push(performance.now());
      return set.call(this, k, v);
    };
  })()`);
  await click(a, `${ARTICLE(id)} .reply textarea`);
  await typeKeys(a, 'Half a reply');
  await caretAtEnd(a, el(0, 'h2'));
  await press(a, COMMENT_KEY);
  await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await typeKeys(a, 'Half a draft');
  await a.waitFor(`Object.keys(sessionStorage).some((k) => /comment/.test(k) && /Half a draft/.test(sessionStorage.getItem(k)) && /Half a reply/.test(sessionStorage.getItem(k)))`);
  const writes = await a.evaluate('window.__writes');
  assert.ok(writes.every((w, i) => i === 0 || w - writes[i - 1] >= 900), `the writes are a second apart or more: ${JSON.stringify(writes)}`);

  const count = await loads(a);
  await a.evaluate('location.reload()').catch(() => {});
  await until(async () => (await loads(a).catch(() => 0)) > count, 'the page to load again');
  await a.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  await a.waitFor(ONLINE);
  await sees(a, `(() => { const d = document.querySelector('${DRAFT}'); return d && [d.value, document.querySelector('${PANE} .draft .anchor').textContent]; })()`, ['Half a draft', 'On Heading: One']);
  await sees(a, `document.querySelector('${ARTICLE(id)} .reply textarea')?.value ?? null`, 'Half a reply');

  await click(a, `${ARTICLE(id)} .reply .actions .primary`);
  await sees(a, THREADS, [{ anchor: 'On Paragraph: First slide', texts: ['A thread', 'Half a reply'] }]);
  // Cancel discards a draft with text, which Esc keeps
  await click(a, `${PANE} .draft .actions button:not(.primary)`);
  await a.waitFor(`!document.querySelector('${PANE} .draft')`);
  await sees(a, `Object.keys(sessionStorage).filter((k) => /comment/.test(k) && /Half/.test(sessionStorage.getItem(k)))`, []);
  assert.equal(await converge(server, [a]), TALK);
  clean(a);
});

// the label and the text of the draft of the pane, or null
const DRAFTED = `(() => { const d = document.querySelector('${PANE} .draft'); return d && { label: d.querySelector('.anchor').textContent, text: d.querySelector('textarea').value }; })()`;

// page leaves, change is made, which has reads in index.html, and page loads again, as a tab does
// that a phone drops in the background. others are the pages that stay
async function left(server, page, others, change, has) {
  const url = await page.evaluate('location.href');
  await page.goto('about:blank');
  await change();
  await until(() => has(server.read()), 'the change to reach index.html');
  await converge(server, others);
  await page.goto(url);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  await page.waitFor(ONLINE);
  await converge(server, [page, ...others]);
}

// a draft with the text Half a draft on target, of kind element or slide, and its label and text
async function drafted(page, target, kind = 'element') {
  await front(page);
  await page.evaluate(`window.BeesonEditor.exec('insert.comment', { kind: '${kind}', target: ${target} })`);
  await page.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await typeKeys(page, 'Half a draft');
  return page.evaluate(DRAFTED);
}

test('a draft stays on its element when an element before it is removed or inserted while its page is away', { timeout: 660_000 }, async (t) => {
  const { server, pages: [a, b] } = await pair(t);
  const state = DRAFTED;
  const away = (change, has) => left(server, a, [b], change, has);
  // the draft of Ann is on the first item of the list, which another item follows
  await show(a, 'Two');
  await a.evaluate(`window.BeesonEditor.exec('insert.comment', { kind: 'element', target: ${el(1, 'li')} })`);
  await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await typeKeys(a, 'Half a draft');
  const first = await a.evaluate(state);
  assert.deepEqual(first, { label: 'On Item: Alpha', text: 'Half a draft' });

  // Ben removes the paragraph above the list, hence each item is one element earlier in its slide
  await away(async () => {
    await show(b, 'Two');
    await clickText(b, '.reveal section.present > p');
    await press(b, 'Escape');
    await b.evaluate(`window.BeesonEditor.exec('element.delete')`);
  }, (text) => !text.includes('Second slide'));
  await sees(a, state, first, 'the draft after a removal');

  // an item written before the first one, outside the editor
  await away(() => writeFileSync(server.file, server.read().replace('<li>Alpha</li>', '<li>Omega</li>\n    <li>Alpha</li>')), (text) => text.includes('Omega'));
  await sees(a, state, first, 'the draft after an insertion');

  // the text of the item itself is changed, and the draft falls back to the slide
  await away(() => writeFileSync(server.file, server.read().replace('<li>Alpha</li>', '<li>Alpha, changed</li>')), (text) => text.includes('Alpha, changed'));
  await sees(a, state, { label: 'On Slide 2', text: 'Half a draft' }, 'the draft after a change of its element');

  // a slide written before the slide of the draft
  await away(() => writeFileSync(server.file, server.read().replace('<section>\n  <h2>Two</h2>', '<section>\n  <h2>Between</h2>\n</section>\n\n<section>\n  <h2>Two</h2>')), (text) => text.includes('Between'));
  await sees(a, state, { label: 'On Slide 3', text: 'Half a draft' }, 'the draft after an insertion of a slide');
  await click(a, `${PANE} .draft .actions .primary`);
  await sees(a, `[${state}, ${THREADS}]`, [null, [{ anchor: 'On Slide 3', texts: ['Half a draft'] }]]);
  clean(a);
  clean(b);
});

test('a draft on an element that its page inserted is kept on it through a reload of the page', { timeout: 300_000 }, async (t) => {
  const { server, pages: [a] } = await pair(t, ['Ann']);
  const state = `(() => { const d = document.querySelector('${PANE} .draft'); return d && { label: d.querySelector('.anchor').textContent, text: d.querySelector('textarea').value }; })()`;
  await show(a, 'One');
  await a.evaluate(`window.BeesonEditor.exec('insert.text')`);
  await a.waitFor(`document.querySelectorAll('.reveal .slides > section:nth-child(1) p').length === 2`);
  await typeKeys(a, 'Mine');
  await until(() => server.read().includes('Mine'), 'the new paragraph to reach index.html');
  await converge(server, [a]);
  await a.evaluate(`window.BeesonEditor.exec('insert.comment', { kind: 'element', target: [...document.querySelectorAll('.reveal .slides > section:nth-child(1) p')].find((p) => p.textContent === 'Mine') })`);
  await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await typeKeys(a, 'Half a draft');
  const first = await a.evaluate(state);
  assert.deepEqual(first, { label: 'On Paragraph: Mine', text: 'Half a draft' });
  const count = await loads(a);
  await a.evaluate('location.reload()').catch(() => {});
  await until(async () => (await loads(a).catch(() => 0)) > count, 'the page to load again');
  await a.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  await a.waitFor(ONLINE);
  await sees(a, state, first, 'the draft after a reload');
  clean(a);
});

test('a draft stays on its element when its page leaves with an edit before it that the edit command has not acknowledged', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann']);
  await show(a, 'Two');
  const first = await drafted(a, el(1, 'li'));
  assert.deepEqual(first, { label: 'On Item: Alpha', text: 'Half a draft' });
  // the operations of the page are held, as on a network that does not answer
  await a.evaluate(`(() => {
    const fetched = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input.url;
      return url.includes('/.session/op') ? new Promise(() => {}) : fetched.call(this, input, init);
    };
  })()`);
  // a paragraph inserted before the list
  await caretAtEnd(a, el(1, 'p'));
  await press(a, 'Enter');
  await typeKeys(a, 'Inserted');
  // a reread of the deck, as places() and add() of comments.ts make, puts the paragraph into the
  // source and not into the base
  await a.evaluate(`${C}.port.rebase().then(() => true)`);
  await a.waitFor(`${C}.app.source.text.includes('Inserted') && !${C}.acked()`, 30_000);
  await a.send('Page.enable', {});
  const count = await loads(a);
  // the page asks before it leaves while the copy in the browser does not hold its edit yet
  const accept = setInterval(() => a.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}), 200);
  accept.unref();
  await a.evaluate('location.reload()').catch(() => {});
  await until(async () => (await loads(a).catch(() => 0)) > count, 'the page to load again', 30_000);
  clearInterval(accept);
  await a.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  await a.waitFor(ONLINE);
  await sees(a, DRAFTED, first, 'the draft after a reload with an edit before it that was not acknowledged');
});

test('a draft stays on its element when its page leaves without its own edit of the element, which it cannot keep', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  // IndexedDB fails, as in a private window, hence the edits that wait are not kept, and the draft
  // is found only by the start tag of its element in the base
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann', script: `IDBFactory.prototype.open = function () { throw new DOMException('refused by the test', 'SecurityError'); };` });
  await converge(server, [a]);
  await show(a, 'Two');
  const first = await drafted(a, el(1, 'li'));
  assert.deepEqual(first, { label: 'On Item: Alpha', text: 'Half a draft' });
  await a.evaluate(`(() => {
    const fetched = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input.url;
      return url.includes('/.session/op') ? new Promise(() => {}) : fetched.call(this, input, init);
    };
  })()`);
  await caretAtEnd(a, el(1, 'li'));
  await typeKeys(a, ' typed');
  await a.evaluate(`${C}.port.rebase().then(() => true)`);
  await a.waitFor(`${C}.app.source.text.includes('Alpha typed') && !${C}.acked()`, 30_000);
  const count = await loads(a);
  // the page asks before it leaves with an edit that it cannot keep
  const accept = setInterval(() => a.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}), 200);
  accept.unref();
  await a.evaluate('location.reload()').catch(() => {});
  await until(async () => (await loads(a).catch(() => 0)) > count, 'the page to load again', 30_000);
  clearInterval(accept);
  await a.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  await a.waitFor(ONLINE);
  await converge(server, [a]);
  assert.ok(!server.read().includes('Alpha typed'), 'the edit that was not kept is gone');
  await sees(a, DRAFTED, first, 'the draft after a reload that dropped its own edit of the element');
});

test('a draft goes to its slide, and not to an element that reads the same, when its element is changed or removed while its page is away', { timeout: 660_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talkWith(t, `<section>
  <h2>One</h2>
  <ul>
    <li>TBD</li>
  </ul>
</section>

<section>
  <h2>Two</h2>
  <table>
    <tr><td>a</td><td>0</td></tr>
    <tr><td>b</td><td>0</td></tr>
    <tr><td>c</td><td>0</td></tr>
  </table>
  <ul>
    <li>Done</li>
    <li>TBD</li>
  </ul>
</section>
`);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [a, b]);
  const away = (change, has) => left(server, a, [b], () => writeFileSync(server.file, change(server.read())), has);
  const cancel = async () => {
    await click(a, `${PANE} .draft .actions button:not(.primary)`);
    await a.waitFor(`!document.querySelector('${PANE} .draft')`);
  };
  await show(a, 'Two');

  // a paragraph written above the table moves the three cells that read 0 by more than a row, and
  // the draft stays on the cell of row c
  const cell = { label: 'On Table cell: 0', text: 'Half a draft' };
  assert.deepEqual(await drafted(a, el(1, 'tr:nth-child(3) td:nth-child(2)')), cell);
  await away((text) => text.replace('  <table>', '  <p>A paragraph written above the table while the page was away</p>\n  <table>'), (text) => text.includes('written above'));
  await sees(a, DRAFTED, cell, 'the draft after an insertion above three cells that read the same');
  await click(a, `${PANE} .draft .actions .primary`);
  await a.waitFor(`!document.querySelector('${PANE} .draft')`);
  await converge(server, [a, b]);
  const sent = await a.evaluate(`${C}.transport.comments(${C}.token).then((x) => x.comments.map((c) => c.anchor.start))`);
  assert.deepEqual(sent.map((start) => server.read().slice(start - 10, start + 10)), ['<td>c</td><td>0</td>'], 'the comment is on the cell of row c');

  // the item of the draft is removed, and the item of slide Two that reads the same is not taken
  await show(a, 'One');
  assert.deepEqual(await drafted(a, el(0, 'li')), { label: 'On Item: TBD', text: 'Half a draft' });
  await away((text) => text.replace('    <li>TBD</li>\n', ''), (text) => text.split('<li>TBD</li>').length === 2);
  await sees(a, DRAFTED, { label: 'On Slide 1', text: 'Half a draft' }, 'the draft after a removal of its item, which read as an item of another slide');
  await cancel();

  // the cell of the draft is changed, and a cell of another row that reads as it did is not taken
  await show(a, 'Two');
  assert.deepEqual(await drafted(a, el(1, 'tr:nth-child(1) td:nth-child(2)')), cell);
  await away((text) => text.replace('<td>a</td><td>0</td>', '<td>a</td><td>7</td>'), (text) => text.includes('<td>7</td>'));
  await sees(a, DRAFTED, { label: 'On Slide 2', text: 'Half a draft' }, 'the draft after a change of its cell, which read as two other cells');
  clean(a);
  clean(b);
});

// the draft of page sent, and the newest comment as the 20 characters around its anchor and the
// heading of its slide in index.html
async function sentAt(page, server) {
  const SENT = `${C}.transport.comments(${C}.token).then((x) => x.comments.map((c) => ({ id: c.id, at: c.anchor.start, slide: c.slide.start })))`;
  const before = new Set((await page.evaluate(SENT)).map((c) => c.id));
  await click(page, `${PANE} .draft .actions .primary`);
  await page.waitFor(`!document.querySelector('${PANE} .draft')`);
  const text = server.read();
  return (await page.evaluate(SENT)).filter((c) => !before.has(c.id)).map((c) => ({ near: text.slice(c.at - 10, c.at + 10), slide: /<h2>([^<]*)/.exec(text.slice(c.slide, c.slide + 40))?.[1] }));
}

// slides with items TBD on One and Two, and a table with three cells that read 0 on Three
const TWINS = `<section>
  <h2>One</h2>
  <ul>
    <li>Done</li>
    <li>TBD</li>
  </ul>
</section>

<section>
  <h2>Two</h2>
  <ul>
    <li>TBD</li>
  </ul>
</section>

<section>
  <h2>Three</h2>
  <ul>
    <li>Later</li>
  </ul>
  <table>
    <tr><td>a</td><td>0</td></tr>
    <tr><td>b</td><td>0</td></tr>
    <tr><td>c</td><td>0</td></tr>
  </table>
</section>
`;

test('a draft stays on its element when an element that reads the same before it is removed and one after it is added while its page is away', { timeout: 660_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talkWith(t, TWINS);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [a, b]);
  const away = (change, has) => left(server, a, [b], () => writeFileSync(server.file, change(server.read())), has);

  // the item TBD of slide One is removed, and one is added on slide Three, hence the draft on the
  // item of slide Two is the second of two items again
  await show(a, 'Two');
  const item = { label: 'On Item: TBD', text: 'Half a draft' };
  assert.deepEqual(await drafted(a, el(1, 'li')), item);
  await away((text) => text.replace('    <li>Done</li>\n    <li>TBD</li>\n', '    <li>Done</li>\n').replace('    <li>Later</li>\n', '    <li>Later</li>\n    <li>TBD</li>\n'), (text) => text.includes('<li>Later</li>\n    <li>TBD</li>'));
  await sees(a, DRAFTED, item, 'the draft after its twins moved');
  assert.deepEqual(await sentAt(a, server), [{ near: ' <ul>\n    <li>TBD</l', slide: 'Two' }], 'the comment is on the item of slide Two');

  // row a is removed and row d is added, hence the draft on the cell of row b is the first of three
  await show(a, 'Three');
  const cell = { label: 'On Table cell: 0', text: 'Half a draft' };
  assert.deepEqual(await drafted(a, el(2, 'tr:nth-child(2) td:nth-child(2)')), cell);
  await away((text) => text.replace('    <tr><td>a</td><td>0</td></tr>\n', '').replace('    <tr><td>c</td><td>0</td></tr>\n', '    <tr><td>c</td><td>0</td></tr>\n    <tr><td>d</td><td>0</td></tr>\n'), (text) => text.includes('<td>d</td>'));
  await sees(a, DRAFTED, cell, 'the draft after its row moved');
  assert.deepEqual(await sentAt(a, server), [{ near: '<td>b</td><td>0</td>', slide: 'Three' }], 'the comment is on the cell of row b');
  clean(a);
  clean(b);
});

test('a draft stays on its element when an element is added right before it, and another element that reads the same has the same text before it', { timeout: 660_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talkWith(t, `<section>
  <h2>One</h2>
  <ul>
    <li>TBD</li>
  </ul>
</section>

<section>
  <h2>Two</h2>
  <ul>
    <li>TBD</li>
  </ul>
</section>
`);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [a, b]);
  await show(a, 'One');
  const item = { label: 'On Item: TBD', text: 'Half a draft' };
  assert.deepEqual(await drafted(a, el(0, 'li')), item);
  await left(server, a, [b], () => writeFileSync(server.file, server.read().replace('<h2>One</h2>\n  <ul>\n', '<h2>One</h2>\n  <ul>\n    <li>Intro</li>\n')), (text) => text.includes('<li>Intro</li>'));
  await sees(a, DRAFTED, item, 'the draft after an item added right before it');
  assert.deepEqual(await sentAt(a, server), [{ near: '</li>\n    <li>TBD</l', slide: 'One' }], 'the comment is on the item of slide One');
  clean(a);
  clean(b);
});

test('a draft stays on the second of two elements that read the same, with the same text before them, when a slide added before both moves them by more than their distance', { timeout: 660_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talkWith(t, `<section>
  <h2>One</h2>
  <ul>
    <li>TBD</li>
  </ul>
</section>

<section>
  <h2>Two</h2>
  <ul>
    <li>TBD</li>
  </ul>
</section>
`);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [a, b]);
  await show(a, 'Two');
  const item = { label: 'On Item: TBD', text: 'Half a draft' };
  assert.deepEqual(await drafted(a, el(1, 'li')), item);
  // the item of slide One is then the nearest to the old offset of the item of the draft
  await left(server, a, [b], () => writeFileSync(server.file, server.read().replace('<section>\n  <h2>One', '<section>\n  <h2>Zero</h2>\n  <p>A slide written before the others while the page was away</p>\n</section>\n\n<section>\n  <h2>One')), (text) => text.includes('<h2>Zero</h2>'));
  await sees(a, DRAFTED, item, 'the draft after a slide added before it');
  assert.deepEqual(await sentAt(a, server), [{ near: ' <ul>\n    <li>TBD</l', slide: 'Two' }], 'the comment is on the item of slide Two');
  clean(a);
  clean(b);
});

// the draft kept by the page in sessionStorage, as its text and the fields of the spot of its element
const KEPT = `(() => { const d = JSON.parse(sessionStorage.getItem('beeson-session-comment-texts:' + location.pathname) || 'null')?.draft; return d && { text: d.text, fields: Object.keys(d.el ?? {}).sort() }; })()`;

test('a draft that a browser kept without the text before its element is found by its index among the elements that read the same', { timeout: 660_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talkWith(t, TWINS);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [a, b]);
  await show(a, 'Two');
  const item = { label: 'On Item: TBD', text: 'Half a draft' };
  assert.deepEqual(await drafted(a, el(1, 'li')), item);
  await a.waitFor(`${KEPT}?.text === 'Half a draft'`);
  assert.ok((await a.evaluate(KEPT)).fields.includes('left'), 'the page keeps the text before the element');
  // from now on the page keeps its draft as a client before the field left did
  await a.evaluate(`(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (String(k).startsWith('beeson-session-comment-texts:') && v) {
        const s = JSON.parse(v);
        for (const x of [s.draft?.el, s.draft?.el?.own, s.draft?.slide]) if (x) delete x.left;
        v = JSON.stringify(s);
      }
      return set.call(this, k, v);
    };
    return true;
  })()`);
  await typeKeys(a, '!');
  await a.waitFor(`${KEPT}?.text === 'Half a draft!'`);
  assert.ok(!(await a.evaluate(KEPT)).fields.includes('left'), 'the page keeps its draft without the text before the element');
  // a paragraph above the list changes the text before the item of the draft, and keeps its index
  await left(server, a, [b], () => writeFileSync(server.file, server.read().replace('<h2>Two</h2>\n  <ul>\n', '<h2>Two</h2>\n  <p>Above</p>\n  <ul>\n')), (text) => text.includes('<p>Above</p>'));
  await sees(a, DRAFTED, { ...item, text: 'Half a draft!' }, 'the draft kept without the text before its element');
  assert.deepEqual(await sentAt(a, server), [{ near: ' <ul>\n    <li>TBD</l', slide: 'Two' }], 'the comment is on the item of slide Two');
  clean(a);
  clean(b);
});

test('a draft on a slide that reads as another slide, and a draft on a stack, stay on it when it is changed while the page is away', { timeout: 660_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talkWith(t, `<section>
  <h2>One</h2>
</section>

<section>
  <h2>Title</h2>
</section>

<section>
  <h2>Title</h2>
</section>

<section>
  <section>
    <h2>Up</h2>
    <p>Upper slide</p>
  </section>
  <section>
    <h2>Down</h2>
  </section>
</section>
`);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [a, b]);
  const away = (change, has) => left(server, a, [b], () => writeFileSync(server.file, change(server.read())), has);
  const slide = (i) => `document.querySelectorAll('.reveal .slides > section')[${i}]`;

  // the second of two slides that read the same is renamed
  await a.evaluate('Reveal.slide(2)');
  assert.deepEqual(await drafted(a, slide(2), 'slide'), { label: 'On Slide 3', text: 'Half a draft' });
  await away((text) => {
    const i = text.lastIndexOf('<h2>Title</h2>');
    return `${text.slice(0, i)}<h2>Named</h2>${text.slice(i + 14)}`;
  }, (text) => text.includes('Named'));
  await sees(a, DRAFTED, { label: 'On Slide 3', text: 'Half a draft' }, 'the draft after a change of its slide, which read as the slide before it');
  await click(a, `${PANE} .draft .actions button:not(.primary)`);
  await a.waitFor(`!document.querySelector('${PANE} .draft')`);

  // a stack, as a right-click on its row in the navigator targets it, with a change inside it
  await a.evaluate('Reveal.slide(3, 0)');
  assert.deepEqual(await drafted(a, slide(3), 'slide'), { label: 'On the slide', text: 'Half a draft' });
  await away((text) => text.replace('Upper slide', 'Upper slide, changed'), (text) => text.includes('Upper slide, changed'));
  await sees(a, DRAFTED, { label: 'On the slide', text: 'Half a draft' }, 'the draft on a stack after a change inside it');
  clean(a);
  clean(b);
});

test('a draft stays on its element when its page leaves with an edit of this element that the edit command has not acknowledged', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const a = await tab(browser, sessionUrl(server.edit));
  await show(a, 'Two');
  assert.deepEqual(await drafted(a, el(1, 'li:nth-child(2)')), { label: 'On Item: Beta', text: 'Half a draft' });
  // the operations of the page fail, and its edit is kept in the copy of the browser, which is
  // merged once the page has loaded again
  await a.evaluate('window.__blockOps = true');
  await caretAtEnd(a, el(1, 'li:nth-child(2)'));
  await type(a, ' typed');
  await copied(a, 'Beta typed');
  await a.evaluate('(window.__before = true, location.reload())').catch(() => {});
  await until(() => a.evaluate('!window.__before && !!window.BeesonEditor').catch(() => false), 'the page to load again');
  await a.waitFor('window.BeesonEditor.ready.then(() => true)');
  await a.waitFor(ONLINE);
  await until(() => server.read().includes('Beta typed'), 'the copy to reach index.html');
  await sees(a, DRAFTED, { label: 'On Item: Beta typed', text: 'Half a draft' }, 'the draft after a reload with an edit of its element that was not acknowledged');
});

test('a draft goes to its slide, and not to an element that reads the same, when its page leaves with edits that the edit command has not acknowledged, which remove such an element before it and make one after it', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talkWith(t, TWINS.replace('<li>Later</li>', '<li>TB</li>'));
  const a = await tab(browser, sessionUrl(server.edit));
  await show(a, 'Two');
  const item = { label: 'On Item: TBD', text: 'Half a draft' };
  assert.deepEqual(await drafted(a, el(1, 'li')), item);
  // the operations of the page fail, and its edits are kept in the copy of the browser, which is
  // merged once the page has loaded again: the item TBD of slide One becomes TB, and the item TB of
  // slide Three becomes TBD
  await a.evaluate('window.__blockOps = true');
  await show(a, 'One');
  await caretAtEnd(a, el(0, 'li:nth-child(2)'));
  await press(a, 'Backspace');
  await show(a, 'Three');
  await caretAtEnd(a, el(2, 'li'));
  await type(a, 'D');
  const three = '<h2>Three</h2>\n  <ul>\n    <li>TBD</li>';
  await a.waitFor(`(${ROWS}).then((rows) => rows.some((r) => r.mine.includes(${JSON.stringify(three)}) && r.mine.includes('<li>Done</li>\\n    <li>TB</li>')))`, 15_000);
  await a.waitFor(`!${C}.asking`);
  // a key in the draft writes it again, with the item of the draft as the first of two in the text
  // with the edits of the page
  await show(a, 'Two');
  await a.evaluate(`(() => { const x = document.querySelector('${DRAFT}'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); return true; })()`);
  await typeKeys(a, '!');
  const OWN = `JSON.parse(sessionStorage.getItem('beeson-session-comment-texts:' + location.pathname) || 'null')?.draft?.el?.own?.twin`;
  await a.waitFor(`JSON.stringify(${OWN}) === '[0,2]'`);
  await a.evaluate('(window.__before = true, location.reload())').catch(() => {});
  await until(() => a.evaluate('!window.__before && !!window.BeesonEditor').catch(() => false), 'the page to load again');
  await a.waitFor('window.BeesonEditor.ready.then(() => true)');
  await a.waitFor(ONLINE);
  await until(() => server.read().includes(three), 'the copy to reach index.html');
  // the item is the first of two in the text with the edits of the page, and the second in the base,
  // and the page cannot tell whether its edits were merged again
  await front(a);
  await a.waitFor(`${DRAFTED}?.text === 'Half a draft!'`);
  const after = await a.evaluate(DRAFTED);
  assert.deepEqual(await sentAt(a, server), [{ near: 'section>\n\n<section>\n', slide: 'Two' }], 'the comment is on slide Two');
  assert.deepEqual(after, { label: 'On Slide 2', text: 'Half a draft!' }, 'the draft after a reload with edits that moved its twins');
});

test('a draft goes to its slide, and not to an element that reads the same, when its page leaves without its edits, which removed such an element before it and made one after it', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talkWith(t, TWINS.replace('<li>Later</li>', '<li>TB</li>'));
  // IndexedDB fails, as in a private window, hence the edits that wait are lost at the reload
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann', script: `IDBFactory.prototype.open = function () { throw new DOMException('refused by the test', 'SecurityError'); };` });
  await converge(server, [a]);
  await show(a, 'Two');
  assert.deepEqual(await drafted(a, el(1, 'li')), { label: 'On Item: TBD', text: 'Half a draft' });
  await a.evaluate(`(() => {
    const fetched = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input.url;
      return url.includes('/.session/op') ? new Promise(() => {}) : fetched.call(this, input, init);
    };
  })()`);
  await show(a, 'One');
  await caretAtEnd(a, el(0, 'li:nth-child(2)'));
  await press(a, 'Backspace');
  await show(a, 'Three');
  await caretAtEnd(a, el(2, 'li'));
  await type(a, 'D');
  await show(a, 'Two');
  await a.evaluate(`(() => { const x = document.querySelector('${DRAFT}'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); return true; })()`);
  await typeKeys(a, '!');
  const OWN = `JSON.parse(sessionStorage.getItem('beeson-session-comment-texts:' + location.pathname) || 'null')?.draft?.el?.own?.twin`;
  await a.waitFor(`JSON.stringify(${OWN}) === '[0,2]'`);
  const count = await loads(a);
  // the page asks before it leaves with edits that it cannot keep
  const accept = setInterval(() => a.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}), 200);
  accept.unref();
  await a.evaluate('location.reload()').catch(() => {});
  await until(async () => (await loads(a).catch(() => 0)) > count, 'the page to load again', 30_000);
  clearInterval(accept);
  await a.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  await a.waitFor(ONLINE);
  await converge(server, [a]);
  assert.ok(server.read().includes('<li>Done</li>\n    <li>TBD</li>'), 'the edits that were not kept are gone');
  await front(a);
  await a.waitFor(`${DRAFTED}?.text === 'Half a draft!'`);
  const after = await a.evaluate(DRAFTED);
  assert.deepEqual(await sentAt(a, server), [{ near: 'section>\n\n<section>\n', slide: 'Two' }], 'the comment is on slide Two');
  assert.deepEqual(after, { label: 'On Slide 2', text: 'Half a draft!' }, 'the draft after a reload without the edits that moved its twins');
});

test('a mention is toasted once, also after a reload of the page, a reply, and an edit of the comment', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  const id = await post(b, 1, 'Look, @Ann');
  await sees(a, TOASTS, ['Ben mentioned you on slide 2']);
  const count = await loads(a);
  await a.evaluate('location.reload()').catch(() => {});
  await until(async () => (await loads(a).catch(() => 0)) > count, 'the page to load again');
  await a.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  await a.waitFor(ONLINE);
  await openPane(a);
  await sees(a, THREADS, [{ anchor: 'On Slide 2', texts: ['Look, @Ann'] }]);
  await act(b, id, 'reply', { text: 'plain reply', mentions: [] });
  await sees(a, THREADS, [{ anchor: 'On Slide 2', texts: ['Look, @Ann', 'plain reply'] }]);
  assert.deepEqual(await a.evaluate(TOASTS), []);
  const ann = await a.evaluate(`${C}.person`);
  await act(b, id, 'edit', { text: `Look again, @{${ann}}`, mentions: [ann] });
  await sees(a, THREADS, [{ anchor: 'On Slide 2', texts: ['Look again, @Ann', 'plain reply'] }]);
  assert.deepEqual(await a.evaluate(TOASTS), []);
  clean(a);
  clean(b);
});

test('only a name picked from the list is a mention, and a name typed by hand is text', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t, ['Ann', 'Ben', 'Annabel']);
  await show(b, 'One');
  await click(b, '.reveal .slides > section:nth-child(1) p');
  await press(b, COMMENT_KEY);
  await b.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await typeKeys(b, '@An');
  await sees(b, `[...document.querySelectorAll('${PANE} .draft .people li')].map((li) => li.children[1].textContent)`, ['Ann', 'Annabel']);
  await press(b, 'Enter');
  await typeKeys(b, 'and @Annabel');
  await press(b, 'Escape');
  assert.equal(await b.evaluate('document.activeElement.value'), '@Ann and @Annabel');
  await click(b, `${PANE} .draft .actions .primary`);
  await b.waitFor(`!document.querySelector('${PANE} .draft')`);
  const ann = await a.evaluate(`${C}.person`);
  assert.deepEqual((await stored(b)).map((c) => [c.text, c.mentions]), [[`@{${ann}} and @Annabel`, [ann]]]);
  clean(a);
  clean(b);
});

test('an open list of people at an @ is filled again when the people known to the page change, and keeps the highlighted person', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t, ['Ann', 'Ben', 'Annabel']);
  const LIST = `[...document.querySelectorAll('${PANE} .draft .people li')].map((li) => li.children[1].textContent)`;
  const PICKED = `document.querySelector('${PANE} .draft .people li[aria-selected="true"]')?.children[1].textContent ?? null`;
  // the page of Ben knows only the people not named here, until all of them are known again
  const without = (name) => b.evaluate(`(() => { const c = ${C}; window.__known ??= c.known; c.known = window.__known.filter((p) => p.name !== ${JSON.stringify(name)}); c.emit('known'); return true; })()`);
  const all = () => b.evaluate(`(() => { const c = ${C}; c.known = window.__known; c.emit('known'); return true; })()`);
  await show(b, 'One');
  await click(b, '.reveal .slides > section:nth-child(1) p');
  await press(b, COMMENT_KEY);
  await b.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await b.waitFor(`${C}.known.some((p) => p.name === 'Annabel')`);
  // as when Annabel is named to the page of Ben only after the keys
  await without('Annabel');
  await typeKeys(b, '@An');
  await sees(b, LIST, ['Ann']);
  await all();
  await sees(b, LIST, ['Ann', 'Annabel']);
  // the highlight stays on its person when the list changes under it
  await press(b, 'ArrowDown');
  await sees(b, PICKED, 'Annabel');
  await without('Ann');
  await sees(b, LIST, ['Annabel']);
  await all();
  await sees(b, LIST, ['Ann', 'Annabel']);
  assert.equal(await b.evaluate(PICKED), 'Annabel');
  await press(b, 'Enter');
  assert.equal(await b.evaluate('document.activeElement.value'), '@Annabel ');
  clean(a);
  clean(b);
});

test('the list of people at an @ stays open while the field loses the focus and has it again, and closes once the focus leaves',{ timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  const LIST = `!document.querySelector('${PANE} .draft .people').hidden`;
  await show(b, 'One');
  await click(b, '.reveal .slides > section:nth-child(1) p');
  await press(b, COMMENT_KEY);
  await b.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await typeKeys(b, '@An');
  await sees(b, LIST, true);
  // as at a click on a scroll bar, or when the window loses the focus and has it again
  await b.evaluate(`(() => { const d = document.querySelector('${DRAFT}'); d.blur(); d.focus(); return true; })()`);
  await elapse(b, 1000);
  assert.deepEqual(await b.evaluate(`[${LIST}, document.activeElement?.matches('${DRAFT}')]`), [true, true], 'the list and the focus after the field had the focus again');
  await b.evaluate(`document.querySelector('${DRAFT}').blur()`);
  await sees(b, LIST, false, 'the list after the focus left the field');
  clean(a);
  clean(b);
});

test('an edit of a comment keeps two mentions with one shown name apart', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann']);
  // two people that never joined, whose names are thus shown as Someone
  const twins = ['A'.repeat(22), 'B'.repeat(22)];
  const id = await a.evaluate(`(async () => {
    const c = ${C};
    const t = c.base.text;
    const at = t.indexOf('<section', t.indexOf('<section') + 1);
    return (await c.transport.post('comments', { token: c.token, anchor: null, slide: { start: at, end: t.indexOf('>', at) + 1 }, base: c.base.v, text: 'cc @{${twins[0]}} and @{${twins[1]}}', mentions: ${JSON.stringify(twins)} })).id;
  })()`);
  await openPane(a);
  await sees(a, `document.querySelector('${ARTICLE(id)} .text')?.textContent ?? null`, 'cc @Someone and @Someone');
  await click(a, `${ARTICLE(id)} > .item:first-child .more`);
  await menu(a, 'Edit');
  await a.waitFor(`document.activeElement?.matches('${ARTICLE(id)} textarea')`);
  await type(a, '!');
  await click(a, `${ARTICLE(id)} > .item:first-child .actions .primary`);
  await sees(a, `document.querySelector('${ARTICLE(id)} .text')?.textContent ?? null`, 'cc @Someone and @Someone!');
  assert.deepEqual((await stored(a)).map((c) => [c.text, c.mentions]), [[`cc @{${twins[0]}} and @{${twins[1]}}!`, twins]]);
  clean(a);
});

test('the field counts the text as it is sent, with each mention as the id of its person and each character once', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann', 'Ben']);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await press(a, COMMENT_KEY);
  await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await typeKeys(a, '@Be');
  await sees(a, `document.querySelectorAll('${PANE} .draft .people li').length`, 1);
  await press(a, 'Enter');
  await type(a, 'x'.repeat(3985));
  // the field reads @Ben and 3985 x, 3990 characters, and sends a mention of 25 characters
  const SEND = `(() => { const d = document.querySelector('${DRAFT}'); return [d.value.length, document.querySelector('${PANE} .draft .actions .primary').disabled, document.querySelector('${PANE} .draft .error').hidden]; })()`;
  await sees(a, SEND, [3990, true, false]);
  await a.evaluate(`document.querySelector('${DRAFT}').select()`);
  await type(a, '😀'.repeat(2100));
  await sees(a, `(() => { const d = document.querySelector('${DRAFT}'); return [Array.from(d.value).length, document.querySelector('${PANE} .draft .actions .primary').disabled]; })()`, [2100, false]);
  clean(a);
});

test('while the mode of Version History is on, the badges and the button Comments are out of reach, and a toast of a comment waits for its end', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'An open thread');
  await openPane(a);
  await a.evaluate(`window.BeesonEditor.exec('view.comments')`);
  await sees(a, `[...document.querySelectorAll('.beeson-comment-badge')].filter((b) => b.getClientRects().length).length`, 1);
  await a.evaluate(`window.BeesonEditor.exec('file.history')`);
  await a.waitFor(`document.documentElement.classList.contains('beeson-history')`);
  await sees(a, `[...document.querySelectorAll('.beeson-comment-badge')].filter((b) => b.getClientRects().length).length`, 0, 'the badges shown in the mode');
  assert.equal(await a.evaluate(`!!document.querySelector('.beeson-session-comments').closest('[inert]')`), true, 'the button Comments is inert');
  await a.evaluate(`document.querySelector('.beeson-session-comments').click()`);
  assert.equal(await a.evaluate(`document.documentElement.classList.contains('beeson-comments')`), false, 'the tab Comments is not opened');
  await recordToasts(a);
  await post(b, 0, 'Look, @Ann');
  await sees(a, COUNT, 'Comments, 1 unread');
  assert.deepEqual(await a.evaluate(TOASTS), [], 'the toast waits for the end of the mode');
  await front(a);
  await press(a, 'Escape');
  await a.waitFor(`!document.documentElement.classList.contains('beeson-history')`);
  await sees(a, TOASTS, ['Ben mentioned you on slide 1']);
  // the badge of the paragraph and the badge of the slide, which the comment of Ben is on
  await sees(a, `[...document.querySelectorAll('.beeson-comment-badge')].filter((b) => b.getClientRects().length).length`, 2);
  assert.equal(await a.evaluate(`!!document.querySelector('.beeson-session-comments').closest('[inert]')`), false);
  clean(a);
  clean(b);
});

test('after E on a thread, the focus is on the next thread, which alone takes Tab, and an edit returns the focus to its thread', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann']);
  for (const [k, text] of [[0, 'First'], [1, 'Second'], [1, 'Third']]) await post(a, k, text);
  await openPane(a);
  await sees(a, `[...document.querySelectorAll('${PANE} article .text')].map((p) => p.textContent).sort()`, ['First', 'Second', 'Third']);
  const ids = await a.evaluate(`[...document.querySelectorAll('${PANE} article')].map((n) => n.dataset.id)`);
  const TABBABLE = `[...document.querySelectorAll('${PANE} article')].filter((n) => n.tabIndex === 0).map((n) => n.dataset.id)`;
  await a.evaluate(`document.querySelector('${ARTICLE(ids[0])}').focus()`);
  await press(a, 'E');
  await sees(a, `[${ACTIVE}, ${TABBABLE}]`, [ids[1], [ids[1]]]);
  await press(a, 'J');
  await sees(a, ACTIVE, ids[2]);
  await click(a, `${ARTICLE(ids[2])} > .item:first-child .more`);
  await menu(a, 'Edit');
  await sees(a, `document.activeElement?.matches('${ARTICLE(ids[2])} textarea')`, true);
  await press(a, 'Escape');
  await sees(a, ACTIVE, ids[2]);
  await click(a, `${ARTICLE(ids[2])} > .item:first-child .more`);
  await menu(a, 'Edit');
  await sees(a, `document.activeElement?.matches('${ARTICLE(ids[2])} textarea')`, true);
  await typeKeys(a, ' edited');
  await click(a, `${ARTICLE(ids[2])} > .item:first-child .actions .primary`);
  await sees(a, `[${ACTIVE}, document.querySelector('${ARTICLE(ids[2])} .text')?.textContent ?? null]`, [ids[2], 'Third edited']);
  clean(a);
});

test('the times of the pane follow the locale of the browser, as those of Version History do', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann']);
  await a.send('Emulation.setLocaleOverride', { locale: 'de-DE' });
  await post(a, 0, 'In German');
  await openPane(a);
  await sees(a, `!!document.querySelector('${PANE} article .time')`, true);
  const [shown, want] = await a.evaluate(`[document.querySelector('${PANE} article .time').textContent, new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })]`);
  assert.match(shown, /^\d{1,2}:\d{2}$/);
  // the minutes of the day, which differ by 1 also across an hour and midnight
  const minutes = (hm) => hm.split(':').reduce((h, m) => Number(h) * 60 + Number(m));
  assert.ok([0, 1, 1439].includes((minutes(want) - minutes(shown) + 1440) % 1440), `${shown} is the time in de-DE, ${want}`);
  clean(a);
});

test('more toasts than three in a row are joined into one, and each toast has a button that closes it', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  await recordToasts(a);
  await toastTime(a, 1000);
  await Promise.all([1, 2, 3, 4, 5].map((n) => post(b, 0, `Look ${n}, @Ann`)));
  // the pointer over the first toast holds it until every mention has arrived
  await a.waitFor(`!!document.querySelector('.beeson-session-toast > span')`);
  await a.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...(await center(a, '.beeson-session-toast > span')) });
  await sees(a, COUNT, 'Comments, 5 unread');
  await a.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
  await a.waitFor(`window.__toasts.length >= 2 && !document.querySelector('.beeson-session-toast > span')`, 30_000);
  assert.deepEqual(await a.evaluate('window.__toasts'), ['Ben mentioned you on slide 1', '4 new comments']);

  await toastTime(a, 60_000);
  await recordToasts(a);
  await Promise.all([6, 7, 8, 9, 10].map((n) => post(b, 1, `Look ${n}, @Ann`)));
  await sees(a, COUNT, 'Comments, 10 unread');
  await sees(a, HITS('.beeson-session-toast button'), []);
  await click(a, '.beeson-session-toast button[aria-label="Close"]');
  await sees(a, TOASTS, ['4 new comments']);
  await click(a, '.beeson-session-toast button:not([aria-label="Close"])');
  await sees(a, `[${TOASTS}, document.documentElement.classList.contains('beeson-comments'), document.querySelector('${PANE} .filters [aria-pressed="true"]')?.dataset.filter]`, [[], true, 'mine']);
  clean(a);
  clean(b);
});

test('a toast stays while the pointer is over it or the focus is in it', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  const shown = await toastTime(a, 500);
  await post(b, 0, 'Look, @Ann');
  await sees(a, TOASTS, ['Ben mentioned you on slide 1']);
  await a.evaluate(`document.querySelector('.beeson-session-toast button').focus()`);
  await elapse(a, shown * 3);
  assert.deepEqual(await a.evaluate(`[${TOASTS}, document.activeElement?.textContent]`), [['Ben mentioned you on slide 1'], 'Show']);
  await a.evaluate(`document.activeElement.blur()`);
  await sees(a, TOASTS, []);

  await post(b, 0, 'Again, @Ann');
  await sees(a, TOASTS, ['Ben mentioned you on slide 1']);
  await a.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...(await center(a, '.beeson-session-toast > span')) });
  await elapse(a, shown * 3);
  assert.deepEqual(await a.evaluate(TOASTS), ['Ben mentioned you on slide 1']);
  await a.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
  await sees(a, TOASTS, []);
  clean(a);
  clean(b);
});

test('Enter, Tab, and Escape do nothing in a field while an input method composes', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann', 'Ben']);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await press(a, COMMENT_KEY);
  await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await typeKeys(a, 'Hi @Be');
  await sees(a, `document.querySelectorAll('${PANE} .draft .people li').length`, 1);
  const key = (init) => a.evaluate(`document.querySelector('${DRAFT}').dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...${JSON.stringify(init)} }))`);
  await key({ key: 'Enter', isComposing: true });
  await key({ key: 'Tab', keyCode: 229 });
  await key({ key: 'Escape', isComposing: true });
  assert.deepEqual(await a.evaluate(`[document.querySelector('${DRAFT}')?.value ?? null, document.querySelector('${PANE} .draft .people')?.hidden ?? null]`), ['Hi @Be', false]);
  await press(a, 'Escape');
  await key({ key: 'Escape', keyCode: 229 });
  assert.equal(await a.evaluate(`document.querySelector('${DRAFT}')?.value ?? null`), 'Hi @Be');
  clean(a);
});

test('the text of a comment takes the direction of its words, and a name in running text is isolated', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t, ['Ann', 'Ben']);
  const id = await post(b, 0, 'שלום, @Ann!');
  await sees(a, `[...document.querySelectorAll('.beeson-session-toast > span bdi')].map((n) => n.textContent)`, ['Ben']);
  await act(b, id, 'resolve');
  await openPane(a);
  await a.evaluate(`document.querySelector('${PANE} .filters [data-filter="resolved"]').click()`);
  await sees(a, `!!document.querySelector('${ARTICLE(id)} .text')`, true);
  assert.deepEqual(await a.evaluate(`(() => {
    const t = document.querySelector('${ARTICLE(id)}');
    return { text: t.querySelector('.text').dir, mention: t.querySelector('.mention').localName, by: [...t.querySelectorAll('.resolved-by bdi')].map((n) => n.textContent), who: t.querySelector('.who').dir };
  })()`), { text: 'auto', mention: 'bdi', by: ['Ben'], who: 'auto' });
  await a.evaluate(`document.querySelector('${PANE} .filters [data-filter="open"]').click()`);
  await caretAtEnd(a, el(0, 'h2'));
  await press(a, COMMENT_KEY);
  await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  assert.equal(await a.evaluate(`document.querySelector('${DRAFT}').dir`), 'auto');
  clean(a);
  clean(b);
});

test('the badge of a selected element is clear of the grips of its frame', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann']);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'On the paragraph');
  // a press on a text element puts the caret in it, and Escape then selects the element
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await press(a, 'Escape');
  await sees(a, `${C}.app.selection.kind === 'elements' && ${C}.app.selection.has(${el(0, 'p')})`, true);
  await sees(a, `document.querySelectorAll('.beeson-comment-badge').length`, 1);
  // each grip of the frame is the element at its center, rather than the badge
  await sees(a, `[...document.querySelectorAll('.beeson-grip')].filter((g) => g.getClientRects().length).map((g) => {
    const r = g.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return at === g ? null : g.dataset.handle + ' ' + (at?.className ?? '');
  }).filter(Boolean)`, []);
  clean(a);
});

test('the key of the command Comment opens a draft while the focus is in the pane', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann']);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'The first');
  await sees(a, `!!document.activeElement?.closest('${PANE} article')`, true);
  await press(a, COMMENT_KEY);
  await sees(a, `document.activeElement?.matches('${DRAFT}') ? document.querySelector('${PANE} .draft .anchor').textContent : null`, 'On Paragraph: First slide');
  clean(a);
});

for (const scheme of ['dark', 'light']) {
  test(`in ${scheme} mode, the text of a badge, a count, and a mention reaches 4.5:1, and the unread bar and the focus 3:1`, { timeout: 300_000 }, async (t) => {
    const { pages: [a, b] } = await pair(t);
    await show(a, 'One');
    await click(a, '.reveal .slides > section:nth-child(1) p');
    await comment(a, 'Mine');
    const mine = await a.evaluate(`document.querySelector('${PANE} article').dataset.id`);
    const theirs = await post(b, 1, 'Look, @Ann');
    await a.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await openPane(a);
    await sees(a, `!!document.querySelector('${ARTICLE(theirs)}.unread .mention')`, true);
    await a.evaluate(`document.querySelector('${ARTICLE(mine)}').focus()`);
    await show(a, 'One');
    await sees(a, `document.querySelectorAll('.beeson-comment-badge').length`, 1);
    const one = await a.evaluate(`[${INK}(document.querySelector('.beeson-comment-badge')), ${GROUND}(document.querySelector('.beeson-comment-badge'))]`);
    const counts = await a.evaluate(`[...document.querySelectorAll('.beeson-edit-nav .beeson-comment-count')].map((c) => [c.className, ${INK}(c), ${GROUND}(c)])`);
    const mention = await a.evaluate(`(() => { const m = document.querySelector('${ARTICLE(theirs)} .mention'); return [${INK}(m), ${GROUND}(m)]; })()`);
    const bar = await a.evaluate(`(() => { const t = document.querySelector('${ARTICLE(theirs)}'); return ['rgb(' + getComputedStyle(t).boxShadow.match(/rgba?\\(([^)]*)\\)/)[1] + ')', ${GROUND}(t)]; })()`);
    const focus = await a.evaluate(`(() => { const t = document.querySelector('${ARTICLE(mine)}'); const s = getComputedStyle(t); return [s.outlineStyle, s.outlineColor, ${GROUND}(t.parentElement)]; })()`);
    await show(a, 'Two');
    await sees(a, `document.querySelectorAll('.beeson-comment-badge.unread').length`, 1);
    const unread = await a.evaluate(`[${INK}(document.querySelector('.beeson-comment-badge')), ${GROUND}(document.querySelector('.beeson-comment-badge'))]`);
    const ratios = {
      badge: contrast(...one) >= 4.5,
      unreadBadge: contrast(...unread) >= 4.5,
      counts: counts.length === 2 && counts.every(([, ink, ground]) => contrast(ink, ground) >= 4.5),
      mention: contrast(...mention) >= 4.5,
      bar: contrast(...bar) >= 3,
      focus: focus[0] !== 'none' && contrast(focus[1], focus[2]) >= 3,
    };
    assert.deepEqual(ratios, { badge: true, unreadBadge: true, counts: true, mention: true, bar: true, focus: true }, JSON.stringify({ one, unread, counts, mention, bar, focus }));
    clean(a);
    clean(b);
  });
}

test('the accessibility tree of Chrome holds the field of a mention as a combobox, the list without a role, a thread described by its text, and the toast region before its first toast', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  await front(a);
  await axIs(a, '.beeson-session-toast', { role: 'status', ignored: false, props: { live: 'polite' } }, 'the toast region before the first toast');
  const id = await post(b, 0, 'Described by its text');
  await openPane(a);
  await sees(a, `!!document.querySelector('${ARTICLE(id)}')`, true);
  await axIs(a, ARTICLE(id), { name: 'Thread by Ben, unread', description: 'Described by its text' }, 'the thread');
  // a div without a role, which Chrome reads as generic or leaves out of the tree
  await until(async () => ['generic', 'none'].includes((await ax(a, `${PANE} .list`))?.role), 'the list of threads to be without a role', 5000);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await press(a, COMMENT_KEY);
  await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await typeKeys(a, '@Be');
  await sees(a, `document.querySelectorAll('${PANE} .draft .people li').length`, 1);
  await axIs(a, DRAFT, { role: 'combobox', props: { expanded: true, activedescendant: 1, autocomplete: 'list' } }, 'the field of the draft');
  clean(a);
  clean(b);
});

test('the button of the actions of a comment is drawn as the ellipsis of More in the bar of Version History', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann']);
  const id = await post(a, 0, 'A thread');
  await openPane(a);
  await sees(a, `(() => {
    const b = document.querySelector('${ARTICLE(id)} .head button[aria-haspopup="menu"]');
    return b && { text: b.textContent, icon: !!b.querySelector('svg'), name: b.getAttribute('aria-label') };
  })()`, { text: '⋯', icon: false, name: 'Thread actions' });
  clean(a);
});

for (const scheme of ['dark', 'light']) {
  test(`in ${scheme} mode, a button of a thread that is disabled offline is drawn dimmer than when it is enabled`, { timeout: 300_000 }, async (t) => {
    const browser = await launch({ offline: false });
    t.after(() => browser.close());
    const server = await talk(t);
    const a = await tab(browser, sessionUrl(server.edit), { name: 'Ann' });
    await converge(server, [a]);
    const open = await post(a, 0, 'An open thread');
    const done = await post(a, 1, 'A resolved thread');
    await act(a, done, 'resolve');
    await a.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await openPane(a);
    await sees(a, `!!document.querySelector('${ARTICLE(open)}')`, true);
    // the buttons of the head of each thread, as their names, whether they are disabled, and how
    // they are drawn
    const look = async () => {
      const read = (id) => a.evaluate(`[...document.querySelectorAll('${ARTICLE(id)} .head button')].map((b) => { const s = getComputedStyle(b); return [b.getAttribute('aria-label') || b.textContent, b.disabled, s.color, s.opacity]; })`);
      const out = await read(open);
      await a.evaluate(`document.querySelector('${PANE} .filters [data-filter="resolved"]').click()`);
      await sees(a, `!!document.querySelector('${ARTICLE(done)}')`, true);
      out.push(...(await read(done)));
      await a.evaluate(`document.querySelector('${PANE} .filters [data-filter="open"]').click()`);
      await sees(a, `!!document.querySelector('${ARTICLE(open)}')`, true);
      return out;
    };
    await front(a);
    const on = await look();
    await goOffline(a);
    await a.waitFor(`/^Offline/.test(${STATE})`);
    await sees(a, `document.querySelector('${ARTICLE(open)} .resolve').disabled`, true);
    const off = await look();
    assert.deepEqual(on.map(([name, disabled]) => [name, disabled]), [['Resolve', false], ['Thread actions', false], ['Reopen', false], ['Thread actions', false]]);
    assert.deepEqual(off.map(([name, disabled, color, opacity], k) => [name, disabled, color !== on[k][2] || opacity !== on[k][3]]), on.map(([name]) => [name, true, true]), JSON.stringify({ on, off }));
    clean(a, REFUSED);
  });
}

test('the initials and the tone of a person in the pane are those of the avatar', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t, ['Ann 🇮🇹', 'Ben']);
  await post(a, 0, 'With a flag');
  await openPane(b);
  await sees(b, `!!document.querySelector('${PANE} article .avatar')`, true);
  const look = (selector) => `(() => { const n = ${selector}; return n && [n.textContent, getComputedStyle(n).backgroundColor, getComputedStyle(n).color]; })()`;
  const avatar = await b.evaluate(look(`[...document.querySelectorAll('.beeson-session-avatar')].find((n) => n.getAttribute('aria-label')?.startsWith('Ann'))`));
  assert.equal(avatar[0], 'A🇮🇹');
  assert.deepEqual(await b.evaluate(look(`document.querySelector('${PANE} article .avatar')`)), avatar);
  clean(a);
  clean(b);
});

test('a page that is not mentioned gets no toast for a new comment', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  await recordToasts(b);
  // the toasts are read from their record, since a toast may be gone before a read on a slow runner
  await toastTime(b, 1);
  await openPane(b);
  await post(a, 0, 'Nobody is mentioned');
  await sees(b, THREADS, [{ anchor: 'On Slide 1', texts: ['Nobody is mentioned'] }]);
  await post(a, 1, 'Look, @Ben');
  await sees(b, 'window.__toasts', ['Ann mentioned you on slide 2']);
  clean(a);
  clean(b);
});

test('a thread on another slide stays unread while the pane is open and one thread is read', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  const BADGES = `[...document.querySelectorAll('.beeson-comment-badge')].map((n) => n.textContent + (n.classList.contains('unread') ? '*' : ''))`;
  const first = await post(a, 0, 'On One');
  await post(a, 1, 'On Two');
  await show(b, 'Two');
  await sees(b, BADGES, ['1*']);
  await openPane(b);
  await sees(b, `document.querySelectorAll('${PANE} article').length`, 2);
  await click(b, `${ARTICLE(first)} .text`);
  await sees(b, `[${ACTIVE}, Reveal.getIndices().h]`, [first, 0]);
  await sees(b, BADGES, ['1']);
  await show(b, 'Two');
  await sees(b, BADGES, ['1*']);
  clean(a);
  clean(b);
});

test('j and k typed in a reply are text, and the focus stays in its thread', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann']);
  const first = await post(a, 0, 'First');
  await post(a, 1, 'Second');
  await openPane(a);
  await sees(a, `document.querySelectorAll('${PANE} article').length`, 2);
  await click(a, `${ARTICLE(first)} .reply textarea`);
  await typeKeys(a, 'jk');
  await sees(a, `[document.activeElement.value, ${ACTIVE}]`, ['jk', first]);
  clean(a);
});

test('on a phone of 390 px, a toast and its buttons take a tap, with 32 px or more', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  const c = await open(browser, sessionUrl(server.edit), { name: 'Cy', width: 390, height: 844, mobile: true });
  await converge(server, [b, c]);
  await toastTime(c, 60_000);
  await post(b, 0, 'Look, @Cy');
  await sees(c, TOASTS, ['Ben mentioned you on slide 1']);
  await sees(c, `document.querySelectorAll('.beeson-session-toast button').length`, 2);
  await sees(c, HITS('.beeson-session-toast button'), []);
  await touch(c, '.beeson-session-toast button[aria-label="Close"]');
  await sees(c, TOASTS, []);
  await post(b, 0, 'Again, @Cy');
  await sees(c, TOASTS, ['Ben mentioned you on slide 1']);
  await touch(c, '.beeson-session-toast button:not([aria-label="Close"])');
  await sees(c, `document.documentElement.classList.contains('beeson-comments')`, true);
  await sees(c, HITS(`${PANE} :is(button, textarea)`), []);
  clean(b);
  clean(c);
});

test('Mod+Enter in the field of a comment or of a reply sends it, and in another field starts the slide show', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann']);
  const SHOW = `!!document.querySelector('.beeson-edit-show')`;
  // the field sends with the other modifier too, i.e. Control on a Mac and Meta elsewhere
  const OTHER = process.platform === 'darwin' ? 'Ctrl+Enter' : 'Meta+Enter';
  await show(a, 'One');
  const sent = [];
  for (const key of ['Mod+Enter', OTHER]) {
    await caretAtEnd(a, el(0, 'h2'));
    await press(a, COMMENT_KEY);
    await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
    await type(a, `Sent by ${key}`);
    await press(a, key);
    await sees(a, `[!!document.querySelector('${PANE} .draft'), ${SHOW}]`, [false, false], `the draft and the slide show after ${key}`);
    sent.push({ text: `Sent by ${key}`, mentions: [], replies: [] });
    assert.deepEqual(await stored(a), sent);
  }

  const id = await a.evaluate(`document.querySelector('${PANE} article').dataset.id`);
  for (const [k, key] of ['Mod+Enter', OTHER].entries()) {
    // a reply is drawn a frame after its field is emptied, and moves the field down
    await a.waitFor(`document.querySelectorAll('${ARTICLE(id)} .item').length === ${k + 1}`);
    await click(a, `${ARTICLE(id)} .reply textarea`);
    await type(a, `A reply by ${key}`);
    await press(a, key);
    await sees(a, `[document.querySelector('${ARTICLE(id)} .reply textarea').value, ${SHOW}]`, ['', false], `the reply and the slide show after ${key}`);
  }
  assert.deepEqual((await stored(a)).map((c) => c.replies).flat(), ['A reply by Mod+Enter', `A reply by ${OTHER}`]);

  // the field of Go to Slide
  for (const key of ['Mod+Enter', OTHER]) {
    await click(a, '.reveal .slides > section:nth-child(1)');
    await press(a, 'Escape');
    await press(a, 'G');
    await a.waitFor(`document.activeElement?.matches('.beeson-edit-goto input')`);
    await press(a, key);
    // Esc ends the show once the deck in its frame has its key bindings, which it adds when reveal.js
    // announces that it is ready and marks its wrapper. reveal.js answers isReady() a timer earlier,
    // and an Esc in between opens its overview. the frame is of the origin of the page
    await a.waitFor(`!!document.querySelector('.beeson-edit-show iframe')?.contentDocument?.querySelector('.reveal.ready')`, 30_000);
    await press(a, 'Escape');
    await a.waitFor(`!${SHOW}`);
  }
  clean(a);
});

test('Esc in a draft or a reply with text keeps the text and leaves the field, Cancel discards it also through a reload, and Esc closes an empty draft', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann']);
  const state = `(() => { const d = document.querySelector('${DRAFT}'); return d && { value: d.value, focused: document.activeElement === d }; })()`;
  await show(a, 'One');
  await caretAtEnd(a, el(0, 'h2'));
  await press(a, COMMENT_KEY);
  await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await type(a, 'Kept by Esc');
  await press(a, 'Escape');
  await sees(a, state, { value: 'Kept by Esc', focused: false });
  await click(a, `${PANE} .draft .actions button:not(.primary)`);
  await sees(a, state, null);
  await caretAtEnd(a, el(0, 'h2'));
  await press(a, COMMENT_KEY);
  await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await press(a, 'Escape');
  await sees(a, state, null);
  assert.deepEqual(await stored(a), []);

  const id = await post(a, 0, 'A thread');
  await openPane(a);
  await sees(a, `!!document.querySelector('${ARTICLE(id)}')`, true, 'the thread in the pane');
  const reply = `(() => { const r = document.querySelector('${ARTICLE(id)} .reply textarea'); return r && { value: r.value, focused: document.activeElement === r }; })()`;
  await click(a, `${ARTICLE(id)} .reply textarea`);
  await type(a, 'Kept by Esc');
  await press(a, 'Escape');
  await sees(a, reply, { value: 'Kept by Esc', focused: false });
  await click(a, `${ARTICLE(id)} .reply textarea`);
  await click(a, `${ARTICLE(id)} .reply .actions button:not(.primary)`);
  await sees(a, reply, { value: '', focused: false });
  const count = await loads(a);
  await a.evaluate('location.reload()').catch(() => {});
  await until(async () => (await loads(a).catch(() => 0)) > count, 'the page to load again');
  await a.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  await a.waitFor(ONLINE);
  await openPane(a);
  await sees(a, reply, { value: '', focused: false }, 'the reply after a reload');
  assert.deepEqual(await stored(a), [{ text: 'A thread', mentions: [], replies: [] }]);
  clean(a);
});

test('a draft whose element another person deletes moves to its slide and is sent as a thread on the slide', { timeout: 300_000 }, async (t) => {
  const { server, pages: [a, b] } = await pair(t);
  const state = `(() => { const d = document.querySelector('${PANE} .draft'); return d && { label: d.querySelector('.anchor').textContent, text: d.querySelector('textarea').value }; })()`;
  await show(a, 'Two');
  await click(a, '.reveal .slides > section:nth-child(2) > p');
  await press(a, COMMENT_KEY);
  await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await type(a, 'Draft on the paragraph');
  assert.deepEqual(await a.evaluate(state), { label: 'On Paragraph: Second slide', text: 'Draft on the paragraph' });
  // Ann leaves the paragraph, which ends her hold on it
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) > p');
  await press(a, 'Escape');
  await until(async () => (await b.evaluate(HOLDER(`document.querySelector('.reveal .slides > section:nth-child(2) > p')`))) === null, 'the paragraph that Ann left to be free on the page of Ben');
  await show(b, 'Two');
  await clickText(b, '.reveal section.present > p');
  await press(b, 'Escape');
  await b.evaluate(`window.BeesonEditor.exec('element.delete')`);
  await until(() => !server.read().includes('Second slide'), 'the removal to reach index.html');
  await converge(server, [a, b]);
  await sees(a, state, { label: 'On Slide 2', text: 'Draft on the paragraph' });
  await click(a, `${PANE} .draft .actions .primary`);
  await sees(a, `[${state}, ${THREADS}]`, [null, [{ anchor: 'On Slide 2', texts: ['Draft on the paragraph'] }]]);
  clean(a);
  clean(b);
});

test('the badge of the text element of the caret is clear of its grips, and its upper right grip takes the press', { timeout: 300_000 }, async (t) => {
  const { pages: [a] } = await pair(t, ['Ann']);
  const p = el(0, 'p');
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'On the paragraph');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await sees(a, `${C}.app.selection.kind === 'text' && ${C}.app.selection.has(${p})`, true);
  await sees(a, `document.querySelectorAll('.beeson-comment-badge').length`, 1);
  const grip = `[...document.querySelectorAll('.beeson-grip[data-handle="ne"]')].find((g) => g.getClientRects().length)`;
  await sees(a, `(() => {
    const g = ${grip};
    if (!g) return 'no grip';
    const r = g.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return at === g ? null : at?.className ?? null;
  })()`, null, 'the element at the center of the upper right grip');
  const width = await a.evaluate(`${p}.getBoundingClientRect().width`);
  const at = await a.evaluate(`(() => { const r = ${grip}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await drag(a, at, { dx: 60, steps: 8 });
  await sees(a, `${p}.getBoundingClientRect().width > ${width + 20}`, true, 'the paragraph made wider by its grip');
  clean(a);
});

test('a draft on a theorem is labeled by its kind, on a cell as a table cell, and on a citation by its number or else its key', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  // tex.js has the paper of the first citation, which is thus numbered, and not the one of the second
  const server = await talkWith(t, `<section>
  <h2>One</h2>
  <p class="theorem" data-kind="lemma">Every orbit is closed.</p>
  <table><tr><td>A1</td><td>B1</td></tr></table>
  <p>Cited words<cite data-key="koon2000"></cite></p>
  <p>Other words<cite data-key="nobody1999"></cite></p>
</section>
`, 'window.beesonTex = { "macros": {}, "environments": {}, "packages": [], "theorems": {}, "references": { "koon2000": { "authors": "Koon et al.", "title": "Heteroclinic connections", "venue": "Chaos", "volume": "10", "year": "2000" } } };\n');
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await show(a, 'One');
  const label = async (selector) => {
    await a.evaluate(`window.BeesonEditor.exec('insert.comment', { kind: 'element', target: ${el(0, selector)} })`);
    await a.waitFor(`!!document.querySelector('${PANE} .draft')`);
    const got = await a.evaluate(`document.querySelector('${PANE} .draft .anchor').textContent`);
    await click(a, `${PANE} .draft .actions button:not(.primary)`);
    await a.waitFor(`!document.querySelector('${PANE} .draft')`);
    return got;
  };
  await sees(a, `[...document.querySelectorAll('.reveal .slides cite')].map((c) => c.dataset.n ?? null)`, ['1', 'nobody1999'], 'the labels of the citations on the slide');
  assert.deepEqual([await label('p.theorem'), await label('td'), await label('cite'), await label('p:last-of-type cite')], ['On Lemma: Every orbit is closed.', 'On Table cell: A1', 'On Citation: 1', 'On Citation: nobody1999']);
  clean(a);
});

test('one Backspace behind a picked mention takes out the whole mention, also from a keyboard that does not name its keys', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  const field = `(() => { const d = document.querySelector('${DRAFT}'); return [d.value, d.selectionStart]; })()`;
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await press(a, COMMENT_KEY);
  await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await typeKeys(a, 'Hi @Be');
  await sees(a, `document.querySelectorAll('${PANE} .draft .people li').length`, 1);
  await press(a, 'Enter');
  await press(a, 'Backspace');
  await sees(a, field, ['Hi @Ben', 7]);
  await press(a, 'Backspace');
  await sees(a, field, ['Hi ', 3]);
  // a phone keyboard sends only the input events of a delete, as execCommand does
  await typeKeys(a, '@Be');
  await sees(a, `document.querySelectorAll('${PANE} .draft .people li').length`, 1);
  await press(a, 'Enter');
  await a.evaluate(`document.execCommand('delete')`);
  await a.evaluate(`document.execCommand('delete')`);
  await sees(a, field, ['Hi ', 3]);
  await typeKeys(a, 'there');
  await click(a, `${PANE} .draft .actions .primary`);
  await a.waitFor(`!document.querySelector('${PANE} .draft')`);
  assert.deepEqual((await stored(a)).map((c) => [c.text, c.mentions]), [['Hi there', []]]);
  clean(a);
  clean(b);
});

test('a thread read offline is read on another page of the person once the page is back online', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann', script: NET });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  const person = await a.evaluate(`localStorage.getItem('beeson-session-person')`);
  const a2 = await open(browser, sessionUrl(server.edit), { name: 'Ann', script: `localStorage.setItem('beeson-session-person', ${JSON.stringify(person)});` });
  assert.equal(await a2.evaluate(`${C}.person`), await a.evaluate(`${C}.person`), 'the two pages are of one person');
  const id = await post(b, 0, 'Look, @Ann');
  await sees(a, COUNT, 'Comments, 1 unread');
  await sees(a2, COUNT, 'Comments, 1 unread');
  await a.evaluate(`__net.clear() && __net.rule('/.session/', 'cut') && __net.cut('/.session/') && __net.drop('/.session/')`);
  await a.waitFor(`/^Offline/.test(${STATE})`);
  await openPane(a);
  await click(a, `${ARTICLE(id)} .text`);
  await sees(a, COUNT, 'Comments');
  await a.evaluate(`__net.clear() && (${C}.tryNow(), true)`);
  await a.waitFor(ONLINE);
  await sees(a2, COUNT, 'Comments');
  clean(a, REFUSED);
  clean(a2);
  clean(b);
});

test('Show on the toast of a mention on the slide that following shows stops following', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  // the toast stays until its button is pressed, since a slow runner may take more than its 6 s
  await toastTime(a, 3_600_000);
  const ben = await b.evaluate(`${C}.person`);
  await show(b, 'Two');
  await a.evaluate(`window.BeesonSession.follow().start(${JSON.stringify(ben)})`);
  await sees(a, `[...document.querySelectorAll('.reveal .slides > section')].indexOf(Reveal.getCurrentSlide())`, 1, 'Ann to follow Ben to slide 2');
  await post(b, 1, 'Look, @Ann');
  await front(a);
  await a.waitFor(`!!document.querySelector('.beeson-session-toast button')`);
  await click(a, '.beeson-session-toast button');
  await sees(a, `window.BeesonSession.follow().target`, null, 'Ann to stop following');
  clean(a);
  clean(b);
});

test('Show on the toast of a mention closes the Slide Sorter', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  // the toast stays until its button is pressed, since a slow runner may take more than its 6 s
  await toastTime(a, 3_600_000);
  await a.evaluate(`window.BeesonEditor.exec('view.lightTable')`);
  await sees(a, `window.BeesonEditor.state('view.lightTable').checked`, true);
  const id = await post(b, 1, 'Look, @Ann');
  await front(a);
  await a.waitFor(`!!document.querySelector('.beeson-session-toast button')`);
  await click(a, '.beeson-session-toast button');
  await sees(a, `[window.BeesonEditor.state('view.lightTable').checked, ${ACTIVE}, [...document.querySelectorAll('.reveal .slides > section')].indexOf(Reveal.getCurrentSlide())]`, [false, id, 1]);
  clean(a);
  clean(b);
});

// a comment on the nth start tag of tag on the slide at index, sent by page, and the id of its thread
const postOn = (page, slide, tag, n, text) => page.evaluate(`(async () => {
  const c = ${C};
  const t = c.base.text;
  let at = -1;
  for (let k = 0; k <= ${slide}; k++) at = t.indexOf('<section', at + 1);
  let p = at;
  for (let k = 0; k <= ${n}; k++) p = t.indexOf('<${tag}', p + 1);
  return (await c.transport.post('comments', { token: c.token, anchor: { start: p, end: t.indexOf('>', p) + 1 }, slide: { start: at, end: t.indexOf('>', at) + 1 }, base: c.base.v, text: ${JSON.stringify(text)}, mentions: [] })).id;
})()`);

for (const [width, height] of [[1440, 900], [390, 844]]) {
  test(`at ${width} px, the badges of two near elements do not overlap`, { timeout: 300_000 }, async (t) => {
    const browser = await launch({ offline: false });
    t.after(() => browser.close());
    const server = await talkWith(t, `<section>
  <h2>One</h2>
  <p style="position: absolute; left: 300px; top: 250px; width: 300px; margin: 0">Upper paragraph</p>
  <p style="position: absolute; left: 300px; top: 260px; width: 300px; margin: 0">Lower paragraph</p>
</section>
`);
    const a = await open(browser, sessionUrl(server.edit), { name: 'Ann', width, height, mobile: width < 600 });
    // a phone shows the slide without the Format inspector, which takes most of its width
    if (width < 600) await a.evaluate(`window.BeesonEditor.exec('view.slideOnly')`);
    await show(a, 'One');
    for (const n of [0, 1]) await postOn(a, 0, 'p', n, `On paragraph ${n + 1}`);
    await sees(a, `document.querySelectorAll('.beeson-comment-badge').length`, 2);
    const [upper, lower] = await a.evaluate(BADGE_RECTS);
    assert.equal(meets(upper, lower), false, JSON.stringify([upper, lower]));
    clean(a);
  });
}

// the badges as rectangles of the window
const BADGE_RECTS = `[...document.querySelectorAll('.beeson-comment-badge')].map((b) => b.getBoundingClientRect().toJSON())`;
const meets = (x, y) => x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom;

for (const [width, height] of [[1440, 900], [390, 844]]) {
  test(`at ${width} px, the badge of an element turned by any angle is beside its own upper right corner and clear of its text`, { timeout: 300_000 }, async (t) => {
    const browser = await launch({ offline: false });
    t.after(() => browser.close());
    const angles = [0, 90, 180, 270, 135];
    const server = await talkWith(t, `<section>
  <h2>One</h2>
${angles.map((deg, k) => `  <p style="position: absolute; left: ${60 + 370 * k}px; top: 500px; margin: 0; rotate: ${deg}deg">Turned ${deg}</p>`).join('\n')}
</section>
`);
    const a = await open(browser, sessionUrl(server.edit), { name: 'Ann', width, height, mobile: width < 600 });
    if (width < 600) await a.evaluate(`window.BeesonEditor.exec('view.slideOnly')`);
    await show(a, 'One');
    for (const k of angles.keys()) await postOn(a, 0, 'p', k, `On paragraph ${k + 1}`);
    await sees(a, `document.querySelectorAll('.beeson-comment-badge').length`, angles.length);
    // for each paragraph, the badge nearest to its own upper right corner, the distance of this
    // corner to the badge, and whether the badge meets the text of the paragraph
    const got = await a.evaluate(`(() => {
      const s = ${C}.app.stage.scale;
      const badges = ${BADGE_RECTS};
      const meets = ${meets.toString()};
      return [...Reveal.getCurrentSlide().querySelectorAll('p')].map((p) => {
        const r = p.getBoundingClientRect();
        const deg = parseFloat(p.style.rotate) || 0;
        const a = (deg * Math.PI) / 180;
        const w = (p.offsetWidth * s) / 2;
        const h = (p.offsetHeight * s) / 2;
        const x = (r.left + r.right) / 2 + w * Math.cos(a) + h * Math.sin(a);
        const y = (r.top + r.bottom) / 2 + w * Math.sin(a) - h * Math.cos(a);
        const away = (b) => Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom));
        const badge = badges.reduce((m, b) => (away(b) < away(m) ? b : m));
        const range = document.createRange();
        range.selectNodeContents(p);
        return { deg, near: away(badge) < 12, clear: ![...range.getClientRects()].some((q) => meets(badge, q)) };
      });
    })()`);
    assert.deepEqual(got, angles.map((deg) => ({ deg, near: true, clear: true })), JSON.stringify(await a.evaluate(BADGE_RECTS)));
    clean(a);
  });
}

test('at 390 px, the badges of a slide and of elements at its edges stay inside the window, and neither they nor the areas that take their taps overlap', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const places = [[0, 0], [1760, 30], [0, 1040], [1620, 1040], [700, 500], [700, 504], [700, 508]];
  const server = await talkWith(t, `<section>
  <h2>One</h2>
${places.map(([x, y], k) => `  <p style="position: absolute; left: ${x}px; top: ${y}px; width: 300px; margin: 0">Place ${k + 1}</p>`).join('\n')}
</section>
`);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann', width: 390, height: 844, mobile: true });
  await a.evaluate(`window.BeesonEditor.exec('view.slideOnly')`);
  await show(a, 'One');
  for (const k of places.keys()) await postOn(a, 0, 'p', k, `On paragraph ${k + 1}`);
  await post(a, 0, 'On the slide');
  await sees(a, `document.querySelectorAll('.beeson-comment-badge').length`, places.length + 1);
  const boxes = await a.evaluate(BADGE_RECTS);
  // the area of each badge that takes a tap, i.e. its pseudo-element ::after placed around it
  const taps = await a.evaluate(`[...document.querySelectorAll('.beeson-comment-badge')].map((b) => {
    const r = b.getBoundingClientRect();
    const s = getComputedStyle(b, '::after');
    return { left: r.left + parseFloat(s.left), top: r.top + parseFloat(s.top), right: r.right - parseFloat(s.right), bottom: r.bottom - parseFloat(s.bottom) };
  })`);
  const size = await a.evaluate(`[innerWidth, innerHeight]`);
  const pairs = (list) => list.flatMap((b, i) => list.slice(i + 1).filter((o) => meets(b, o))).length;
  const got = {
    overlaps: pairs(boxes),
    taps: pairs(taps),
    outside: boxes.filter((b) => b.left < 0 || b.top < 0 || b.right > size[0] || b.bottom > size[1]).length,
  };
  assert.deepEqual(got, { overlaps: 0, taps: 0, outside: 0 }, JSON.stringify(boxes));
  clean(a);
});

test('a letter typed by another person before the anchors of many threads does not draw the open pane again', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talkWith(t, Array.from({ length: 20 }, (_, k) => `<section>
  <h2>Slide ${k + 1}</h2>
  <p>First point of slide ${k + 1}</p>
  <p>Second point of slide ${k + 1}</p>
</section>
`).join('\n'));
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [a, b]);
  await openPane(a);
  await a.evaluate(`(() => {
    window.__changes = 0;
    new MutationObserver((list) => (window.__changes += list.length)).observe(document.querySelector('${PANE}'), { subtree: true, childList: true, attributes: true, characterData: true });
    return true;
  })()`);
  await show(b, 'Slide 1');
  // the changes of the pane over ten operations of one letter each, typed by Ben on the first slide,
  // each drawn by the page of Ann in front. a page brought behind loses its caret
  const changes = async () => {
    const was = await a.evaluate('window.__changes');
    for (let k = 0; k < 10; k++) {
      await front(b);
      await caretAtEnd(b, el(0, 'p'));
      await typeKeys(b, 'x');
      await front(a);
      await until(async () => (await b.evaluate(`${C}.acked()`)) && (await a.evaluate(TEXT)) === (await b.evaluate(TEXT)), 'the letter of Ben on the page of Ann');
      await frame(a);
      await frame(a);
    }
    return (await a.evaluate('window.__changes')) - was;
  };
  const none = await changes();
  for (let k = 0; k < 60; k++) await postOn(a, 1 + (k % 19), 'p', k % 2, `Thread ${k}`);
  await sees(a, `document.querySelectorAll('${PANE} article').length`, 60);
  await frame(a);
  assert.ok((await changes()) <= none, 'the changes of the pane with 60 threads are not more than with none');
  clean(a);
  clean(b);
});

test('the label of a thread on a citation shows its new number as soon as the citation on the slide does', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const dir = 'test/pages/tex-sheets';
  const folder = talkFolder(t, readFileSync(`${dir}/index.html`, 'utf8').replaceAll('../../../theme/', 'theme/'));
  for (const name of ['preamble.tex', 'references.bib', 'tex.js', 'defs.tex', 'mymath.sty']) cpSync(join(dir, name), join(folder.talk, name));
  for (const name of ['theme', 'brand']) cpSync(resolve(name), join(folder.talk, name), { recursive: true });
  const edit = await startEdit(folder.talk, { env: { XDG_CONFIG_HOME: folder.config, APPDATA: folder.config } });
  t.after(async () => {
    await stopEdit(edit);
    rmSync(folder.root, { recursive: true, force: true });
  });
  const a = await open(browser, sessionUrl(edit), { name: 'Ann' });
  await openPane(a);
  await show(a, 'Citations');
  const cite = `document.querySelector('.reveal .slides cite[data-key="gomez2004"]')`;
  await a.evaluate(`window.BeesonEditor.exec('insert.comment', { kind: 'element', target: ${cite} })`);
  await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
  await type(a, 'On the paper of Gomez');
  await click(a, `${PANE} .draft .actions .primary`);
  await sees(a, THREADS, [{ anchor: 'On Citation: 2', texts: ['On the paper of Gomez'] }]);
  // another person cites a paper before it, after which the edit command writes tex.js again
  const bo = (await request(edit.port, `${edit.base}.session/hello`, { name: 'Bo' })).json();
  const at = bo.text.indexOf('<p>A heteroclinic') + 3;
  assert.equal((await request(edit.port, `${edit.base}.session/op`, { token: bo.token, seq: 1, base: bo.v, patches: [{ start: at, end: at, text: 'First<cite data-key="szebehely1967"></cite> ' }] })).status, 200);
  await sees(a, `${cite}.dataset.n`, '3', 'the number of the citation on the slide', 30_000);
  await sees(a, THREADS, [{ anchor: 'On Citation: 3', texts: ['On the paper of Gomez'] }], 'the thread in the pane', 1500);
  clean(a, [/404/]);
});

for (const [width, height] of [[1440, 900], [390, 844]]) {
  test(`at ${width} px, the count of comments on a thumbnail of the navigator is clear of the dots of the people and of the steps, of the mark of a transition, and of the number of the slide`, { timeout: 300_000 }, async (t) => {
    const browser = await launch({ offline: false });
    t.after(() => browser.close());
    const server = await talkWith(t, `<section>
  <h2>One</h2>
  <p>First slide</p>
  <p class="fragment" data-fragment-index="1">A step</p>
</section>
<section data-transition="zoom">
  <h2>Two</h2>
</section>
`);
    const a = await open(browser, sessionUrl(server.edit), { name: 'Ann', width, height, mobile: width < 600 });
    const others = [await open(browser, sessionUrl(server.edit), { name: 'Ben' }), await open(browser, sessionUrl(server.edit), { name: 'Cy' })];
    await converge(server, [a, ...others]);
    for (const p of others) await show(p, 'One');
    if (!(await a.evaluate(`window.BeesonEditor.state('view.navigator').checked`))) await a.evaluate(`window.BeesonEditor.exec('view.navigator')`);
    await post(a, 0, 'A thread');
    const frame = `document.querySelector('.beeson-edit-nav .row .frame')`;
    // the rectangles of the count, of each dot of a person, of each dot of the steps, of the mark of
    // the transition to the next slide, and of the number of the slide
    const rects = `(() => {
      const f = ${frame};
      const r = (e) => e.getBoundingClientRect().toJSON();
      const shown = (e) => e.getClientRects().length > 0;
      return {
        count: [...f.querySelectorAll('.beeson-comment-count')].filter(shown).map(r),
        people: [...f.querySelectorAll('.beeson-session-dots i')].filter(shown).map(r),
        steps: [...f.querySelectorAll('.dots i')].filter(shown).map(r),
        mark: [...f.querySelectorAll('.trans')].filter(shown).map(r),
        number: [...f.parentElement.querySelectorAll('.no')].filter(shown).map(r),
      };
    })()`;
    await sees(a, `(() => { const g = ${rects}; return [g.count.length, g.people.length, g.steps.length, g.mark.length, g.number.length]; })()`, [1, 2, 3, 1, 1], 'the count, the dots of Ben and Cy, the dots of the steps, the mark, and the number');
    const got = await a.evaluate(rects);
    const hits = [];
    for (const [x, y] of [['count', 'people'], ['count', 'steps'], ['count', 'mark'], ['count', 'number'], ['people', 'steps']]) for (const p of got[x]) for (const q of got[y]) if (meets(p, q)) hits.push(`${x} meets ${y}`);
    assert.deepEqual(hits, [], JSON.stringify(got));
    clean(a);
  });
}

test('a thread that a person only replied to is listed under For You, and a later reply of another person is unread for them', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  const id = await post(a, 0, 'A thread of Ann');
  await act(b, id, 'reply', { text: 'A reply of Ben', mentions: [] });
  await openPane(b);
  await b.evaluate(`document.querySelector('${PANE} .filters [data-filter="mine"]').click()`);
  await sees(b, `[...document.querySelectorAll('${PANE} article')].map((a) => a.dataset.id)`, [id]);
  await click(b, `${ARTICLE(id)} .text`);
  await sees(b, COUNT, 'Comments');
  await b.evaluate(`window.BeesonEditor.exec('view.comments')`);
  await act(a, id, 'reply', { text: 'A second reply of Ann', mentions: [] });
  await sees(b, COUNT, 'Comments, 1 unread');
  clean(a);
  clean(b);
});
