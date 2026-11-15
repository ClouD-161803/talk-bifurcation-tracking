// the Version History pane of a session in Chrome, on the edit command started on a temporary talk
// folder with SLIDES_HISTORY set, so that a version is closed 2 s after the last operation or only
// when it is named: the list after the edits of a host and a guest, live while the pane is
// open, the mode with the chrome inert, folding and named versions, the preview with the outlines
// of the changed elements in the tones of their authors, Restore seen by both pages and in
// index.html, Name, Download, the page offline while the pane is open, and a phone of 390 px

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { startRelay } from '../scripts/relay.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, ONLINE, open, sessionUrl, show, talk, TALK, TEXT } from './helpers/client.mjs';
import { click, press, type, typeKeys } from './helpers/editor.mjs';
import { raw, until } from './helpers/session.mjs';

const SECRET = 'the secret of the group for this test';
// a version is closed 2 s after the last operation, hence the keys of one typeKeys are one version
const QUICK = { SLIDES_HISTORY: JSON.stringify({ quiet: 2000 }) };
// a version is closed only when the current state is named
const HELD = { SLIDES_HISTORY: JSON.stringify({ quiet: 3_600_000, longest: 3_600_000 }) };

const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;
const PANE = '.beeson-session-history';
const SHOWN = `!!document.querySelector('${PANE}:not([hidden])')`;
const BAR = '.beeson-session-preview .bar';
const FRAME = `document.querySelector('.beeson-session-preview iframe')`;
// the rows of the list, the day headings, the folds, and the empty text, in order
const LIST = `[...document.querySelectorAll('${PANE} .versions > :is(.row.version, .fold, .folded, h3, .empty)')].map((el) =>
  el.matches('.folded') ? { folded: [...el.children].map((r) => r.querySelector('.title').textContent), hidden: el.hidden }
  : el.matches('.row') ? { title: el.querySelector('.title').textContent, who: [...el.querySelectorAll('.author')].map((a) => a.textContent), slides: el.querySelector('.slides')?.textContent ?? '' }
  : el.matches('h3') ? { day: el.textContent } : el.matches('.fold') ? { fold: el.textContent } : { empty: el.textContent })`;
// the buttons of the pane and of the bar of the preview that are shown, by their text
const button = (scope, text) => `[...document.querySelectorAll('${scope} button')].find((b) => b.textContent === ${JSON.stringify(text)} && b.getClientRects().length)`;
const INERT = `['.beeson-edit-menubar', '.beeson-edit-top', '.beeson-edit-nav', '.reveal'].map((s) => document.querySelector(s)?.inert)`;
const TIME = /^\d{1,2}:\d{2}\s?[AP]M$/;

async function tapOrClick(page, expression) {
  await page.waitFor(`!!(${expression})`);
  const point = await page.evaluate(`(() => { const r = (${expression}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await click(page, point);
}

// a click on the button of text in scope, once it is shown
const press$ = (page, scope, text) => tapOrClick(page, button(scope, text));

// the pane opened by the key of Version History
async function openPane(page) {
  await front(page);
  await press(page, 'Mod+Alt+Shift+H');
  await page.waitFor(SHOWN);
}

// the name of the open dialog typed and saved
async function nameIt(page, name) {
  await page.waitFor(`document.querySelector('dialog.beeson-session-history-dialog[open] input') === document.activeElement`);
  await type(page, name);
  await press(page, 'Enter');
  await page.waitFor(`!document.querySelector('dialog.beeson-session-history-dialog[open]')`);
}

// the id of the version of the row at index i of the rows shown
const rowId = (page, i) => page.evaluate(`[...document.querySelectorAll('${PANE} .versions .row.version')].filter((r) => r.getClientRects().length)[${i}].dataset.id.slice(8)`);

// the toasts of the page recorded from now on, since a toast is gone after 6 s
const recordToasts = (page) => page.evaluate(`(() => {
  window.__toasts = [];
  new MutationObserver((records) => {
    for (const r of records) {
      if (!r.target.matches?.('.beeson-session-toast')) continue;
      for (const n of r.addedNodes) if (n.localName === 'span') window.__toasts.push(n.textContent + '|' + r.target.getAttribute('role'));
    }
  }).observe(document.body, { childList: true, subtree: true });
  return true;
})()`);

// the color of the tone of a person of index color in the page of doc, as getComputedStyle writes it
const TONES = [2, 3, 5, 7];
const toneIn = (doc, color) => `(() => { const d = ${doc}; const p = d.createElement('span'); p.style.color = 'var(--data-${TONES[color]})'; d.body.append(p); const c = d.defaultView.getComputedStyle(p).color; p.remove(); return c; })()`;

test('the versions of a host and a guest are listed live, fold, are named, and the mode holds the edits of the person', { timeout: 300_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET, idleMs: 600, pullMs: 1000, guestMs: 5000 });
  t.after(() => relay.close());
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { args: ['--relay', relay.url], env: { SLIDES_RELAY_SECRET: SECRET, ...QUICK } });
  const { key } = server.edit;
  await until(async () => (await fetch(`${relay.url}/${key}/index.html`)).status === 200, 'the edit command to register with the relay');
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const ben = await open(browser, `${relay.url}/${key}/index.html?edit&session`, { name: 'Ben' });
  assert.deepEqual([await ann.evaluate(`${C}.host`), await ben.evaluate(`${C}.host`)], [true, false]);
  await converge(server, [ann, ben]);

  await t.test('File > Version History opens the pane, and the chrome is inert', async () => {
    await front(ann);
    await ann.evaluate(`[...document.querySelectorAll('.beeson-edit-menubar [role="menuitem"]')].find((b) => b.textContent === 'File').click(), true`);
    await ann.waitFor(`[...document.querySelectorAll('.beeson-edit-menu .item')].some((i) => i.textContent.startsWith('Version History'))`);
    await ann.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.textContent.startsWith('Version History')).click(), true`);
    await ann.waitFor(SHOWN);
    assert.deepEqual(await ann.evaluate(INERT), [true, true, true, true]);
    assert.deepEqual(await ann.evaluate(LIST), [{ empty: 'No earlier versions yet.' }]);
    assert.equal(await ann.evaluate(`document.querySelector('${PANE} .row.current').getAttribute('aria-current')`), 'true');
  });

  await t.test('an edit of the guest is listed live, and its apply goes on under the mode', async () => {
    await show(ben, 'Two');
    await caretAtEnd(ben, el(1, 'p'));
    await typeKeys(ben, ' by Ben');
    await front(ann);
    await ann.waitFor(`${LIST}.length === 2`);
    const [day, row] = await ann.evaluate(LIST);
    assert.deepEqual(day, { day: 'Today' });
    assert.match(row.title, TIME);
    assert.deepEqual([row.who, row.slides], [['Ben'], 'Slide 2']);
    await ann.waitFor(`${TEXT}.includes('Second slide by Ben')`);
    // the dot of Ben is in the tone of Ben
    const dot = await ann.evaluate(`getComputedStyle(document.querySelector('${PANE} .row.version .dot')).backgroundColor`);
    assert.equal(dot, await ann.evaluate(toneIn('document', await ben.evaluate(`${C}.color`))));
  });

  await t.test('the person cannot edit in the mode, and Esc goes back to the editor', async () => {
    await front(ann);
    await press(ann, 'Mod+A');
    await press(ann, 'Backspace');
    await press(ann, 'Mod+Z');
    // a command run from anywhere, e.g. a context menu, is held too
    await ann.evaluate(`window.BeesonEditor.exec('slide.new').then(() => window.BeesonEditor.exec('slide.delete')).then(() => true)`);
    assert.equal(await ann.evaluate(`document.querySelectorAll('.reveal .slides > section').length`), 2);
    await press(ann, 'Escape');
    await ann.waitFor(`!(${SHOWN})`);
    assert.deepEqual(await ann.evaluate(INERT), [false, false, false, false]);
    assert.equal(await ann.evaluate(`document.documentElement.classList.contains('beeson-history')`), false);
    assert.equal(await converge(server, [ann, ben]), TALK.replace('<p>Second slide</p>', '<p>Second slide by Ben</p>'));
  });

  await t.test('unnamed versions under 30 minutes apart fold under the newest', async () => {
    await show(ann, 'One');
    await caretAtEnd(ann, el(0, 'h2'));
    await typeKeys(ann, ' more');
    await converge(server, [ann, ben]);
    await openPane(ann);
    await ann.waitFor(`${LIST}.length === 4`);
    const list = await ann.evaluate(LIST);
    assert.deepEqual(list.map((x) => x.who ?? x.fold ?? x.day ?? x.folded), ['Today', ['Ann'], 'Show 1 more', [list[3].folded[0]]]);
    assert.equal(list[3].hidden, true);
    await press$(ann, PANE, 'Show 1 more');
    await ann.waitFor(`${LIST}[3].hidden === false`);
    assert.equal(await ann.evaluate(`${LIST}[2].fold`), 'Hide 1 more');
  });

  await t.test('a version is named in the bar of its preview, and Only show named versions lists it alone', async () => {
    await tapOrClick(ann, `[...document.querySelectorAll('${PANE} .versions .row.version')][1]`);
    await press$(ann, BAR, 'Name this version');
    await nameIt(ann, 'Draft for Ben');
    await ann.waitFor(`${LIST}[2]?.title === 'Draft for Ben'`);
    const list = await ann.evaluate(LIST);
    // a named version does not fold
    assert.deepEqual(list.map((x) => x.title ?? x.day ?? x.fold), ['Today', list[1].title, 'Draft for Ben']);
    assert.match(list[1].title, TIME);
    await tapOrClick(ann, `document.querySelector('${PANE} label.named input')`);
    await ann.waitFor(`${LIST}.length === 2`);
    assert.deepEqual((await ann.evaluate(LIST)).map((x) => x.title ?? x.day), ['Today', 'Draft for Ben']);
    await tapOrClick(ann, `document.querySelector('${PANE} label.named input')`);
    await ann.waitFor(`${LIST}.length === 3`);
    // Name this version under Current version names the newest version when no edit is open
    await press$(ann, PANE, 'Name this version');
    await nameIt(ann, 'Now');
    await ann.waitFor(`${LIST}[1]?.title === 'Now'`);
    assert.deepEqual((await ann.evaluate(LIST)).map((x) => x.title ?? x.day), ['Today', 'Now', 'Draft for Ben']);
  });

  await t.test('Download This Version downloads the text of the version', async () => {
    await ann.evaluate(`${C}.shell.download = (text) => { window.__downloaded = text; }, true`);
    const id = await rowId(ann, 1);
    await tapOrClick(ann, `[...document.querySelectorAll('${PANE} .versions .row.version')][1]`);
    await ann.waitFor(`${FRAME}?.src.includes('version=${id}')`);
    await tapOrClick(ann, `document.querySelector('${BAR} button.more')`);
    await tapOrClick(ann, `[...document.querySelectorAll('.beeson-session-menu button')].find((b) => b.textContent === 'Download This Version')`);
    await ann.waitFor('typeof window.__downloaded === "string"');
    const served = await raw(server.edit.port, 'GET', `${server.edit.base}index.html?version=${id}`);
    assert.equal(await ann.evaluate('window.__downloaded'), served.text);
    assert.equal(served.text, TALK.replace('<p>Second slide</p>', '<p>Second slide by Ben</p>'));
  });

  await t.test('the guest opens the pane from the menu of the save state and sees the same list', async () => {
    await front(ben);
    await tapOrClick(ben, `document.querySelector('.beeson-session-state')`);
    await tapOrClick(ben, `[...document.querySelectorAll('.beeson-session-menu button')].find((b) => b.textContent === 'Version History')`);
    await ben.waitFor(SHOWN);
    await ben.waitFor(`${LIST}.length === 3`);
    assert.deepEqual((await ben.evaluate(LIST)).map((x) => x.title ?? x.day ?? x.fold), (await ann.evaluate(LIST)).map((x) => x.title ?? x.day ?? x.fold));
    await press$(ben, PANE, 'Back to editor');
    await ben.waitFor(`!(${SHOWN})`);
  });
  clean(ann);
  clean(ben);
});
