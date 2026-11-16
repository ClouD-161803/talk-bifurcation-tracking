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
const COMMENT_KEY = process.platform === 'darwin' ? 'Mod+Alt+M' : 'Shift+F2';
// the key of the tab n of the inspector, as PANE_KEYS of src/editor/commands/view.ts binds it
const TAB_KEY = (n) => (process.platform === 'darwin' ? `Ctrl+Mod+${n}` : `Ctrl+Shift+${n}`);
const PANE = '.beeson-edit-inspector .panel.comments';
const OFFLINE = 'Comments can be sent once you are back online';

// the text of the badge of the element of expression, found at its place 4 px outside the upper
// right corner of the element, or 18 px while the element is selected, or inside the upper right
// corner of a slide, with * when it is filled for an unread thread, or null
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

// a click on the item labeled label of the open menu
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
  await sees(a, badgeOf(el(0, 'p')), '1', 'the badge on the page that made the comment');

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
    await until(() => server.read().includes('<h2>Two typed</h2>'), 'the typing to reach index.html');
    assert.ok((await converge(server, [a, b])).includes('<h2>Two typed</h2>'), 'the typing reaches both pages');
    await badge(a, 'Two', 'p', '1');
    await badge(b, 'Two', 'p', '1*');
  });

  await t.test('the other person inserted an element before it', async () => {
    await show(b, 'Two');
    await click(b, '.reveal section.present > h2');
    await press(b, 'Escape');
    await b.evaluate(`window.BeesonEditor.exec('edit.duplicate')`);
    await until(() => server.read().match(/>Two typed<\/h2>/g)?.length === 2, 'the copy to reach index.html');
    const text = await converge(server, [a, b]);
    assert.equal(text.match(/>Two typed<\/h2>/g).length, 2, text);
    await badge(a, 'Two', 'p', '1');
    await badge(b, 'Two', 'p', '1*');
  });

  await t.test('the other person inserted a slide before it', async () => {
    await show(b, 'One');
    await b.evaluate(`window.BeesonEditor.exec('slide.new')`);
    await until(() => server.read().match(/<section/g).length === 3, 'the new slide to reach index.html');
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
    await until(() => /<p style="translate: 1px [^"]*">Second slide<\/p>/.test(server.read()), 'the move to reach index.html');
    assert.match(await converge(server, [a, b]), /<p style="translate: 1px [^"]*">Second slide<\/p>/);
    await badge(a, 'Two', 'p', '1');
    await front(b);
    await click(b, '.beeson-edit-nav .row:nth-of-type(3)');
    await b.evaluate(`window.BeesonEditor.exec('slide.moveUp')`);
    await until(() => server.read().split('<section').findIndex((s) => s.includes('<h2>Two typed</h2>')) === 2, 'the slide moved up to reach index.html');
    await converge(server, [a, b]);
    await sees(a, `[...document.querySelectorAll('.reveal .slides > section')].indexOf(${on('Two')})`, 1, 'the index of the slide moved up');
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
    await until(() => server.read().includes('<h2>Two typed held</h2>'), 'the typing to reach index.html');
    assert.ok((await converge(server, [a, b])).includes('<h2>Two typed held</h2>'), 'the typing reaches both pages');
    await badge(b, 'Two', 'li:last-child', '1*');
    await badge(b, 'Two', 'p', '1*');
    await badge(a, 'Two', 'li:last-child', '1');
  });

  assert.equal(server.read().includes('comment'), false, 'a comment in index.html');
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

  // the caret of Ann left the paragraph for the draft, and the end of her hold reaches Ben later
  await until(() => b.evaluate(`!document.querySelector('.reveal .slides > section:nth-child(2) > p').classList.contains('beeson-held')`), 'the paragraph that Ann left to be free on the page of Ben');
  await show(b, 'Two');
  await click(b, '.reveal section.present > p');
  await press(b, 'Escape');
  await b.evaluate(`window.BeesonEditor.exec('element.delete')`);
  await until(() => !server.read().includes('Second slide'), 'the removal to reach index.html');
  assert.equal((await converge(server, [a, b])).includes('Second slide'), false, 'the removed paragraph on the pages');
  await badge(a, 'Two', null, '1');
  await sees(a, THREADS, thread('On a removed element'));
  await sees(a, GROUPS, ['Slide 2']);

  await front(b);
  await press(b, 'Mod+Z');
  await until(() => server.read() === before, 'the undo to reach index.html');
  assert.equal(await converge(server, [a, b]), before);
  await badge(a, 'Two', 'p', '1');
  await sees(a, THREADS, thread('On Paragraph: Second slide'));

  await front(b);
  await click(b, '.beeson-edit-nav .row:nth-of-type(2)');
  await b.evaluate(`window.BeesonEditor.exec('slide.delete')`);
  await until(() => server.read().match(/<section/g).length === 1, 'the removal of the slide to reach index.html');
  assert.equal((await converge(server, [a, b])).match(/<section/g).length, 1);
  await sees(a, THREADS, thread('On a removed slide'));
  await sees(a, GROUPS, ['On the deck']);
  await sees(a, `document.querySelectorAll('.beeson-comment-badge').length`, 0, 'the badges after the removal of the slide');

  await front(b);
  await press(b, 'Mod+Z');
  await until(() => server.read() === before, 'the undo to reach index.html');
  assert.equal(await converge(server, [a, b]), before);
  await badge(a, 'Two', 'p', '1');
  await sees(a, THREADS, thread('On Paragraph: Second slide'));
  clean(a);
  clean(b);
});

test('the actions on a thread, the rights of its author, the filters, a mention, a changed name, and a page that joins later or loads again', { timeout: 300_000 }, async (t) => {
  const { browser, server, pages: [a, b] } = await pair(t);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'The first comment');
  const id = await a.evaluate(`document.querySelector('${PANE} article').dataset.id`);
  const ARTICLE = `${PANE} article[data-id="${id}"]`;
  const first = (texts) => ({ anchor: 'On Paragraph: First slide', texts });
  await openPane(b);

  await t.test('a reply reaches the author, who alone can edit or delete the comment', async () => {
    await sees(b, THREADS, [first(['The first comment'])]);
    assert.equal(await b.evaluate(`!!document.querySelector('${ARTICLE} > .item:first-child .more')`), false, 'the menu of a comment of another person');
    await click(b, `${ARTICLE} .reply textarea`);
    await type(b, 'A reply');
    await click(b, `${ARTICLE} .reply .actions .primary`);
    await sees(a, THREADS, [first(['The first comment', 'A reply'])]);
    const refused = (route) => b.evaluate(`${C}.transport.post('comments/${id}/${route}', { token: ${C}.token, text: 'Taken over', mentions: [] }).then(() => 0, (e) => e.status)`);
    assert.equal(await refused('edit'), 403);
    assert.equal(await refused('delete'), 403);

    await front(a);
    await click(a, `${ARTICLE} > .item:first-child .more`);
    await menu(a, 'Edit');
    await a.waitFor(`document.activeElement?.matches('${ARTICLE} textarea') && document.activeElement.value === 'The first comment'`);
    await a.evaluate('document.activeElement.select()');
    await type(a, 'The first comment, edited');
    await click(a, `${ARTICLE} > .item:first-child .actions .primary`);
    await sees(b, THREADS, [first(['The first comment, edited', 'A reply'])]);
    assert.match(await b.evaluate(`document.querySelector('${ARTICLE} .item .time').textContent`), / \(edited\)$/);

    await front(b);
    await click(b, `${ARTICLE} > .item ~ .item .more`);
    await menu(b, 'Delete');
    await sees(a, THREADS, [first(['The first comment, edited'])]);
  });

  await t.test('a resolved thread leaves Open for Resolved, and Reopen brings it back', async () => {
    await front(a);
    await click(a, `${ARTICLE} .resolve`);
    await sees(b, THREADS, []);
    await sees(b, EMPTY, 'No open comments.');
    await badge(b, 'One', 'p', null);
    await click(b, `${PANE} .filters [data-filter="resolved"]`);
    await sees(b, THREADS, [first(['The first comment, edited'])]);
    assert.match(await b.evaluate(`document.querySelector('${ARTICLE} .resolved-by').textContent`), /^Resolved by Ann, /);
    await click(b, `${ARTICLE} .text-button`);
    await sees(b, EMPTY, 'No resolved comments.');
    await click(b, `${PANE} .filters [data-filter="open"]`);
    await sees(b, THREADS, [first(['The first comment, edited'])]);
    await badge(a, 'One', 'p', '1');
  });

  await t.test('a mention reaches the person with a toast and a count, which a look at the thread clears', async () => {
    await show(b, 'Two');
    await click(b, '.reveal section.present > p');
    await press(b, COMMENT_KEY);
    await b.waitFor(`document.activeElement?.matches('${PANE} .draft textarea')`);
    await typeKeys(b, 'Look, @An');
    await sees(b, `[...document.querySelectorAll('${PANE} .draft .people li')].map((li) => [li.children[1].textContent, li.getAttribute('aria-selected')])`, [['Ann', 'true']]);
    await press(b, 'Enter');
    await typeKeys(b, 'what do you think?');
    assert.equal(await b.evaluate('document.activeElement.value'), 'Look, @Ann what do you think?');
    await click(b, `${PANE} .draft .actions .primary`);
    await b.waitFor(`!document.querySelector('${PANE} .draft')`);
    const look = { anchor: 'On Paragraph: Second slide', texts: ['Look, @Ann what do you think?'] };

    await front(a);
    await sees(a, TOASTS, ['Ben mentioned you on slide 2']);
    await sees(a, COUNT, 'Comments, 1 unread');
    assert.equal(await a.evaluate(`document.querySelector('.beeson-session-comments .count').textContent`), '1');
    await sees(a, `[...document.querySelectorAll('${PANE} .mention')].map((m) => m.textContent)`, ['@Ann']);
    await badge(a, 'Two', 'p', '1*');

    // For You holds the threads that a person wrote, replied to, or is mentioned in
    await click(a, `${PANE} .filters [data-filter="mine"]`);
    await sees(a, THREADS, [first(['The first comment, edited']), look]);
    await front(b);
    await click(b, `${PANE} .filters [data-filter="mine"]`);
    await sees(b, THREADS, [look]);
    await click(b, `${PANE} .filters [data-filter="open"]`);
    await sees(b, THREADS, [first(['The first comment, edited']), look]);

    await front(a);
    await click(a, '.beeson-session-toast button');
    await sees(a, COUNT, 'Comments');
    await badge(a, 'Two', 'p', '1');
    assert.equal(await a.evaluate(`document.activeElement?.closest('article')?.querySelector('.text')?.textContent`), 'Look, @Ann what do you think?');
  });

  await t.test('a changed name is shown on the comments and the mentions of the person', async () => {
    // as Change Name of the menu of the avatar does
    await a.evaluate(`(async () => {
      const c = ${C};
      const answer = await c.transport.name(c.token, 'Annabel');
      localStorage.setItem('beeson-session-name', answer.name);
      c.setName(answer.name);
    })()`);
    await front(b);
    await sees(b, `[...document.querySelectorAll('${PANE} .item .who')].map((w) => w.textContent)`, ['Annabel', 'Ben']);
    await sees(b, `[...document.querySelectorAll('${PANE} .mention')].map((m) => m.textContent)`, ['@Annabel']);
  });

  await t.test('a page that joins later and a page that loads again show the threads, with what was read', async () => {
    const c = await open(browser, sessionUrl(server.edit), { name: 'Cy' });
    await openPane(c);
    await sees(c, THREADS, [first(['The first comment, edited']), { anchor: 'On Paragraph: Second slide', texts: ['Look, @Annabel what do you think?'] }]);
    await badge(c, 'One', 'p', '1*');
    await badge(c, 'Two', 'p', '1*');
    await sees(c, COUNT, 'Comments');

    const count = await loads(a);
    await a.evaluate('location.reload()').catch(() => {});
    await until(async () => (await loads(a).catch(() => 0)) > count, 'the page to load again');
    await a.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    await a.waitFor(ONLINE);
    await front(a);
    await badge(a, 'Two', 'p', '1');
    assert.equal(await a.evaluate(COUNT), 'Comments');
    await openPane(a);
    await sees(a, THREADS, [first(['The first comment, edited']), { anchor: 'On Paragraph: Second slide', texts: ['Look, @Annabel what do you think?'] }]);
    clean(c);
  });

  assert.equal(await converge(server, [a, b]), TALK);
  clean(a);
  // the refused edit and delete of a comment of another person
  clean(b, [/status of 403/]);
});

test('offline, the Comment command is disabled, and a draft is kept until the page is back online', { timeout: 300_000 }, async (t) => {
  const { server, pages: [a] } = await pair(t, ['Ann']);
  const { port } = server.edit;
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'Before the stop');
  await caretAtEnd(a, el(0, 'h2'));
  await press(a, COMMENT_KEY);
  await a.waitFor(`document.activeElement?.matches('${PANE} .draft textarea')`);
  // the edit command writes its comments at most once a second, and a kill does not wait for it
  const file = join(server.talk, '.session', 'comments.json');
  await until(() => existsSync(file) && readFileSync(file, 'utf8').includes('Before the stop'), 'the edit command to write the comment');

  server.edit.child.kill('SIGKILL');
  await server.edit.exited;
  await a.waitFor(`/^Offline/.test(${STATE})`);
  await type(a, 'Written offline');
  assert.deepEqual(await a.evaluate(`window.BeesonEditor.state('insert.comment')`), { id: 'insert.comment', label: 'Comment', enabled: false, checked: null, why: OFFLINE });
  await sees(a, `(() => { const b = document.querySelector('${PANE} .draft .actions .primary'); return [b.disabled, b.title, document.querySelector('${PANE} .draft textarea').value]; })()`, [true, OFFLINE, 'Written offline']);
  await sees(a, THREADS, [{ anchor: 'On Paragraph: First slide', texts: ['Before the stop'] }]);

  await server.start(['--port', String(port)]);
  await front(a);
  await click(a, '.beeson-session-action');
  await a.waitFor(ONLINE);
  await sees(a, `document.querySelector('${PANE} .draft .actions .primary').disabled`, false);
  assert.equal(await a.evaluate(`document.querySelector('${PANE} .draft textarea').value`), 'Written offline');
  await click(a, `${PANE} .draft .actions .primary`);
  await a.waitFor(`!document.querySelector('${PANE} .draft')`);
  await sees(a, THREADS, [{ anchor: 'On Heading: One', texts: ['Written offline'] }, { anchor: 'On Paragraph: First slide', texts: ['Before the stop'] }]);
  assert.equal(await converge(server, [a]), TALK);
  clean(a, REFUSED);
});

test('the three tabs of the inspector and the keys of the pane, text that looks like HTML, and a phone of 390 px', { timeout: 300_000 }, async (t) => {
  const { browser, server, pages: [a, b] } = await pair(t, ['<b>Ann</b>', 'Ben']);
  const RAW = '<img src=x onerror="window.__html = 1"><b>bold</b> & <script>window.__html = 2</script>';

  await t.test('the tabs Format, Steps, and Comments take their keys and the arrow keys', async () => {
    await front(a);
    assert.deepEqual(await a.evaluate(TABS), ['Format', 'Steps', 'Comments']);
    await click(a, '.reveal .slides > section:nth-child(1)');
    for (const [n, tab] of [[4, 'Comments'], [1, 'Format'], [2, 'Steps'], [4, 'Comments'], [4, null]]) {
      await press(a, TAB_KEY(n));
      await sees(a, TAB, tab, `the tab after ${TAB_KEY(n)}`);
    }
    await press(a, TAB_KEY(1));
    await a.evaluate(`document.querySelector('#beeson-edit-tab-format').focus()`);
    for (const [key, tab] of [['ArrowRight', 'Steps'], ['ArrowRight', 'Comments'], ['ArrowRight', 'Format'], ['ArrowLeft', 'Comments']]) {
      await press(a, key);
      await sees(a, `[${TAB}, document.activeElement.textContent]`, [tab, tab], `the tab after ${key}`);
    }
    assert.equal(await a.evaluate(`window.BeesonEditor.state('view.comments').checked`), true, 'the command Comments checked');
  });

  await t.test('the text and the name of a person are shown as text', async () => {
    await show(a, 'One');
    await click(a, '.reveal .slides > section:nth-child(1) p');
    await comment(a, RAW);
    await openPane(b);
    await sees(b, THREADS, [{ anchor: 'On Paragraph: First slide', texts: [RAW] }]);
    assert.deepEqual(await b.evaluate(`({
      who: document.querySelector('${PANE} .item .who').textContent,
      elements: document.querySelectorAll('${PANE} :is(.text, .who, .avatar) *').length,
      html: window.__html ?? null,
    })`), { who: '<b>Ann</b>', elements: 0, html: null });
  });

  await t.test('the keys of the pane move between the threads, reply, resolve, and leave', async () => {
    await show(a, 'Two');
    await click(a, '.reveal .slides > section:nth-child(2) > p');
    await comment(a, 'The second thread');
    const ids = await a.evaluate(`[...document.querySelectorAll('${PANE} article')].map((n) => n.dataset.id)`);
    assert.equal(ids.length, 2);
    const at = `document.activeElement?.closest('article')?.dataset.id ?? null`;
    await a.evaluate(`document.querySelector('${PANE} article').focus()`);
    await press(a, 'J');
    await sees(a, `[${at}, Reveal.getIndices().h]`, [ids[1], 1]);
    await press(a, 'K');
    await sees(a, `[${at}, Reveal.getIndices().h]`, [ids[0], 0]);
    await press(a, 'R');
    await sees(a, `document.activeElement.matches('${PANE} article[data-id="${ids[0]}"] .reply textarea')`, true);
    await press(a, 'Escape');
    await sees(a, `document.activeElement.matches('${PANE} article[data-id="${ids[0]}"]')`, true);
    await press(a, 'U');
    await sees(a, `!!document.activeElement?.closest('${PANE}')`, false);
    await a.evaluate(`document.querySelector('${PANE} article[data-id="${ids[1]}"]').focus()`);
    await press(a, 'E');
    await sees(a, `[...document.querySelectorAll('${PANE} article')].map((n) => n.dataset.id)`, [ids[0]]);
  });

  await t.test('Comment Badges hides and shows the badges on the canvas', async () => {
    await show(a, 'One');
    await badge(a, 'One', 'p', '1');
    await click(a, '.reveal .slides > section:nth-child(1)');
    await press(a, 'Escape');
    await press(a, 'Shift+C');
    await sees(a, `document.querySelector('.beeson-comment-badges').hidden`, true);
    assert.equal(await a.evaluate(`window.BeesonEditor.state('view.commentBadges').checked`), false, 'the command Comment Badges checked');
    await press(a, 'Shift+C');
    await badge(a, 'One', 'p', '1');
  });

  await t.test('on a phone, the button Comments, the pane, and a badge take a tap, with 32 px or more', async () => {
    const c = await open(browser, sessionUrl(server.edit), { name: 'Cy', width: 390, height: 844, mobile: true });
    await front(c);
    assert.deepEqual(await c.evaluate(`(() => {
      const b = document.querySelector('.beeson-session-comments');
      const r = b.getBoundingClientRect();
      return { inside: r.left >= 0 && r.right <= innerWidth, hit: b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) };
    })()`), { inside: true, hit: true });
    await sees(c, HITS('.beeson-session-comments'), []);
    await show(c, 'One');
    await sees(c, `${badgeOf(el(0, 'p'))}`, '1*');
    await sees(c, HITS('.beeson-comment-badge'), []);
    await touch(c, '.beeson-comment-badge');
    await sees(c, TAB, 'Comments');
    await sees(c, `document.activeElement?.closest('article')?.querySelector('.text')?.textContent`, RAW);
    await sees(c, HITS(`.beeson-edit-inspector .tabs button, ${PANE} :is(button, textarea)`), []);
    await touch(c, `${PANE} article .reply textarea`);
    await type(c, 'From a phone');
    await sees(c, HITS(`${PANE} :is(button, textarea)`), []);
    await touch(c, `${PANE} article .reply .actions .primary`);
    await sees(a, THREADS, [{ anchor: 'On Paragraph: First slide', texts: [RAW, 'From a phone'] }]);
    await touch(c, '.beeson-session-comments');
    await sees(c, TAB, null);
    clean(c);
  });

  assert.equal(await converge(server, [a, b]), TALK);
  clean(a);
  clean(b);
});

test('a badge, its label, and the count of its slide in the navigator read the number of open threads', { timeout: 300_000 }, async (t) => {
  const { pages: [a, b] } = await pair(t);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'The first thread');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await comment(a, 'The second thread');
  await badge(b, 'One', 'p', '2*');
  await sees(b, `[document.querySelector('.beeson-comment-badge').getAttribute('aria-label'), document.querySelector('.beeson-edit-nav .row:nth-of-type(1) .beeson-comment-count')?.textContent ?? null]`, ['2 threads, unread', '2']);
  clean(a);
  clean(b);
});
