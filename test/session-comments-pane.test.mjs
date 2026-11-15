// the pane Comments, its badges, and its toasts in Chrome, on pages of one edit command: a comment
// on a held element and on the target of a context menu, the headings of the slides, the text of a
// reply kept through a delete, a resolve, a move, and a reload, the offline state, the mentions, the
// count of the text, the mode of Version History, the keys, the times, the toasts, the direction of
// a text, the badge of a selected element, the contrast, the accessibility tree, the initials, and
// a phone of 390 px

import assert from 'node:assert/strict';
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, loads, ONLINE, open, sessionUrl, show, STATE, talk, TALK } from './helpers/client.mjs';
import { center, click, contrast, GROUND, INK, press, type, typeKeys } from './helpers/editor.mjs';
import { startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

// the element of selector on the slide at index
const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;
const COMMENT_KEY = process.platform === 'darwin' ? 'Mod+Alt+M' : 'Alt+Shift+C';
const PANE = '.beeson-edit-inspector .panel.comments';
const OFFLINE = 'Comments are sent once you are back online';
const REFUSED = [/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/, /status of 502/, /status of 404 .*\/\.session\/events\?/];
const THREADS = `[...document.querySelectorAll('${PANE} article')].map((a) => ({
  anchor: a.querySelector('.anchor')?.textContent ?? null,
  texts: [...a.querySelectorAll('.item .text')].map((p) => p.textContent),
}))`;
const TOASTS = `[...document.querySelectorAll('.beeson-session-toast > span')].map((s) => s.textContent)`;
const COUNT = `document.querySelector('.beeson-session-comments').getAttribute('aria-label')`;
const BUBBLE = `document.querySelector('.beeson-bubble')?.textContent ?? null`;
const LOCKED = (expression) => `${expression}.classList.contains('beeson-locked')`;
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

// a click on the item labeled label of the open menu, of the editor (a context menu) or of the client
// (the menu of a thread)
async function menu(page, label) {
  const item = `[...document.querySelectorAll('.beeson-edit-menu [role^="menuitem"], .beeson-session-menu button')].find((i) => (i.querySelector('.label') ?? i).textContent === ${JSON.stringify(label)})`;
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

// a talk folder with the slides of slides in place of those of TALK, and the edit command on it
async function talkWith(t, slides) {
  const folder = talkFolder(t, TALK.replace(/<section>[\s\S]*<\/section>\n/, slides));
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

test('a held text element takes a comment from the context menu, and its thread opens without the refusal of the floor rule', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  const p = el(0, 'p');
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'Before the hold');
  const id = await a.evaluate(`document.querySelector('${PANE} article').dataset.id`);
  await a.evaluate(`${C}.app.selection.clear()`);

  await show(b, 'One');
  // the caret of Ann left the paragraph for the draft, and the end of her hold reaches Ben later
  await until(async () => !(await b.evaluate(LOCKED(p))), 'the paragraph that Ann left to be free on the page of Ben');
  await caretAtEnd(b, p);
  await until(() => a.evaluate(LOCKED(p)), 'the paragraph that Ben holds to be locked on the page of Ann');

  await t.test('the item Comment of the context menu of a held element anchors the draft on it', async () => {
    await front(a);
    await click(a, '.reveal .slides > section:nth-child(1) p', { button: 'right' });
    await menu(a, 'Comment');
    await a.waitFor(`document.activeElement?.matches('${DRAFT}')`);
    assert.equal(await a.evaluate(`document.querySelector('${PANE} .draft .anchor').textContent`), 'On Paragraph: First slide');
    await press(a, 'Escape');
    await a.waitFor(`!document.querySelector('${PANE} .draft')`);
  });

  await t.test('a thread of a held element opens with its slide shown and the thread focused, without a selection or a bubble', async () => {
    await show(a, 'Two');
    await a.evaluate(`document.querySelector('.beeson-bubble')?.remove()`);
    await click(a, `${ARTICLE(id)} .text`);
    await sees(a, ACTIVE, id);
    assert.deepEqual(await a.evaluate(`({ slide: Reveal.getIndices().h, selected: ${C}.app.selection.has(${p}), bubble: ${BUBBLE} })`), { slide: 0, selected: false, bubble: null });
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
  await act(a, one, 'resolve');
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
  await press(a, 'E');
  assert.deepEqual(await a.evaluate(TOASTS), []);
  assert.equal(await a.evaluate(`document.querySelector('${ARTICLE(id)} .reply textarea').value`), 'Typed before the stop');

  await server.start(['--port', String(port)]);
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
  await a.evaluate(`document.querySelector('${DRAFT}').focus()`);
  await press(a, 'Escape');
  await a.waitFor(`!document.querySelector('${PANE} .draft')`);
  await sees(a, `Object.keys(sessionStorage).filter((k) => /comment/.test(k) && /Half/.test(sessionStorage.getItem(k)))`, []);
  assert.equal(await converge(server, [a]), TALK);
  clean(a);
});

test('a mention is toasted once, also after a reload of the page and a later change of its thread', { timeout: 300_000 }, async (t) => {
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
  assert.ok(Math.abs(Number(shown.replace(':', '')) - Number(want.replace(':', ''))) <= 1, `${shown} is the time in de-DE, ${want}`);
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

test('the accessibility tree of Chrome holds the field of a mention as a combobox, the list without a role, a thread described by its text, and the toast region before its first toast', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  await front(a);
  await axIs(a, '.beeson-session-toast', { role: 'status', ignored: false, props: { live: 'polite' } }, 'the toast region before the first toast');
  const id = await post(b, 0, 'Described by its text');
  await openPane(a);
  await sees(a, `!!document.querySelector('${ARTICLE(id)}')`, true);
  await axIs(a, ARTICLE(id), { name: 'Comment by Ben, unread', description: 'Described by its text' }, 'the thread');
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
