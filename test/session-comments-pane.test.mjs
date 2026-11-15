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
