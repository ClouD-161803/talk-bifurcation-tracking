// the comments of a session in Chrome, on two or three pages of one edit command: a comment on an
// element, on the text element of the caret, and on a slide, seen on the other page with its badge,
// the anchors kept on their element through the edits of another person and the unsent edits of
// the page itself, a removed element, the actions on a thread and the rights of its author, the
// filters, a mention, a changed name, a page that joins later or loads again, the offline state,
// the three tabs of the inspector, text that looks like HTML, and a phone

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, loads, ONLINE, open, sessionUrl, show, STATE, talk, TALK } from './helpers/client.mjs';
import { center, click, press, type, typeKeys } from './helpers/editor.mjs';
import { until } from './helpers/session.mjs';

// the element of selector on the slide at index
const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;
const slideEl = (slide) => `document.querySelectorAll('.reveal .slides > section')[${slide}]`;
const COMMENT_KEY = process.platform === 'darwin' ? 'Mod+Alt+M' : 'Alt+Shift+C';
const PANE = '.beeson-edit-inspector .panel.comments';
const OFFLINE = 'Comments are sent once you are back online';

// the text of the badge of the element of expression, found at its place 4 px outside the upper
// right corner of the element, or inside the upper right corner of a slide, with * when it is
// filled for an unread thread, or null
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

// the element of selector on the slide whose heading starts with heading, or this slide
const on = (heading, selector = null) => `[...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector('h2')?.textContent.startsWith(${JSON.stringify(heading)}))${selector ? `?.querySelector(${JSON.stringify(selector)})` : ''}`;

// the threads in the pane, each as the label of its place and the texts of its comment and replies
const THREADS = `[...document.querySelectorAll('${PANE} article')].map((a) => ({
  anchor: a.querySelector('.anchor')?.textContent ?? null,
  texts: [...a.querySelectorAll('.item .text')].map((p) => p.textContent),
}))`;
const GROUPS = `[...document.querySelectorAll('${PANE} h3')].map((h) => h.textContent)`;
const EMPTY = `document.querySelector('${PANE} .empty')?.textContent ?? null`;
const COUNT = `document.querySelector('.beeson-session-comments').getAttribute('aria-label')`;
const TOASTS = `[...document.querySelectorAll('.beeson-session-toast > span')].map((s) => s.textContent)`;
const TABS = `[...document.querySelectorAll('.beeson-edit-inspector .tabs button')].filter((b) => !b.hidden).map((b) => b.textContent)`;
const TAB = `document.querySelector('.beeson-edit-inspector .tabs button[aria-selected="true"]')?.textContent ?? null`;
const REFUSED = [/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/, /status of 502/, /status of 404 .*\/\.session\/events\?/];

// the controls of selector that are shown and take a tap on less than 32 by 32 px, counting a
// pseudo-element ::after placed around a control
const HITS = (selector) => `[...document.querySelectorAll(${JSON.stringify(selector)})].filter((b) => b.getClientRects().length).map((b) => {
  const r = b.getBoundingClientRect();
  const a = getComputedStyle(b, '::after');
  const out = (v) => (a.content !== 'none' && a.position === 'absolute' ? Math.max(0, -parseFloat(v) || 0) : 0);
  return { name: b.getAttribute('aria-label') || b.textContent.trim() || b.localName, w: Math.round(r.width + out(a.left) + out(a.right)), h: Math.round(r.height + out(a.top) + out(a.bottom)) };
}).filter((b) => b.w < 32 || b.h < 32)`;

// the operations of the page held until window.__go()
const HOLD = `(() => {
  const fetched = window.fetch;
  window.__held = [];
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('/.session/op') && !window.__going) return new Promise((done) => window.__held.push(() => done(fetched.call(this, input, init))));
    return fetched.call(this, input, init);
  };
  window.__go = () => {
    window.__going = true;
    for (const go of window.__held.splice(0)) go();
  };
})()`;

// waits until expression reads as want on page, in front so that it draws frames, and fails with
// the last value read
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

// the badge of the element of selector on the slide of heading, or of this slide when selector is null
async function badge(page, heading, selector, want) {
  await show(page, heading);
  await sees(page, badgeOf(on(heading, selector), !selector), want, `the badge on ${selector ?? 'the slide'} of ${heading}`);
}

async function openPane(page) {
  await front(page);
  if (!(await page.evaluate(`window.BeesonEditor.state('view.comments').checked`))) await page.evaluate(`window.BeesonEditor.exec('view.comments')`);
  await page.waitFor(`!!document.querySelector('${PANE}:not([hidden])')`);
}

// a click on the item labeled label of the open menu of the client
async function menu(page, label) {
  const item = `[...document.querySelectorAll('.beeson-session-menu button')].find((b) => b.textContent === ${JSON.stringify(label)})`;
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

// a new comment of text on what the Comment command targets now, sent from the draft of the pane
async function comment(page, text, how = 'key') {
  await front(page);
  if (how === 'key') await press(page, COMMENT_KEY);
  else await click(page, '[data-command="insert.comment"]');
  await page.waitFor(`document.activeElement?.matches('${PANE} .draft textarea')`);
  await type(page, text);
  const label = await page.evaluate(`document.querySelector('${PANE} .draft .anchor').textContent`);
  await click(page, `${PANE} .draft .actions .primary`);
  await page.waitFor(`!document.querySelector('${PANE} .draft')`);
  return label;
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

test('a comment on an element, on the text element of the caret, and on a slide is seen on the other page with its badge', { timeout: 300_000 }, async (t) => {
  const { server, pages: [a, b] } = await pair(t);

  await show(a, 'One');
  await click(a, `.reveal .slides > section:nth-child(1) p`);
  assert.equal(await comment(a, 'The first comment'), 'On Paragraph: First slide');
  await show(b, 'One');
  await b.waitFor(`${badgeOf(el(0, 'p'))} === '1*'`);
  assert.equal(await a.evaluate(badgeOf(el(0, 'p'))), '1');

  await show(a, 'Two');
  await caretAtEnd(a, el(1, 'h2'));
  assert.equal(await comment(a, 'On the heading'), 'On Heading: Two');
  await show(b, 'Two');
  await b.waitFor(`${badgeOf(el(1, 'h2'))} === '1*'`);

  await click(a, '.beeson-edit-nav .row:nth-of-type(2)');
  assert.equal(await comment(a, 'On the slide', 'toolbar'), 'On Slide 2');
  // a page behind other windows does not draw frames, and the badges are drawn in one
  await front(b);
  await b.waitFor(`${badgeOf(slideEl(1), true)} === '1*'`);

  // nothing of a comment reaches index.html
  assert.equal(await converge(server, [a, b]), TALK);
  clean(a);
  clean(b);
});

test('a thread stays on its element through the edits of another person and the unsent edits of its page', { timeout: 300_000 }, async (t) => {
  const { server, pages: [a, b] } = await pair(t);
  await show(a, 'Two');
  await click(a, '.reveal .slides > section:nth-child(2) > p');
  assert.equal(await comment(a, 'On the paragraph'), 'On Paragraph: Second slide');
  await badge(b, 'Two', 'p', '1*');

  await t.test('the other person typed before it', async () => {
    await show(b, 'Two');
    await caretAtEnd(b, on('Two', 'h2'));
    await type(b, ' typed');
    assert.ok((await converge(server, [a, b])).includes('<h2>Two typed</h2>'));
    await badge(a, 'Two', 'p', '1');
    await badge(b, 'Two', 'p', '1*');
  });

  await t.test('the other person inserted an element before it', async () => {
    await show(b, 'Two');
    await click(b, '.reveal section.present > h2');
    await press(b, 'Escape');
    await b.evaluate(`window.BeesonEditor.exec('edit.duplicate')`);
    const text = await converge(server, [a, b]);
    assert.equal(text.match(/>Two typed<\/h2>/g).length, 2, text);
    await badge(a, 'Two', 'p', '1');
    await badge(b, 'Two', 'p', '1*');
  });

  await t.test('the other person inserted a slide before it', async () => {
    await show(b, 'One');
    await b.evaluate(`window.BeesonEditor.exec('slide.new')`);
    assert.equal((await converge(server, [a, b])).match(/<section/g).length, 3);
    await badge(a, 'Two', 'p', '1');
    await badge(b, 'Two', 'p', '1*');
    await sees(a, GROUPS, ['Slide 3']);
  });

  await t.test('the other person moved it, and moved its slide', async () => {
    await show(b, 'Two');
    await click(b, '.reveal section.present > p');
    await press(b, 'Escape');
    await press(b, 'ArrowRight');
    assert.match(await converge(server, [a, b]), /<p style="translate: 1px [^"]*">Second slide<\/p>/);
    await badge(a, 'Two', 'p', '1');
    await front(b);
    await click(b, '.beeson-edit-nav .row:nth-of-type(3)');
    await b.evaluate(`window.BeesonEditor.exec('slide.moveUp')`);
    await converge(server, [a, b]);
    assert.equal(await a.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].indexOf(${on('Two')})`), 1);
    await badge(a, 'Two', 'p', '1');
    await badge(b, 'Two', 'p', '1*');
    await sees(a, GROUPS, ['Slide 2']);
  });

  await t.test('a comment made while the edits of its page are not sent is on the element it was made on', async () => {
    await show(a, 'Two');
    await a.evaluate(HOLD);
    await caretAtEnd(a, on('Two', 'h2'));
    await type(a, ' held');
    await click(a, '.reveal section.present li:last-child');
    const sent = comment(a, 'On Beta');
    // the comment waits for the edits of the page, which are held
    await a.waitFor(`window.__held.length > 0 && !!document.querySelector('${PANE} .draft')`);
    await a.evaluate('window.__go()');
    assert.match(await sent, /Beta/);
    assert.ok((await converge(server, [a, b])).includes('<h2>Two typed held</h2>'));
    await badge(b, 'Two', 'li:last-child', '1*');
    await badge(b, 'Two', 'p', '1*');
    await badge(a, 'Two', 'li:last-child', '1');
  });

  assert.equal(server.read().includes('comment'), false);
  clean(a);
  clean(b);
});

test('a thread on a removed element falls back to its slide, then to the deck, and comes back with an undo', { timeout: 300_000 }, async (t) => {
  const { server, pages: [a, b] } = await pair(t);
  await show(a, 'Two');
  await click(a, '.reveal .slides > section:nth-child(2) > p');
  await comment(a, 'On the paragraph');
  const before = await converge(server, [a, b]);
  const thread = (anchor) => [{ anchor, texts: ['On the paragraph'] }];

  await show(b, 'Two');
  await click(b, '.reveal section.present > p');
  await press(b, 'Escape');
  await b.evaluate(`window.BeesonEditor.exec('element.delete')`);
  assert.equal((await converge(server, [a, b])).includes('Second slide'), false);
  await badge(a, 'Two', null, '1');
  await sees(a, THREADS, thread('On a removed element'));
  await sees(a, GROUPS, ['Slide 2']);

  await front(b);
  await press(b, 'Mod+Z');
  assert.equal(await converge(server, [a, b]), before);
  await badge(a, 'Two', 'p', '1');
  await sees(a, THREADS, thread('On Paragraph: Second slide'));

  await front(b);
  await click(b, '.beeson-edit-nav .row:nth-of-type(2)');
  await b.evaluate(`window.BeesonEditor.exec('slide.delete')`);
  assert.equal((await converge(server, [a, b])).match(/<section/g).length, 1);
  await sees(a, THREADS, thread('On a removed slide'));
  await sees(a, GROUPS, ['On the deck']);
  assert.equal(await a.evaluate(`document.querySelectorAll('.beeson-comment-badge').length`), 0);

  await front(b);
  await press(b, 'Mod+Z');
  assert.equal(await converge(server, [a, b]), before);
  await badge(a, 'Two', 'p', '1');
  await sees(a, THREADS, thread('On Paragraph: Second slide'));
  clean(a);
  clean(b);
});
