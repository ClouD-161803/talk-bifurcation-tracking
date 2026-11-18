// the Version History pane of a session in Chrome, on the edit command started on a temporary talk
// folder with SLIDES_HISTORY set, so that a version is closed 2 s after the last operation or only
// when it is named: the list after the edits of a host and a guest, live while the pane is
// open, the mode with the chrome inert, folding and named versions, the preview with the outlines
// of the changed elements and the tints of the added characters in the tones of their authors, Restore seen by both pages and in
// index.html, Name, Download, the page offline while the pane is open, a phone of 390 px, and the
// list, the toasts, and the mode against histories written by hand, a compaction, a conflict, a
// reload held back, and midnight

import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { startRelay } from '../scripts/relay.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, HISTORY_KEY, ONLINE, open, sessionUrl, show, talk, TALK, TEXT } from './helpers/client.mjs';
import { click, drag, press, type, typeKeys } from './helpers/editor.mjs';
import { downloads, goOffline, goOnline, press as pressConflict, tab } from './helpers/offline.mjs';
import { BUBBLE, HOLDER, leave, select, session } from './helpers/presence.mjs';
import { post, raw, startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

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
// the rows of the list, the day headings, the folds, and the empty text, in order. the row of the
// start of the history is left out while it is unnamed, since the edit command begins every new
// history with it
const UNNAMED_START = (row) => `(${row}.querySelector(':scope > .who')?.textContent === 'Start of the history' && !${row}.querySelector('.sub'))`;
const LIST = `[...document.querySelectorAll('${PANE} .versions > :is(.row.version, .fold, .folded, h3, .empty)')].filter((el) => !${UNNAMED_START('el')}).map((el) =>
  el.matches('.folded') ? { folded: [...el.children].map((r) => r.querySelector('.title').textContent), hidden: el.hidden }
  : el.matches('.row') ? { title: el.querySelector('.title').textContent, who: [...el.querySelectorAll('.author')].map((a) => a.textContent), slides: el.querySelector('.slides')?.textContent ?? '' }
  : el.matches('h3') ? { day: el.textContent } : el.matches('.fold') ? { fold: el.textContent } : { empty: el.textContent })`;
// the buttons of the pane and of the bar of the preview that are shown, by their text
const button = (scope, text) => `[...document.querySelectorAll('${scope} button')].find((b) => b.textContent === ${JSON.stringify(text)} && b.getClientRects().length)`;
const INERT = `['.beeson-edit-menubar', '.beeson-edit-top', '.beeson-edit-nav', '.reveal', '.beeson-edit-bottom'].map((s) => document.querySelector(s)?.inert)`;
const MIN = 60_000;
// the time t written in the page as the pane writes it, in the locale of the page
const timeIn = (page, t) => page.evaluate(`new Date(${t}).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })`);
// the versions as the edit command lists them to the page, newest first
const versionsOf = (page) => page.evaluate(`${C}.transport.get('history', { token: ${C}.token }).then((a) => a.versions)`);
// the open dialog of the pane, its field, and its buttons
const DIALOG = 'dialog.beeson-session-history-dialog[open]';
const FIELD = `document.querySelector('${DIALOG} input')`;

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
  await press(page, HISTORY_KEY);
  await page.waitFor(SHOWN);
}

// the name of the open dialog typed and sent
async function typeName(page, name) {
  await page.waitFor(`document.querySelector('dialog.beeson-session-history-dialog[open] input') === document.activeElement`);
  await type(page, name);
  await press(page, 'Enter');
}

// the name of the open dialog typed and saved
async function nameIt(page, name) {
  await typeName(page, name);
  await page.waitFor(`!document.querySelector('dialog.beeson-session-history-dialog[open]')`);
}

// the id of the version of the row at index i of the rows shown
// the toasts of the page stay until they are pressed, since a slow runner may take more than their 6 s
const HOLD = `(() => { const set = window.setTimeout; window.setTimeout = (fn, ms, ...rest) => set(fn, ms === 6000 ? 3_600_000 : ms, ...rest); return true; })()`;

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
  // a poll without news is answered after 1 s, before the relay of this test gives up after 5 s
  const server = await talk(t, { args: ['--relay', relay.url], env: { SLIDES_RELAY_SECRET: SECRET, SLIDES_POLL_HOLD_MS: '1000', ...QUICK } });
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
    assert.deepEqual(await ann.evaluate(INERT), [true, true, true, true, true]);
    await ann.waitFor(`!${LIST}.some((x) => x.empty === 'Loading versions…')`);
    assert.deepEqual((await ann.evaluate(LIST)).filter((x) => x.title !== undefined), []);
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
    const [newest] = await versionsOf(ann);
    assert.equal(row.title, await timeIn(ann, newest.time));
    assert.deepEqual([row.who, row.slides], [['Ben'], 'Slide 2']);
    await ann.waitFor(`${TEXT}.includes('Second slide by Ben')`);
    // the dot of Ben is in the tone of Ben
    const dot = await ann.evaluate(`getComputedStyle(document.querySelector('${PANE} .row.version .dot')).backgroundColor`);
    assert.equal(dot, await ann.evaluate(toneIn('document', await ben.evaluate(`${C}.color`))));
  });

  await t.test('the person cannot edit in the mode, and Esc goes back to the editor', async () => {
    await front(ann);
    const before = await ann.evaluate(TEXT);
    await press(ann, 'Mod+A');
    await press(ann, 'Backspace');
    await press(ann, 'Mod+Z');
    // a command run from anywhere, e.g. a context menu, is held too
    for (const id of ['slide.new', 'slide.delete']) {
      await ann.evaluate(`window.BeesonEditor.exec('${id}').then(() => true)`);
      assert.equal(await ann.evaluate(`document.querySelectorAll('.reveal .slides > section').length`), 2, id);
      assert.equal(await ann.evaluate(TEXT), before, id);
    }
    // a paste of a table onto the slide, which is not a command, is held too
    await ann.evaluate(`(() => {
      document.activeElement?.blur();
      const data = new DataTransfer();
      data.setData('text/plain', 'a\\tb\\nc\\td');
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      return true;
    })()`);
    assert.equal(await ann.evaluate(`document.querySelectorAll('.reveal table').length`), 0);
    assert.equal(await ann.evaluate(TEXT), before);
    await press(ann, 'Escape');
    await ann.waitFor(`!(${SHOWN})`);
    assert.deepEqual(await ann.evaluate(INERT), [false, false, false, false, false]);
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
    // the rows of a fold are built when it is opened
    assert.deepEqual(list.map((x) => x.who ?? x.fold ?? x.day ?? x.folded), ['Today', ['Ann'], 'Show 1 more', []]);
    assert.equal(list[3].hidden, true);
    await press$(ann, PANE, 'Show 1 more');
    await ann.waitFor(`${LIST}[3].hidden === false`);
    assert.equal(await ann.evaluate(`${LIST}[2].fold`), 'Hide 1 more');
    assert.equal(await ann.evaluate(`${LIST}[3].folded.length`), 1);
  });

  await t.test('a version is named in the bar of its preview, and Only show named versions lists it alone', async () => {
    await tapOrClick(ann, `[...document.querySelectorAll('${PANE} .versions .row.version')][1]`);
    await press$(ann, BAR, 'Name this version');
    await nameIt(ann, 'Draft for Ben');
    await ann.waitFor(`${LIST}[2]?.title === 'Draft for Ben'`);
    const list = await ann.evaluate(LIST);
    // a named version does not fold
    assert.deepEqual(list.map((x) => x.title ?? x.day ?? x.fold), ['Today', list[1].title, 'Draft for Ben']);
    assert.equal(list[1].title, await timeIn(ann, (await versionsOf(ann))[0].time));
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
    await ann.waitFor(`document.querySelector('${PANE} .row[aria-current="true"]')?.dataset.id === 'version:${id}'`);
    await tapOrClick(ann, `document.querySelector('${BAR} button.more')`);
    await tapOrClick(ann, `[...document.querySelectorAll('.beeson-edit-menu .item')].find((b) => b.textContent === 'Download This Version')`);
    await ann.waitFor('typeof window.__downloaded === "string"');
    const served = await raw(server.edit.port, 'GET', `${server.edit.base}index.html?version=${id}`);
    assert.equal(await ann.evaluate('window.__downloaded'), served.text);
    assert.equal(served.text, TALK.replace('<p>Second slide</p>', '<p>Second slide by Ben</p>'));
  });

  await t.test('the guest opens the pane from the menu of the save state and sees the same list', async () => {
    await front(ben);
    await tapOrClick(ben, `document.querySelector('.beeson-session-state')`);
    await tapOrClick(ben, `[...document.querySelectorAll('.beeson-edit-menu .item')].find((b) => b.textContent === 'Version History')`);
    await ben.waitFor(SHOWN);
    await ben.waitFor(`${LIST}.length === 3`);
    assert.deepEqual((await ben.evaluate(LIST)).map((x) => x.title ?? x.day ?? x.fold), (await ann.evaluate(LIST)).map((x) => x.title ?? x.day ?? x.fold));
    await press$(ben, PANE, 'Back to editor');
    await ben.waitFor(`!(${SHOWN})`);
  });

  await t.test('the focus goes back to the control that opened the mode, also to the button of the save state', async () => {
    await front(ben);
    await ben.evaluate(`(window.__before = [...document.querySelectorAll('.beeson-edit-top button')].find((b) => b.getClientRects().length)).focus(), true`);
    await press(ben, HISTORY_KEY);
    await ben.waitFor(SHOWN);
    await press$(ben, PANE, 'Back to editor');
    await ben.waitFor(`!(${SHOWN})`);
    assert.equal(await ben.evaluate('document.activeElement === window.__before'), true);
    // an item of the menu run by the keyboard, i.e. a click on the focused item
    await ben.evaluate(`(() => { const b = document.querySelector('.beeson-session-state'); b.focus(); b.click(); return true; })()`);
    const item = `[...document.querySelectorAll('.beeson-edit-menu .item')].find((b) => b.textContent === 'Version History')`;
    await ben.waitFor(`!!(${item})`);
    await ben.evaluate(`(() => { const b = ${item}; b.focus(); b.click(); return true; })()`);
    await ben.waitFor(SHOWN);
    await press(ben, 'Escape');
    await ben.waitFor(`!(${SHOWN})`);
    assert.equal(await ben.evaluate(`document.activeElement === document.querySelector('.beeson-session-state')`), true);
  });
  clean(ann);
  clean(ben);
});

test('the preview outlines each changed element in the tone of its author, and a button per slide shows its slide', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [ann, ben]);
  await show(ann, 'One');
  await caretAtEnd(ann, el(0, 'h2'));
  await typeKeys(ann, ' by Ann');
  await show(ben, 'Two');
  await caretAtEnd(ben, el(1, 'li'));
  await typeKeys(ben, ' by Ben');
  await converge(server, [ann, ben]);
  await openPane(ann);
  await press$(ann, PANE, 'Name this version');
  await nameIt(ann, 'Both');
  await ann.waitFor(`${LIST}[1]?.title === 'Both'`);
  assert.deepEqual((await ann.evaluate(LIST))[1].who, ['Ann', 'Ben']);
  await tapOrClick(ann, `document.querySelector('${PANE} .versions .row.version')`);
  const doc = `${FRAME}.contentDocument`;
  await ann.waitFor(`${doc}?.querySelectorAll('[data-beeson-changed]').length === 2`, 30_000);

  await t.test('the bar shows the date, the authors, and a button per changed slide', async () => {
    const bar = await ann.evaluate(`(() => {
      const b = document.querySelector('${BAR}');
      return { date: b.querySelector('.date').textContent, who: [...b.querySelectorAll('.author')].map((a) => a.textContent), slides: [...b.querySelectorAll('button.slide')].map((x) => x.textContent), buttons: [...b.querySelectorAll('.actions button')].map((x) => x.textContent), changes: b.querySelector('label.changes').textContent };
    })()`);
    assert.equal(bar.date, `Both, Today, ${await timeIn(ann, (await versionsOf(ann))[0].time)}`);
    assert.deepEqual([bar.who, bar.slides, bar.buttons, bar.changes], [['Ann', 'Ben'], ['Slide 1', 'Slide 2'], ['Restore this version', 'Name this version', '⋯'], 'Show changes']);
  });

  await t.test('the changed heading and list are outlined in the tones of Ann and Ben', async () => {
    const outlines = await ann.evaluate(`[...${doc}.querySelectorAll('[data-beeson-changed]')].map((e) => ({ tag: e.localName, text: e.textContent.trim().split(/\\s+/).join(' '), color: e.ownerDocument.defaultView.getComputedStyle(e).outlineColor, style: e.ownerDocument.defaultView.getComputedStyle(e).outlineStyle }))`);
    const tones = [await ann.evaluate(toneIn(doc, await ann.evaluate(`${C}.color`))), await ann.evaluate(toneIn(doc, await ben.evaluate(`${C}.color`)))];
    assert.notEqual(tones[0], tones[1]);
    assert.deepEqual(outlines, [
      { tag: 'h2', text: 'One by Ann', color: tones[0], style: 'solid' },
      { tag: 'ul', text: 'Alpha by Ben Beta', color: tones[1], style: 'solid' },
    ]);
  });

  await t.test('the preview opens at the first changed slide, and Slide 2 shows the second slide', async () => {
    const current = `${FRAME}?.contentWindow?.Reveal?.getCurrentSlide?.()?.querySelector('h2')?.textContent`;
    await ann.waitFor(`${current} === 'One by Ann'`);
    await press$(ann, BAR, 'Slide 2');
    await ann.waitFor(`${current} === 'Two'`);
  });

  await t.test('Show changes off takes the outlines off', async () => {
    await tapOrClick(ann, `document.querySelector('${BAR} label.changes input')`);
    await ann.waitFor(`${FRAME}.contentWindow.getComputedStyle(${doc}.querySelector('[data-beeson-changed]')).outlineStyle === 'none'`);
    await tapOrClick(ann, `document.querySelector('${BAR} label.changes input')`);
    await ann.waitFor(`${FRAME}.contentWindow.getComputedStyle(${doc}.querySelector('[data-beeson-changed]')).outlineStyle === 'solid'`);
  });

  await t.test('a slide removed in index.html outside the editor is named in the bar and in the list', async () => {
    writeFileSync(server.file, server.read().replace(/\n<section>\n {2}<h2>Two<\/h2>[\s\S]*?<\/section>\n/, '\n'));
    await ann.waitFor(`!${TEXT}.includes('<h2>Two</h2>')`, 20_000);
    await press$(ann, PANE, 'Name this version');
    await nameIt(ann, 'Cut');
    await ann.waitFor(`${LIST}[1]?.title === 'Cut'`);
    assert.deepEqual((await ann.evaluate(LIST))[1].who, ['Changed in index.html outside the editor']);
    await tapOrClick(ann, `document.querySelector('${PANE} .versions .row.version')`);
    await ann.waitFor(`document.querySelector('${BAR} .removed')?.textContent === 'Slide 2 removed'`);
    assert.equal(await ann.evaluate(`document.querySelectorAll('${BAR} button.slide').length`), 0);
  });
  clean(ann);
  clean(ben);
});

test('Restore turns the deck of both pages and index.html back, keeps a text typed meanwhile, and tells the other page', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  // Ben writes times with 24 hours
  await ben.send('Emulation.setLocaleOverride', { locale: 'en-GB' });
  assert.doesNotMatch(await timeIn(ben, Date.now()), /M$/);
  await converge(server, [ann, ben]);
  await openPane(ann);
  await press$(ann, PANE, 'Name this version');
  await nameIt(ann, 'Start');
  await ann.waitFor(`${LIST}[1]?.title === 'Start'`);
  await show(ben, 'Two');
  await caretAtEnd(ben, el(1, 'li'));
  await typeKeys(ben, ' gone');
  await converge(server, [ann, ben]);
  await front(ann);
  await press$(ann, PANE, 'Name this version');
  await nameIt(ann, 'Later');
  await ann.waitFor(`${LIST}[1]?.title === 'Later'`);
  const start = await ann.evaluate(`document.querySelectorAll('${PANE} .versions .row.version')[1].querySelector('.sub').textContent`);
  assert.equal(start, await timeIn(ann, (await versionsOf(ann)).find((v) => v.name === 'Start').time));

  await t.test('a failure shows its error', async () => {
    await ann.evaluate(`(() => {
      const fetched = window.fetch;
      window.fetch = function (input, init) {
        if (String(input).includes('/restore') && window.__fail) return Promise.resolve(new Response(JSON.stringify({ error: 'the disk is full' }), { status: 500 }));
        return fetched.call(this, input, init);
      };
      window.__fail = true;
      return true;
    })()`);
    await tapOrClick(ann, `document.querySelectorAll('${PANE} .versions .row.version')[1]`);
    await press$(ann, BAR, 'Restore this version');
    await ann.waitFor(`document.querySelector('dialog.beeson-session-history-dialog[open] h3')?.textContent === 'Restore this version?'`);
    assert.equal(await ann.evaluate(`document.querySelector('dialog.beeson-session-history-dialog[open] p').textContent`), `The deck goes back to how it was at ${start}. The current version is kept in the history.`);
    await press$(ann, 'dialog.beeson-session-history-dialog[open]', 'Restore');
    await ann.waitFor(`document.querySelector('dialog.beeson-session-history-dialog[open] h3')?.textContent === 'The version could not be restored'`);
    assert.equal(await ann.evaluate(`document.querySelector('dialog.beeson-session-history-dialog[open] p').textContent`), 'the disk is full');
    await press$(ann, 'dialog.beeson-session-history-dialog[open]', 'OK');
    await ann.evaluate('window.__fail = false, true');
    assert.equal(await ann.evaluate(SHOWN), true);
  });

  await t.test('a restore reaches both pages and index.html, with the text that Ben typed meanwhile on top', async () => {
    await recordToasts(ben);
    // the operation of Ben is held until the restore is entered, hence it is of the version before
    await ben.evaluate(`(() => {
      const fetched = window.fetch;
      window.__held = new Promise((done) => (window.__release = done));
      window.fetch = function (input, init) {
        if (String(input).includes('/.session/op') && window.__held) return window.__held.then(() => fetched.call(this, input, init));
        return fetched.call(this, input, init);
      };
      return true;
    })()`);
    await show(ben, 'One');
    await caretAtEnd(ben, el(0, 'p'));
    await typeKeys(ben, ' meanwhile');
    await ben.waitFor(`${TEXT}.includes('First slide meanwhile')`);
    await front(ann);
    // the applies of Ann wait, hence the mode ends only once the restore is in the deck
    await ann.evaluate(`(() => {
      const port = ${C}.port;
      const apply = port.apply.bind(port);
      window.__gate = new Promise((done) => (window.__open = done));
      port.apply = (text) => window.__gate.then(() => apply(text));
      const fetched = window.fetch;
      window.fetch = function (input, init) {
        const answer = fetched.call(this, input, init);
        if (String(input).includes('/restore')) answer.then(() => (window.__posted = true));
        return answer;
      };
      return true;
    })()`);
    await press$(ann, BAR, 'Restore this version');
    await press$(ann, 'dialog.beeson-session-history-dialog[open]', 'Restore');
    await ann.waitFor('window.__posted === true');
    assert.equal(await ann.evaluate(SHOWN), true);
    await ann.evaluate('window.__open(), true');
    await ann.waitFor(`!(${SHOWN})`, 20_000);
    assert.equal(await ann.evaluate(`${TEXT}.includes('Alpha gone')`), false);
    assert.equal(await ann.evaluate(`!!document.querySelector('.beeson-session-preview:not([hidden])')`), false);
    await ben.evaluate('window.__release(), window.__held = null, true');
    const text = await converge(server, [ann, ben]);
    assert.equal(text, TALK.replace('<p>First slide</p>', '<p>First slide meanwhile</p>'));
  });

  await t.test('the other page gets a toast, and the restore is a version on top', async () => {
    await ben.waitFor(`window.__toasts.length > 0`);
    const time = (await versionsOf(ben)).find((v) => v.name === 'Start').time;
    assert.deepEqual(await ben.evaluate('window.__toasts'), [`Ann restored the version of ${await timeIn(ben, time)}|status`]);
    assert.equal(await ann.evaluate(`document.querySelector('.beeson-session-toast')?.textContent ?? ''`), '');
    await openPane(ann);
    await ann.waitFor(`document.querySelector('${PANE} .versions .row.version .sub')?.textContent === 'Restored the version of ${start}'`);
  });
  clean(ann, [/status of 500/]);
  clean(ben);
});

// the waits are 60 s for the edit command to start, 15 s each for the page, the shape, the pane, and
// the end of the mode, and 20 s for each of two converges
test('a letter typed in Version History is not written into the shape that was selected before the mode, nor into index.html', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const shape = `document.querySelector('.reveal .slides > section .shape')`;
  await ann.evaluate(`window.BeesonEditor.exec('insert.shape.rectangle', { box: { left: 200, top: 600, width: 400, height: 200 } }).then(() => true)`);
  await ann.waitFor(`!!${shape}`);
  await ann.evaluate(`${C}.app.selection.set('elements', []), true`);
  await click(ann, await ann.evaluate(`(() => { const r = ${shape}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
  await ann.waitFor(`${C}.app.selection.only() === ${shape}`);
  await converge(server, [ann]);
  const before = await ann.evaluate(TEXT);
  const file = server.read();
  await press(ann, HISTORY_KEY);
  await ann.waitFor(`!!document.querySelector('${PANE}:not([hidden])') && document.documentElement.classList.contains('beeson-history')`);
  await typeKeys(ann, 'z');
  await press(ann, 'Escape');
  await ann.waitFor(`!document.querySelector('${PANE}:not([hidden])')`);
  await converge(server, [ann]);
  assert.deepEqual({ deck: (await ann.evaluate(TEXT)) === before, file: server.read() === file }, { deck: true, file: true });
  clean(ann);
});

test('the mode ends at the time limit of a restore whose operation does not reach the deck', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  // the time limit of a restore is a second rather than 5
  const ann = await open(browser, `${sessionUrl(server.edit)}&session-restore-wait=1000`, { name: 'Ann' });
  await converge(server, [ann]);
  await ann.evaluate(`${C}.transport.post('history/current/name', { token: ${C}.token, name: 'Start' }).then(() => true)`);
  await show(ann, 'One');
  await caretAtEnd(ann, el(0, 'p'));
  await typeKeys(ann, ' later');
  await converge(server, [ann]);
  await openPane(ann);
  await tapOrClick(ann, `[...document.querySelectorAll('${PANE} .row.version')].find((r) => r.querySelector('.title').textContent === 'Start')`);
  // the applies of Ann wait until the end of the test
  await ann.evaluate(`(() => {
    const port = ${C}.port;
    const apply = port.apply.bind(port);
    window.__gate = new Promise((done) => (window.__open = done));
    port.apply = (text) => window.__gate.then(() => apply(text));
    return true;
  })()`);
  await press$(ann, BAR, 'Restore this version');
  await press$(ann, 'dialog.beeson-session-history-dialog[open]', 'Restore');
  await ann.waitFor(`!(${SHOWN})`);
  assert.equal(await ann.evaluate(`${TEXT}.includes('First slide later')`), true);
  await ann.evaluate('window.__open(), true');
  assert.equal(await converge(server, [ann]), TALK);
  clean(ann);
});

test('the pane of a page offline reads the versions once the page is online again', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const { port } = server.edit;
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await converge(server, [ann]);
  await openPane(ann);
  await press$(ann, PANE, 'Name this version');
  await nameIt(ann, 'Kept');
  await ann.waitFor(`${LIST}[1]?.title === 'Kept'`);
  await press(ann, 'Escape');
  await ann.waitFor(`!(${SHOWN})`);
  server.edit.child.kill('SIGKILL');
  await server.edit.exited;
  await ann.waitFor(`${C}.connection === 'offline'`);
  await openPane(ann);
  // the list read before is kept under the note
  await ann.waitFor(`${LIST}[0]?.empty === 'The versions cannot be read while the page is offline.'`);
  assert.equal(await ann.evaluate(`${LIST}[2].title`), 'Kept');
  // a name cannot be given offline, and the dialog says so
  await press$(ann, PANE, 'Name this version');
  // the request is refused at once, hence the dialog of the failure may open before a wait sees
  // the first dialog closed
  await typeName(ann, 'Lost');
  await ann.waitFor(`document.querySelector('dialog.beeson-session-history-dialog[open] h3')?.textContent === 'The version could not be named'`);
  await press$(ann, 'dialog.beeson-session-history-dialog[open]', 'OK');
  await server.start(['--port', String(port)]);
  await tapOrClick(ann, `document.querySelector('.beeson-session-state')`);
  await tapOrClick(ann, `[...document.querySelectorAll('.beeson-edit-menu .item')].find((b) => b.textContent === 'Try Now')`);
  await ann.waitFor(ONLINE, 20_000);
  await ann.waitFor(`${LIST}[0]?.day === 'Today'`, 20_000);
  assert.equal(await ann.evaluate(`${LIST}[1].title`), 'Kept');
  assert.equal(await ann.evaluate(SHOWN), true);
  // the first requests after the restart carry the token of the edit command before, and are answered 404
  clean(ann, [/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|ERR_SOCKET_NOT_CONNECTED/, /status of 404 .*\/\.session\/(events|history)\?/]);
});

test('on a phone of 390 px the slide of the canvas is above the sheet, and the pane, the bar, and every button take a tap of 32 px', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann', width: 390, height: 844, mobile: true });
  await converge(server, [ann]);
  await show(ann, 'One');
  await caretAtEnd(ann, el(0, 'h2'));
  await type(ann, ' on a phone');
  await converge(server, [ann]);
  await tapOrClick(ann, `document.querySelector('.beeson-session-state')`);
  await tapOrClick(ann, `[...document.querySelectorAll('.beeson-edit-menu .item')].find((b) => b.textContent === 'Version History')`);
  await ann.waitFor(SHOWN);
  // the slide is fitted to the room between the toolbar and the sheet
  const room = `(() => {
    const slide = document.querySelector('.reveal:not(.beeson-peek)').getBoundingClientRect();
    const canvas = document.querySelector('.beeson-edit-canvas').getBoundingClientRect();
    const sheet = document.querySelector('${PANE}').getBoundingClientRect();
    return { below: slide.top >= canvas.top - 0.5, above: slide.bottom <= sheet.top + 0.5, shown: slide.height >= 100 };
  })()`;
  await ann.waitFor(`Object.values(${room}).every(Boolean)`).catch(() => {});
  assert.deepEqual(await ann.evaluate(room), { below: true, above: true, shown: true });
  await press$(ann, PANE, 'Name this version');
  await nameIt(ann, 'Phone');
  await ann.waitFor(`${LIST}[1]?.title === 'Phone'`);
  await tapOrClick(ann, `document.querySelector('${PANE} .versions .row.version')`);
  await ann.waitFor(`${FRAME}?.contentDocument?.readyState === 'complete'`, 30_000);
  const boxes = await ann.evaluate(`[...document.querySelectorAll('${PANE} :is(button, label), ${BAR} :is(button, label)')].filter((b) => b.getClientRects().length).map((b) => {
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { text: b.textContent, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, hit: b.contains(hit), tall: r.height >= 32, wide: r.width >= 32 };
  })`);
  // the sheet shows the chosen version alone, with Versions and Back to editor
  assert.ok(boxes.length >= 7, `${boxes.length} controls`);
  for (const b of boxes) assert.deepEqual(b, { text: b.text, inside: true, hit: true, tall: true, wide: true });
  const layout = await ann.evaluate(`(() => {
    const pane = document.querySelector('${PANE}').getBoundingClientRect();
    const preview = document.querySelector('.beeson-session-preview').getBoundingClientRect();
    const info = document.querySelector('${BAR} .info').getBoundingClientRect();
    const actions = document.querySelector('${BAR} .actions').getBoundingClientRect();
    return { sheet: pane.left === 0 && pane.right === innerWidth && pane.top > innerHeight / 3, above: preview.bottom <= pane.top + 0.5, two: actions.top >= info.bottom };
  })()`);
  assert.deepEqual(layout, { sheet: true, above: true, two: true });
  await press$(ann, BAR, 'Restore this version');
  await ann.waitFor(`!!document.querySelector('dialog.beeson-session-history-dialog[open]')`);
  const dialog = await ann.evaluate(`[...document.querySelectorAll('dialog.beeson-session-history-dialog[open] button')].map((b) => b.getBoundingClientRect().height >= 32)`);
  assert.deepEqual(dialog, [true, true]);
  await press$(ann, 'dialog.beeson-session-history-dialog[open]', 'Cancel');
  await press$(ann, PANE, 'Back to editor');
  await ann.waitFor(`!(${SHOWN})`);
  clean(ann);
});

test('on a phone with the notes open, the slide of the canvas and the preview of a version are drawn above the sheet', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann', width: 390, height: 844, mobile: true });
  await converge(server, [ann]);
  await tapOrClick(ann, `[...document.querySelectorAll('.beeson-edit-bottom button')].find((b) => b.textContent === 'Notes')`);
  await ann.waitFor(`document.documentElement.classList.contains('beeson-notes')`);
  await tapOrClick(ann, `document.querySelector('.beeson-session-state')`);
  await tapOrClick(ann, `[...document.querySelectorAll('.beeson-edit-menu .item')].find((b) => b.textContent === 'Version History')`);
  await ann.waitFor(SHOWN);
  // the notes are below the sheet, hence the slide has the room between the toolbar and the sheet
  const room = `(() => {
    const slide = document.querySelector('.reveal:not(.beeson-peek)').getBoundingClientRect();
    const sheet = document.querySelector('${PANE}').getBoundingClientRect();
    return { above: slide.bottom <= sheet.top + 0.5, shown: slide.height >= 100 };
  })()`;
  await ann.waitFor(`Object.values(${room}).every(Boolean)`).catch(() => {});
  assert.deepEqual(await ann.evaluate(room), { above: true, shown: true });
  // a version previewed with the whole list shown again
  await tapOrClick(ann, `document.querySelector('${PANE} .versions .row.version')`);
  await ann.waitFor(`${FRAME}?.contentDocument?.readyState === 'complete'`, 30_000);
  await press$(ann, PANE, 'Versions');
  const frame = `(() => {
    const frame = ${FRAME}.getBoundingClientRect();
    const sheet = document.querySelector('${PANE}').getBoundingClientRect();
    return { above: frame.bottom <= sheet.top + 0.5, shown: frame.height >= 100 };
  })()`;
  await ann.waitFor(`Object.values(${frame}).every(Boolean)`).catch(() => {});
  assert.deepEqual(await ann.evaluate(frame), { above: true, shown: true });
  await press$(ann, PANE, 'Back to editor');
  await ann.waitFor(`!(${SHOWN})`);
  clean(ann);
});

const AFTER = TALK.indexOf('First slide') + 'First slide'.length;

// a history written by hand: versions are { time, name?, id?, start? }, oldest first, each of which
// adds an x after First slide, apart from the start of the history, which holds the deck of the base
// without authors. text is the deck at the newest of them
function craft(versions) {
  const lines = [JSON.stringify({ kind: 'base', time: versions[0].time - MIN, text: TALK })];
  let added = 0;
  versions.forEach((v, i) => {
    const id = v.id ?? `v${i}`;
    if (v.start) lines.push(JSON.stringify({ kind: 'version', id, time: v.time, authors: [], slides: [], patches: [], marks: [], start: true }));
    else {
      added++;
      lines.push(JSON.stringify({ kind: 'version', id, time: v.time, authors: ['pa'], slides: [1], patches: [{ start: AFTER, end: AFTER, text: 'x' }], marks: [{ start: AFTER, end: AFTER + 1, author: 'pa' }] }));
    }
    if (v.name) lines.push(JSON.stringify({ kind: 'name', id, name: v.name }));
  });
  return { jsonl: `${lines.join('\n')}\n`, text: TALK.slice(0, AFTER) + 'x'.repeat(added) + TALK.slice(AFTER) };
}

// the edit command on a talk folder whose .session/history.jsonl is written before it starts
async function crafted(t, { jsonl, text }, env = {}) {
  const folder = talkFolder(t, text);
  for (const dir of ['theme', 'brand']) cpSync(resolve(dir), join(folder.talk, dir), { recursive: true });
  mkdirSync(join(folder.talk, '.session'));
  writeFileSync(join(folder.talk, '.session', 'history.jsonl'), jsonl);
  const file = join(folder.talk, 'index.html');
  const server = { ...folder, file, read: () => readFileSync(file, 'utf8') };
  server.edit = await startEdit(folder.talk, { env: { XDG_CONFIG_HOME: folder.config, APPDATA: folder.config, ...env } });
  t.after(async () => {
    await stopEdit(server.edit);
    rmSync(folder.root, { recursive: true, force: true });
  });
  return server;
}

// the requests of the page whose address includes part, counted in window.__count[part]
const countRequests = (page, part) => page.evaluate(`(() => {
  window.__count ??= {};
  window.__count[${JSON.stringify(part)}] = 0;
  const fetched = window.fetch;
  window.fetch = function (input, init) {
    if (String(input).includes(${JSON.stringify(part)})) window.__count[${JSON.stringify(part)}]++;
    return fetched.call(this, input, init);
  };
  return true;
})()`);

test('Name this version shows the name that a save replaces, an empty name under Current version does nothing, and a name is counted in characters', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [ann, ben]);
  await openPane(ben);
  await press$(ben, PANE, 'Name this version');
  await nameIt(ben, 'Draft for Ben');
  await ben.waitFor(`${LIST}[1]?.title === 'Draft for Ben'`);
  await press(ben, 'Escape');
  await openPane(ann);
  await ann.waitFor(`${LIST}[1]?.title === 'Draft for Ben'`);
  await countRequests(ann, '/name');
  const field = `(() => { const i = ${FIELD}; return i && { value: i.value, start: i.selectionStart, end: i.selectionEnd, focused: i === document.activeElement }; })()`;
  const save = `document.querySelector('${DIALOG} .row button.primary')`;

  await t.test('under Current version the field holds the name of the newest version, selected, while no edit was made since', async () => {
    await press$(ann, PANE, 'Name this version');
    await ann.waitFor(`${field}?.focused`);
    assert.deepEqual(await ann.evaluate(field), { value: 'Draft for Ben', start: 0, end: 13, focused: true });
    await press(ann, 'Backspace');
    await press(ann, 'Enter');
    await ann.waitFor(`!document.querySelector('${DIALOG}')`);
    assert.equal(await ann.evaluate(`window.__count['/name']`), 0);
    assert.equal((await versionsOf(ann))[0].name, 'Draft for Ben');
  });

  await t.test('Esc in Name this version closes the dialog and leaves Version History open', async () => {
    await press$(ann, PANE, 'Name this version');
    await ann.waitFor(`${field}?.focused`);
    await press(ann, 'Escape');
    await ann.waitFor(`!document.querySelector('${DIALOG}') || !(${SHOWN})`);
    assert.deepEqual(await ann.evaluate(`[!!document.querySelector('${DIALOG}'), ${SHOWN}]`), [false, true]);
  });

  await t.test('after an edit the field under Current version is empty', async () => {
    await show(ben, 'One');
    await caretAtEnd(ben, el(0, 'h2'));
    await typeKeys(ben, ' more');
    await converge(server, [ann, ben]);
    await front(ann);
    await press$(ann, PANE, 'Name this version');
    await ann.waitFor(`${field}?.focused`);
    assert.equal(await ann.evaluate(`${FIELD}.value`), '');
    await press(ann, 'Enter');
    await ann.waitFor(`!document.querySelector('${DIALOG}')`);
    assert.equal(await ann.evaluate(`window.__count['/name']`), 0);
  });

  await t.test('the name of a version is taken off by Remove name, which an empty field shows', async () => {
    await tapOrClick(ann, `document.querySelector('${PANE} .versions .row.version')`);
    await press$(ann, BAR, 'Name this version');
    await ann.waitFor(`${field}?.focused`);
    assert.equal(await ann.evaluate(`${FIELD}.value`), 'Draft for Ben');
    assert.equal(await ann.evaluate(`${save}.textContent`), 'Save');
    await ann.evaluate(`${FIELD}.select(), true`);
    await press(ann, 'Backspace');
    await ann.waitFor(`${save}.textContent === 'Remove name'`);
    await press(ann, 'Enter');
    await ann.waitFor(`!document.querySelector('${DIALOG}')`);
    await ann.waitFor(`${LIST}[1]?.title !== 'Draft for Ben'`);
    assert.equal((await versionsOf(ann)).at(-1).name, undefined);
  });

  await t.test('Save of a version without a name is off while the field is empty or holds more than 80 characters', async () => {
    await press$(ann, BAR, 'Name this version');
    await ann.waitFor(`${field}?.focused`);
    assert.equal(await ann.evaluate(`${FIELD}.value`), '');
    assert.equal(await ann.evaluate(`${save}.disabled`), true);
    await type(ann, 'a'.repeat(85));
    assert.equal(await ann.evaluate(`${FIELD}.value.length`), 85);
    assert.equal(await ann.evaluate(`${save}.disabled`), true);
    assert.equal(await ann.evaluate(`document.querySelector('${DIALOG} .count')?.textContent`), '85 of at most 80 characters');
    // 80 characters outside the basic plane are 160 code units, and fit
    await ann.evaluate(`${FIELD}.select(), true`);
    await type(ann, '😀'.repeat(80));
    assert.equal(await ann.evaluate(`Array.from(${FIELD}.value).length`), 80);
    assert.equal(await ann.evaluate(`${save}.disabled`), false);
    await press(ann, 'Enter');
    await ann.waitFor(`!document.querySelector('${DIALOG}')`);
    await ann.waitFor(`(${LIST}).some((x) => x.title === ${JSON.stringify('😀'.repeat(80))})`);
  });
  clean(ann);
  clean(ben);
});

test('a fold stays open, and the focus stays on its control, while new versions arrive', { timeout: 300_000 }, async (t) => {
  const now = Date.now();
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  // two unnamed versions a second apart, on the day of the new versions
  const first = Math.max(now - 3 * MIN, midnight + 1000);
  const server = await crafted(t, craft([{ time: first }, { time: first + 1000 }]), QUICK);
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await converge(server, [ann]);
  await openPane(ann);
  await ann.waitFor(`${LIST}.length === 4`);
  // Bo writes over HTTP, since reveal.js moves the focus to body when the tab of Ann is shown again
  const { port, base } = server.edit;
  const bo = (await post(port, `${base}.session/hello`, { name: 'Bo' })).json();
  const at = bo.text.indexOf('Second slide') + 'Second slide'.length;
  let v = bo.v;
  let count = 2;
  // Bo inserts word, and Ann waits for the version of Bo in the fold
  async function version(word) {
    count++;
    const answer = (await post(port, `${base}.session/op`, { token: bo.token, seq: count - 2, base: v, patches: [{ start: at, end: at, text: word }] })).json();
    assert.equal(answer.ok, true);
    v = answer.v;
    await ann.waitFor(`(${LIST}).find((x) => x.fold)?.fold.endsWith('${count - 1} more')`, 20_000);
  }

  await t.test('an open fold stays open when a newer version joins it', async () => {
    await press$(ann, PANE, 'Show 1 more');
    await ann.waitFor(`${LIST}[3]?.hidden === false`);
    await version(' a');
    const fold = await ann.evaluate(`(() => { const f = document.querySelector('${PANE} .fold'); return { text: f.textContent, expanded: f.getAttribute('aria-expanded'), hidden: f.nextElementSibling.hidden }; })()`);
    assert.deepEqual(fold, { text: 'Hide 2 more', expanded: 'true', hidden: false });
  });

  await t.test('the focus stays on the fold button and on Name this version', async () => {
    await ann.evaluate(`document.querySelector('${PANE} .fold').focus(), true`);
    await version(' b');
    assert.equal(await ann.evaluate(`document.activeElement === document.querySelector('${PANE} .fold')`), true);
    await ann.evaluate(`document.querySelector('${PANE} .name-current').focus(), true`);
    await version(' c');
    assert.equal(await ann.evaluate(`document.activeElement === document.querySelector('${PANE} .name-current')`), true);
  });

  await t.test('the focus stays on Restore this version, and an open More menu stays open', async () => {
    await tapOrClick(ann, `document.querySelectorAll('${PANE} .versions .row.version')[1]`);
    await ann.waitFor(`!!(${button(BAR, 'Restore this version')})`);
    await ann.evaluate(`(${button(BAR, 'Restore this version')}).focus(), true`);
    await version(' d');
    assert.equal(await ann.evaluate(`document.activeElement === (${button(BAR, 'Restore this version')})`), true);
    await tapOrClick(ann, `document.querySelector('${BAR} button.more')`);
    await ann.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
    await ann.evaluate(`window.__more = document.querySelector('${BAR} button.more'), true`);
    await version(' e');
    assert.deepEqual(await ann.evaluate(`[window.__more.isConnected, window.__more.getAttribute('aria-expanded'), !!document.querySelector('.beeson-edit-menu')]`), [true, 'true', true]);
    await press(ann, 'Escape');
    await ann.waitFor(`!document.querySelector('.beeson-edit-menu') && document.activeElement === window.__more`);
  });
  clean(ann);
});

test('the start of the history is a row of its own, which reads Start of the history in the place of the authors, as the bar of its preview does', { timeout: 180_000 }, async (t) => {
  const now = Date.now();
  const first = Math.max(now - 10 * MIN, new Date(now).setHours(0, 0, 0, 0) + 1000);
  const server = await crafted(t, craft([{ time: first, start: true }, { time: first + MIN }, { time: first + 2 * MIN }]), HELD);
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await converge(server, [ann]);
  // the start of the history is marked in the answer as well, for an edit command that does not
  // read start from its file
  await ann.evaluate(`(() => {
    const transport = ${C}.transport;
    const get = transport.get.bind(transport);
    transport.get = (path, query) => get(path, query).then((a) => {
      if (path === 'history') for (const v of a.versions) if (v.id === 'v0') v.start = true;
      return a;
    });
    return true;
  })()`);
  await openPane(ann);
  // the rows and the folds of the list, each row by its id and the text in the place of its authors
  const rows = `[...document.querySelectorAll('${PANE} .versions > :is(.row.version, .fold)')].map((el) => el.matches('.fold') ? el.textContent : [el.dataset.id.slice(8), el.querySelector(':scope > .who').textContent])`;
  await ann.waitFor(`${rows}.length === 3`);
  assert.deepEqual(await ann.evaluate(rows), [['v2', 'Someone'], 'Show 1 more', ['v0', 'Start of the history']]);
  await tapOrClick(ann, `document.querySelector('${PANE} [data-id="version:v0"]')`);
  await ann.waitFor(`!!${FRAME}?.contentDocument?.body?.textContent.includes('First slide')`, 30_000);
  assert.equal(await ann.evaluate(`${FRAME}.contentDocument.body.textContent.includes('First slidex')`), false);
  assert.equal(await ann.evaluate(`document.querySelector('${BAR} .who').textContent`), 'Start of the history');
  clean(ann);
});

test('a named version does not head a fold, unnamed versions fold within 30 minutes, and a fold does not cross midnight', { timeout: 180_000 }, async (t) => {
  // midnight at the start of yesterday, hence every version is in the past
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 1);
  const midnight = start.getTime();
  const hour = 60 * MIN;
  const server = await crafted(t, craft([
    { time: midnight - 10 * MIN },
    { time: midnight + 10 * MIN },
    { time: midnight + 3 * hour },
    { time: midnight + 3 * hour + 20 * MIN },
    { time: midnight + 5 * hour },
    { time: midnight + 5 * hour + 5 * MIN, name: 'Named' },
  ]), HELD);
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await converge(server, [ann]);
  await openPane(ann);
  // each row by its id, each fold by its text, and each day heading as day
  const rows = `[...document.querySelectorAll('${PANE} .versions > :is(.row.version, .fold, h3)')].filter((el) => !${UNNAMED_START('el')}).map((el) => el.matches('h3') ? 'day' : el.matches('.fold') ? el.textContent : el.dataset.id.slice(8))`;
  // the list is written at once, hence v1 is listed with all the others
  await ann.waitFor(`${rows}.includes('v1')`);
  assert.deepEqual(await ann.evaluate(rows), ['day', 'v5', 'v4', 'v3', 'Show 1 more', 'v1', 'day', 'v0']);
  clean(ann);
});

test('with many versions a new version writes only its own row, and the rows in view stay in place', { timeout: 300_000 }, async (t) => {
  const now = Date.now();
  // 150 versions 40 minutes apart, hence none of them folds
  const server = await crafted(t, craft(Array.from({ length: 150 }, (_, i) => ({ time: now - (150 - i) * 40 * MIN }))), QUICK);
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [ann, ben]);
  await openPane(ann);
  const ROWS = `document.querySelectorAll('${PANE} .versions .row.version')`;
  await ann.waitFor(`${ROWS}.length === 150`);
  // the id of the first row in view and its place under the top of the pane in px
  const view = `(() => {
    const top = document.querySelector('${PANE}').getBoundingClientRect().top;
    const row = [...${ROWS}].find((r) => r.getBoundingClientRect().bottom > top + 1);
    return { id: row.dataset.id, top: Math.round(row.getBoundingClientRect().top - top) };
  })()`;
  // the row of v70 scrolled to the top of the pane, and the ids of the rows written from now on
  // kept in window.__written
  await ann.evaluate(`(() => {
    const pane = document.querySelector('${PANE}');
    const row = document.querySelector('${PANE} [data-id="version:v70"]');
    pane.scrollTop += row.getBoundingClientRect().top - pane.getBoundingClientRect().top + 5;
    window.__written = new Set();
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) if (n.nodeType === 1) for (const row of [n, ...n.querySelectorAll('.row')]) if (row.matches('.row')) window.__written.add(row.dataset.id);
        const row = (r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest('.row');
        if (row) window.__written.add(row.dataset.id);
      }
    }).observe(document.querySelector('${PANE} .versions'), { childList: true, subtree: true, attributes: true, characterData: true });
    return true;
  })()`);
  const before = await ann.evaluate(view);
  assert.equal(before.id, 'version:v70');
  await show(ben, 'Two');
  await caretAtEnd(ben, el(1, 'p'));
  await typeKeys(ben, ' new');
  await front(ann);
  await ann.waitFor(`${ROWS}.length === 151`, 20_000);
  const written = await ann.evaluate('[...window.__written]');
  assert.ok(written.length <= 2, `rows written: ${written.length}`);
  // the place is held within 1 px, since the pane is scrolled by the height of the new row, which
  // need not be a whole number of px. on Ubuntu the row was drawn 1 px higher
  const after = await ann.evaluate(view);
  assert.equal(after.id, before.id);
  assert.ok(Math.abs(after.top - before.top) <= 1, `the first row in view moved from ${before.top} px to ${after.top} px`);
  clean(ann);
  clean(ben);
});

test('the rows of an open fold in view stay in place when a newer version joins the fold', { timeout: 300_000 }, async (t) => {
  const now = Date.now();
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  // 24 unnamed versions 100 ms apart, on the day of the new version, which fold under the newest
  const first = Math.max(now - 3 * MIN, midnight + 1000);
  const server = await crafted(t, craft(Array.from({ length: 24 }, (_, i) => ({ time: first + i * 100 }))), QUICK);
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await converge(server, [ann]);
  await openPane(ann);
  await press$(ann, PANE, 'Show 23 more');
  const FOLDED = `document.querySelectorAll('${PANE} .folded .row.version')`;
  await ann.waitFor(`${FOLDED}.length === 23`);
  // the first row of the fold in view, its place under the top of the pane in px, and whether the
  // top of the fold is above the top of the pane
  const view = `(() => {
    const top = document.querySelector('${PANE}').getBoundingClientRect().top;
    const row = [...${FOLDED}].find((r) => r.getBoundingClientRect().bottom > top + 1);
    return { id: row.dataset.id, top: Math.round(row.getBoundingClientRect().top - top), above: document.querySelector('${PANE} .folded').getBoundingClientRect().top < top };
  })()`;
  await ann.evaluate(`(() => { const pane = document.querySelector('${PANE}'); pane.scrollTop = pane.scrollHeight; return true; })()`);
  const before = await ann.evaluate(view);
  assert.equal(before.above, true, 'the pane is too short to scroll the top of the fold out of view');
  // Bo writes over HTTP, and the version of Bo becomes the head of the fold
  const { port, base } = server.edit;
  const bo = (await post(port, `${base}.session/hello`, { name: 'Bo' })).json();
  const at = bo.text.indexOf('Second slide') + 'Second slide'.length;
  const answer = (await post(port, `${base}.session/op`, { token: bo.token, seq: 1, base: bo.v, patches: [{ start: at, end: at, text: ' a' }] })).json();
  assert.equal(answer.ok, true);
  await ann.waitFor(`${FOLDED}.length === 24`, 20_000);
  const after = await ann.evaluate(view);
  assert.equal(after.id, before.id);
  assert.ok(Math.abs(after.top - before.top) <= 1, `the first row of the fold in view moved from ${before.top} px to ${after.top} px`);
  clean(ann);
});

test('a compaction that drops the version in the preview closes the preview, selects Current version, and says so', { timeout: 300_000 }, async (t) => {
  const now = Date.now();
  const versions = [{ time: now - 200 * MIN }, { time: now - 150 * MIN }, { time: now - 100 * MIN }];
  const built = craft(versions);
  const server = await crafted(t, built, { SLIDES_HISTORY: JSON.stringify({ quiet: 1000, maxBytes: built.jsonl.length + 100, keep: 0 }) });
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [ann, ben]);
  await openPane(ann);
  await ann.waitFor(`!!document.querySelector('${PANE} [data-id="version:v0"]')`);
  await recordToasts(ann);
  await tapOrClick(ann, `document.querySelector('${PANE} [data-id="version:v0"]')`);
  await ann.waitFor(`document.querySelector('${PANE} .row[aria-current="true"]')?.dataset.id === 'version:v0'`);
  await show(ben, 'Two');
  await caretAtEnd(ben, el(1, 'p'));
  await typeKeys(ben, ' compact');
  await front(ann);
  await ann.waitFor(`!document.querySelector('${PANE} [data-id="version:v0"]')`, 20_000);
  await ann.waitFor(`!document.querySelector('.beeson-session-preview:not([hidden])')`);
  assert.equal(await ann.evaluate(`document.querySelector('${PANE} .row.current').getAttribute('aria-current')`), 'true');
  assert.equal(await ann.evaluate(`document.querySelectorAll('${PANE} [aria-current="true"]').length`), 1);
  await ann.waitFor('window.__toasts.length > 0');
  const when = await ann.evaluate(`(() => {
    const t = new Date(${versions[0].time});
    const time = t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return t.toDateString() === new Date().toDateString() ? time : t.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) + ', ' + time;
  })()`);
  assert.deepEqual(await ann.evaluate('window.__toasts'), [`The version of ${when} was merged into a later one.|status`]);
  clean(ann);
  clean(ben);
});

test('the restore of a version of another year names its year, and the time of the version, in the dialog, the row, and the toast', { timeout: 300_000 }, async (t) => {
  const year = new Date().getFullYear() - 1;
  const old = new Date(year, 10, 3, 14, 41).getTime();
  const server = await crafted(t, craft([{ time: old, name: 'Submitted' }, { time: Date.now() - 60 * MIN }]), HELD);
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await ben.send('Emulation.setLocaleOverride', { locale: 'en-GB' });
  await converge(server, [ann, ben]);
  // the day with its year, and the time, of the version in the locale of a page
  const whenIn = (page) => page.evaluate(`[new Date(${old}).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }), new Date(${old}).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })]`);
  const [day, time] = await whenIn(ann);
  assert.ok(day.includes(String(year)), day);
  await recordToasts(ben);
  await openPane(ann);
  await ann.waitFor(`(${LIST}).some((x) => x.title === 'Submitted')`);
  await tapOrClick(ann, `[...document.querySelectorAll('${PANE} .versions .row.version')].find((r) => r.querySelector('.title').textContent === 'Submitted')`);
  await press$(ann, BAR, 'Restore this version');
  await ann.waitFor(`document.querySelector('${DIALOG} h3')?.textContent === 'Restore this version?'`);
  assert.equal(await ann.evaluate(`document.querySelector('${DIALOG} p').textContent`), `The deck goes back to how it was on ${day} at ${time}. The current version is kept in the history.`);
  await press$(ann, DIALOG, 'Restore');
  await ann.waitFor(`!(${SHOWN})`, 20_000);
  await ben.waitFor('window.__toasts.length > 0');
  assert.deepEqual(await ben.evaluate('window.__toasts'), [`Ann restored the version of ${(await whenIn(ben)).join(', ')}|status`]);
  await openPane(ann);
  await ann.waitFor(`document.querySelector('${PANE} .versions .row.version .sub')?.textContent === ${JSON.stringify(`Restored the version of ${day}, ${time}`)}`);
  clean(ann);
  clean(ben);
});

test('the day headings of an open pane move on at midnight', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await converge(server, [ann]);
  await openPane(ann);
  await press$(ann, PANE, 'Name this version');
  await nameIt(ann, 'Before midnight');
  await ann.waitFor(`${LIST}[1]?.title === 'Before midnight'`);
  await press(ann, 'Escape');
  await ann.waitFor(`!(${SHOWN})`);
  // the clock of the page set 3 s before the next midnight
  await ann.evaluate(`(() => {
    const Real = Date;
    const next = new Real();
    next.setHours(24, 0, 0, 0);
    const shift = next.getTime() - 3000 - Real.now();
    window.Date = class extends Real {
      constructor(...a) {
        if (a.length) super(...a);
        else super(Real.now() + shift);
      }
      static now() {
        return Real.now() + shift;
      }
    };
    return true;
  })()`);
  await openPane(ann);
  await ann.waitFor(`${LIST}[0]?.day === 'Today'`);
  await ann.waitFor(`${LIST}[0]?.day === 'Yesterday'`, 10_000);
  clean(ann);
});

test('an apply that needs a reload is held while the mode is on, which the row Current version says, and the page is loaded again when it ends', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await converge(server, [ann]);
  await openPane(ann);
  const current = `[...document.querySelector('${PANE} .row.current').children].map((c) => c.textContent)`;
  assert.deepEqual(await ann.evaluate(current), ['Current version']);
  await press$(ann, PANE, 'Name this version');
  await nameIt(ann, 'Seen');
  await ann.waitFor(`${LIST}[1]?.title === 'Seen'`);
  await tapOrClick(ann, `document.querySelector('${PANE} .versions .row.version')`);
  await ann.waitFor(`${FRAME}?.contentDocument?.readyState === 'complete'`, 30_000);
  // the document of the page is marked, since the preview counts its own loads in loads(ann)
  await ann.evaluate('window.__before = true');
  // Bo changes the script of the deck, which the port cannot apply in place
  const { port, base } = server.edit;
  const bo = (await post(port, `${base}.session/hello`, { name: 'Bo' })).json();
  const at = bo.text.indexOf('Beeson.start({});');
  const answer = (await post(port, `${base}.session/op`, { token: bo.token, seq: 1, base: bo.v, patches: [{ start: at, end: at + 17, text: 'Beeson.start({ });' }] })).json();
  assert.equal(answer.ok, true);
  await ann.waitFor(`document.querySelector('${PANE} .row.current .sub')?.textContent === 'The deck was changed. It is loaded again when Version History is closed.'`, 20_000);
  assert.deepEqual(await ann.evaluate(current), ['Current version', 'The deck was changed. It is loaded again when Version History is closed.']);
  assert.equal(await ann.evaluate('window.__before'), true);
  assert.equal(await ann.evaluate(`${SHOWN} && !!document.querySelector('.beeson-session-preview:not([hidden])')`), true);
  await press$(ann, PANE, 'Back to editor');
  await ann.waitFor(`window.__before === undefined && !!window.BeesonEditor`, 20_000);
  await ann.waitFor(ONLINE, 20_000);
  await ann.waitFor(`${TEXT}.includes('Beeson.start({ });')`);
  clean(ann);
});

test('a toast region is in the page before the first toast, and a toast during a modal dialog is shown when it closes', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [ann, ben]);
  assert.equal(await ann.evaluate(`document.querySelector('.beeson-session-toast[role="status"]')?.textContent`), '');
  await openPane(ann);
  await press$(ann, PANE, 'Name this version');
  await nameIt(ann, 'Start');
  await ann.waitFor(`${LIST}[1]?.title === 'Start'`);
  const id = await rowId(ann, 0);
  await show(ben, 'One');
  await caretAtEnd(ben, el(0, 'p'));
  await typeKeys(ben, ' later');
  await converge(server, [ann, ben]);
  await front(ann);
  // the texts of the toasts of Ann, each with whether a modal dialog was open when it was shown, and
  // the time of the restore
  await ann.evaluate(`(() => {
    window.__shown = [];
    new MutationObserver(() => {
      const text = document.querySelector('.beeson-session-toast')?.textContent ?? '';
      if (text && window.__shown.at(-1)?.text !== text) window.__shown.push({ text, modal: !!document.querySelector('dialog:modal') });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    ${C}.on('restored', () => (window.__restored = performance.now()));
    return true;
  })()`);
  await press$(ann, PANE, 'Name this version');
  await ann.waitFor(`${FIELD} === document.activeElement`);
  await ben.evaluate(`${C}.transport.post('history/${id}/restore', { token: ${C}.token }).then(() => true)`);
  await ann.waitFor('window.__restored > 0', 20_000);
  await ann.waitFor(`!${TEXT}.includes('First slide later')`, 20_000);
  assert.deepEqual(await ann.evaluate('window.__shown'), []);
  await press$(ann, DIALOG, 'Cancel');
  await ann.waitFor('window.__shown.length > 0');
  const [shown] = await ann.evaluate('window.__shown');
  assert.equal(shown.text, `Ben restored the version of ${await timeIn(ann, (await versionsOf(ann)).find((v) => v.name === 'Start').time)}`);
  assert.equal(shown.modal, false);
  clean(ann);
  clean(ben);
});

test('Keep theirs at a conflict sets the text of the page aside, which Show opens in Version History', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  // the first word of the first paragraph selected
  const first = (page) => page.evaluate(`(() => {
    const p = ${el(0, 'p')};
    p.focus();
    const r = document.createRange();
    r.setStart(p.firstChild, 0);
    r.setEnd(p.firstChild, 5);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    return true;
  })()`);
  // Ann replaces a word offline that Ben replaces meanwhile, and comes back after more than 5 s
  async function conflicted(t) {
    const server = await talk(t);
    const url = sessionUrl(server.edit);
    const ann = await tab(browser, url);
    const ben = await open(browser, url, { name: 'Ben' });
    await converge(server, [ann, ben]);
    await goOffline(ann);
    await show(ann, 'One');
    await first(ann);
    await type(ann, 'Opening');
    await show(ben, 'One');
    await first(ben);
    await type(ben, 'Initial');
    await until(() => server.read().includes('Initial slide'), 'the edit of Ben to reach the file');
    await ann.waitFor(`Date.now() - window.__offAt > 5500`, 15_000);
    await goOnline(ann);
    await front(ann);
    await ann.waitFor(`!!document.querySelector('dialog.beeson-session-conflicts[open]')`);
    return { server, ann, ben };
  }

  await t.test('the text is listed under Set aside, and Show opens its preview', async (t) => {
    const { server, ann, ben } = await conflicted(t);
    await recordToasts(ann);
    await ann.evaluate(HOLD);
    await pressConflict(ann, 'Keep theirs');
    await converge(server, [ann, ben]);
    await ann.waitFor('window.__toasts.length > 0', 20_000);
    assert.deepEqual(await ann.evaluate('window.__toasts'), ['Your version of these texts was not sent. It is kept under Set aside in Version History.|status']);
    await press$(ann, '.beeson-session-toast', 'Show');
    await ann.waitFor(SHOWN);
    await ann.waitFor(`document.querySelector('${PANE} .aside-list .row')?.getAttribute('aria-current') === 'true'`);
    await ann.waitFor(`!!${FRAME}.contentDocument?.body?.textContent.includes('Opening slide')`, 30_000);
    // the button of the toast is gone, hence the focus goes back to the button of the save state
    await press(ann, 'Escape');
    await ann.waitFor(`!(${SHOWN})`);
    assert.equal(await ann.evaluate(`document.activeElement === document.querySelector('.beeson-session-state')`), true);
    clean(ann);
    clean(ben);
    await ann.close();
    await ben.close();
  });

  await t.test('a text that cannot be set aside is offered as a download', async (t) => {
    const { server, ann, ben } = await conflicted(t);
    await ann.evaluate(`(() => {
      const fetched = window.fetch;
      window.fetch = function (input, init) {
        if (String(input).includes('/.session/aside')) return Promise.resolve(new Response(JSON.stringify({ error: 'the disk is full' }), { status: 500 }));
        return fetched.call(this, input, init);
      };
      return true;
    })()`);
    const mine = await ann.evaluate(TEXT);
    await pressConflict(ann, 'Keep theirs');
    await ann.waitFor(`document.querySelector('${DIALOG} h3')?.textContent === 'Your version could not be set aside'`, 20_000);
    assert.equal(await ann.evaluate(`document.querySelector('${DIALOG} p').textContent`), 'the disk is full');
    await press$(ann, DIALOG, 'Download my version');
    const [file] = await downloads(ann);
    assert.equal(file.text, mine);
    assert.ok(file.text.includes('Opening slide'));
    await converge(server, [ann, ben]);
    clean(ann, [/status of 500/]);
    clean(ben);
    await ann.close();
    await ben.close();
  });
});

test('the mode ends with the session, and a read of the versions that failed is made again at the next state', { timeout: 300_000, skip: process.platform === 'win32' && 'signals' }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await converge(server, [ann]);
  // the first read of the versions is answered 500 while the page is online
  await ann.evaluate(`(() => {
    const fetched = window.fetch;
    window.fetch = function (input, init) {
      if (String(input).includes('/.session/history?') && !window.__failed) {
        window.__failed = true;
        return Promise.resolve(new Response(JSON.stringify({ error: 'busy' }), { status: 500 }));
      }
      return fetched.call(this, input, init);
    };
    return true;
  })()`);
  await openPane(ann);
  await ann.waitFor(`${LIST}[0]?.empty === 'The versions cannot be read while the page is offline.'`);
  assert.equal(await ann.evaluate(`${C}.connection`), 'online');
  await ann.evaluate(`${C}.refresh(), true`);
  await ann.waitFor(`${LIST}.length > 0 && ${LIST}.every((x) => x.empty !== 'The versions cannot be read while the page is offline.' && x.empty !== 'Loading versions…')`);
  server.edit.child.kill('SIGTERM');
  await ann.waitFor(`${C}.connection === 'ended'`, 20_000);
  await ann.waitFor(`!(${SHOWN})`);
  assert.deepEqual(await ann.evaluate(INERT), [false, false, false, false, false]);
  clean(ann, [/status of 500/, /ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|ERR_SOCKET_NOT_CONNECTED/]);
});

// the text of the pill of following, or null while it is hidden
const PILL = `(() => { const box = document.querySelector('.beeson-session-follow'); return !box || box.hidden ? null : box.querySelector('.text').textContent; })()`;
const FOLLOWED = 'window.BeesonSession.follow().target';

test('Version History stops following, and a page that follows the person reads that the person views the version history', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [ann, ben]);
  const ids = { ann: await ann.evaluate(`${C}.person`), ben: await ben.evaluate(`${C}.person`) };
  // Ben follows Ann, and Ann follows Ben
  for (const [page, id] of [[ben, ids.ann], [ann, ids.ben]]) {
    await front(page);
    await page.waitFor(`${C}.resolved().some((r) => r.person === ${JSON.stringify(id)})`);
    await page.evaluate(`window.BeesonSession.follow().start(${JSON.stringify(id)})`);
    assert.equal(await page.evaluate(FOLLOWED), id);
  }
  await front(ben);
  await ben.waitFor(`${PILL} === 'Following Ann'`);
  await openPane(ann);
  assert.equal(await ann.evaluate(FOLLOWED), null);
  await front(ben);
  await ben.waitFor(`${PILL} === 'Ann is viewing the version history'`);
  assert.equal(await ben.evaluate(FOLLOWED), ids.ann);
  await front(ann);
  await press(ann, 'Escape');
  await ann.waitFor(`!(${SHOWN})`);
  await front(ben);
  await ben.waitFor(`${PILL} === 'Following Ann'`);
  clean(ann);
  clean(ben);
});

test('Version History takes the caret out of the text, hence another person can move or delete it at once', { timeout: 180_000 }, async (t) => {
  const { pages: [ann, ben] } = await session(t, ['Ann', 'Ben']);
  await show(ben, 'One');
  await show(ann, 'One');
  await caretAtEnd(ann, el(0, 'h2'));
  await typeKeys(ann, ' typed');
  await press(ann, HISTORY_KEY);
  await ann.waitFor(SHOWN);
  // the presence state of Ann as the page of Ben reads it
  const of = `${C}.presence.find((p) => p.name === 'Ann')?.state`;
  await front(ben);
  await ben.waitFor(`${of}?.mode === 'history'`);
  assert.equal(await ben.evaluate(`${of}.caret`), null);
  const focused = await ben.evaluate(`(() => { const h = ${el(0, 'h2')}; h.focus(); return document.activeElement === h; })()`);
  assert.deepEqual([focused, await ben.evaluate(HOLDER(el(0, 'h2'))), await ben.evaluate(BUBBLE)], [true, null, null]);
  clean(ann);
  clean(ben);
});

test('Shift+F10 does not open the menu of the selected element over Version History', { timeout: 180_000 }, async (t) => {
  const { pages: [ann] } = await session(t, ['Ann']);
  await show(ann, 'One');
  await select(ann, el(0, 'h2'));
  await openPane(ann);
  // the key opens a menu while its keydown is handled, hence the menu would be in the page once press ends
  await press(ann, 'Shift+F10');
  assert.equal(await ann.evaluate(`document.querySelectorAll('.beeson-edit-menu').length`), 0);
  await press(ann, 'Escape');
  await ann.waitFor(`!(${SHOWN})`);
  clean(ann);
});

test('the button Comments is drawn dimmed while Version History makes it inert', { timeout: 180_000 }, async (t) => {
  const { pages: [ann] } = await session(t, ['Ann']);
  const DIM = `(() => { const b = document.querySelector('.beeson-session-comments'); return [b.inert, Number(getComputedStyle(b).opacity) < 1]; })()`;
  await front(ann);
  assert.deepEqual(await ann.evaluate(DIM), [false, false]);
  await press(ann, HISTORY_KEY);
  await ann.waitFor(SHOWN);
  await ann.waitFor(`document.querySelector('.beeson-session-comments').inert`);
  assert.deepEqual(await ann.evaluate(DIM), [true, true]);
  await press$(ann, PANE, 'Back to editor');
  await ann.waitFor(`!(${SHOWN})`);
  await ann.waitFor(`!document.querySelector('.beeson-session-comments').inert`);
  assert.deepEqual(await ann.evaluate(DIM), [false, false]);
  clean(ann);
});

// the classes of the elements whose own opacity is below 1, which the page keeps in window.__dim
// when keep is true. otherwise the classes of those that were not below 1 at the last keep, each
// with whether it is inert
const DIMMED = (keep) => `(() => {
  const dim = [...document.body.querySelectorAll('*')].filter((e) => Number(getComputedStyle(e).opacity) < 1);
  if (${keep}) return (window.__dim = new Set(dim)).size >= 0;
  return dim.filter((e) => !window.__dim.has(e)).map((e) => e.classList[0] + (e.inert ? ' inert' : ''));
})()`;
// the opacity of el as it is drawn, i.e. with the opacities of its ancestors
const DRAWN = (el) => `(() => { let o = 1; for (let e = ${el}; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; })()`;

test('while Version History is open, every inert part of the editor but the canvas is dimmed, every dimmed part is inert, and the pane and the preview are not dimmed', { timeout: 420_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await converge(server, [ann]);
  writeFileSync(server.file, server.read().replace('<h2>Two</h2>', '<h2>Two changed</h2>'));
  await ann.waitFor(`${TEXT}.includes('Two changed')`, 20_000);
  await ann.evaluate(`${C}.transport.post('history/current/name', { token: ${C}.token, name: 'Changed' })`);
  await tapOrClick(ann, `[...document.querySelectorAll('.beeson-edit-bottom button')].find((b) => b.textContent === 'Notes')`);
  await ann.waitFor(`document.documentElement.classList.contains('beeson-notes')`);
  await ann.evaluate(DIMMED(true));
  await openPane(ann);
  // the edge of the navigator is drawn only under the pointer, and the canvas and its layers hold the slide
  const undimmed = `[...document.querySelectorAll('[inert]')].filter((e) => e.getClientRects().length && !e.closest('.beeson-edit-canvas, .reveal, .beeson-edit-nav-edge, .beeson-overlay, .beeson-line-layer, .beeson-table-bars') &&Number(getComputedStyle(e).opacity) === 1).map((e) => e.classList[0])`;
  assert.deepEqual(await ann.evaluate(undimmed), []);
  assert.deepEqual((await ann.evaluate(DIMMED(false))).sort(), ['beeson-edit-bottom inert', 'beeson-edit-menubar inert', 'beeson-edit-nav inert', 'beeson-edit-objects inert', 'beeson-edit-pane inert', 'beeson-edit-top inert', 'beeson-session-comments inert']);
  await tapOrClick(ann, `[...document.querySelectorAll('${PANE} .row.version')].find((r) => r.querySelector('.title').textContent === 'Changed')`);
  await ann.waitFor(`${FRAME}?.contentDocument?.querySelectorAll('[data-beeson-changed]').length > 0`, 30_000);
  assert.deepEqual([await ann.evaluate(DRAWN(`document.querySelector('${PANE}')`)), await ann.evaluate(DRAWN(FRAME))], [1, 1]);
  await press(ann, 'Escape');
  await ann.waitFor(`!(${SHOWN})`);
  assert.deepEqual(await ann.evaluate(DIMMED(false)), []);
  clean(ann);
});

// a slide with a word in italic, a character reference, a formula, a table, and a pre whose first
// newline the page drops, and a plain slide
const MORE = `<section>
  <h2>Three</h2>
  <p>Some <em>slanted words</em> here</p>
  <p>Fish &amp; chips</p>
  <p>A formula \\(x^2\\) here</p>
  <table>
    <tr><td>Cell one</td><td>Cell two</td></tr>
  </table>
  <pre>
plain code</pre>
</section>

<section>
  <h2>Four</h2>
  <p>Added whole</p>
</section>
`;

// the caret put at offset in the first text node of the element of node, with the focus in the text element of host
const caretAt = async (page, host, node, offset) => assert.ok(await page.evaluate(`(() => { const h = ${host}; h.focus(); const r = document.createRange(); r.setStart(${node}.firstChild, ${offset}); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); return document.activeElement === h; })()`));

test('Show changes tints the characters that each person added to a changed text element in the tone of this person, and unticking it takes the tints off', { timeout: 780_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [ann, ben]);
  writeFileSync(server.file, server.read().replace('\n</div>\n</div>', `\n${MORE}\n</div>\n</div>`));
  await ann.waitFor(`${TEXT}.includes('Added whole')`, 20_000);
  await converge(server, [ann, ben]);
  await ann.evaluate(`${C}.transport.post('history/current/name', { token: ${C}.token, name: 'Added' })`);
  await show(ann, 'One');
  await caretAtEnd(ann, el(0, 'h2'));
  await typeKeys(ann, ' by Ann');
  await caretAtEnd(ann, el(0, 'p'));
  await typeKeys(ann, ' and Ann');
  await converge(server, [ann, ben]);
  await leave(ann);
  await show(ben, 'One');
  await ben.waitFor(`${HOLDER(el(0, 'p'))} === null`);
  await caretAtEnd(ben, el(0, 'p'));
  await typeKeys(ben, ' then Ben');
  await show(ben, 'Two');
  await caretAtEnd(ben, `${el(1, 'li')}.nextElementSibling`);
  await typeKeys(ben, ' too');
  await show(ann, 'Three');
  await caretAt(ann, el(2, 'p'), el(2, 'em'), 'slanted'.length);
  await typeKeys(ann, ' and new');
  for (const [k, typed] of [[2, ' fries'], [3, ' more']]) {
    await caretAtEnd(ann, `${el(2, 'p')}.parentElement.children[${k}]`);
    await typeKeys(ann, typed);
  }
  await show(ben, 'Three');
  await caretAtEnd(ben, `${el(2, 'td')}.nextElementSibling`);
  await typeKeys(ben, ' changed');
  await converge(server, [ann, ben]);
  assert.ok(server.read().includes('<p>Some <em>slanted and new words</em> here</p>'));
  await ann.evaluate(`${C}.transport.post('history/current/name', { token: ${C}.token, name: 'Typed' })`);
  await openPane(ann);
  const doc = `${FRAME}.contentDocument`;
  // the trimmed text of each range of each highlight, without the ranges of whitespace alone, since
  // the space of a word typed between two may be either one, and the tint drawn on its first range
  const TINTS = `(() => {
    const d = ${doc};
    const w = d.defaultView;
    const out = {};
    for (const [name, h] of w.CSS.highlights) {
      const ranges = [...h].map((r) => r.toString().trim()).filter(Boolean).sort();
      const host = [...h][0].startContainer.parentElement;
      out[ranges.join('|')] = w.getComputedStyle(host, '::highlight(' + name + ')').backgroundColor;
    }
    return out;
  })()`;
  // the tone of a person in the page of the preview, with 35% of its alpha as the tint
  const tint = async (page) => (await ann.evaluate(toneIn(doc, await page.evaluate(`${C}.color`)))).replace(/^rgb\((\d+), (\d+), (\d+)\)$/, (_, r, g, b) => `color(srgb ${[r, g, b].map((x) => +(x / 255).toFixed(6)).join(' ')} / 0.35)`);
  const preview = async (title) => {
    await ann.evaluate(`window.__shownDoc = ${FRAME}?.contentDocument`);
    await tapOrClick(ann, `[...document.querySelectorAll('${PANE} .row.version')].find((r) => r.querySelector('.title').textContent === ${JSON.stringify(title)})`);
    await ann.waitFor(`${doc} !== window.__shownDoc && !!${doc}?.querySelector('[data-beeson-changed]')`, 30_000);
    return ann.evaluate(TINTS);
  };
  const typed = await preview('Typed');
  assert.deepEqual(typed, {
    'and Ann|and new|by Ann': await tint(ann),
    'changed|then Ben|too': await tint(ben),
  });
  // the outlines of every changed element, whether its text is tinted or not
  const outlined = await ann.evaluate(`[...${doc}.querySelectorAll('[data-beeson-changed]')].map((e) => e.textContent.trim().split(/\\s+/).slice(0, 2).join(' '))`);
  assert.deepEqual(outlined, ['One by', 'First slide', 'Alpha Beta', 'Some slanted', 'Fish &', 'A formula', 'Cell oneCell']);

  const added = await preview('Added');
  assert.deepEqual(Object.keys(added), ['Added whole|Four']);
  assert.deepEqual(await preview('Typed'), typed);

  await tapOrClick(ann, `document.querySelector('${BAR} label.changes input')`);
  await ann.waitFor(`Object.values(${TINTS}).every((c) => c === 'rgba(0, 0, 0, 0)')`);
  await tapOrClick(ann, `document.querySelector('${BAR} label.changes input')`);
  await ann.waitFor(`JSON.stringify(${TINTS}) === ${JSON.stringify(JSON.stringify(typed))}`);

  writeFileSync(server.file, server.read().replace('plain code</pre>', 'plain code too</pre>'));
  await ann.waitFor(`${TEXT}.includes('plain code too')`, 20_000);
  await converge(server, [ann, ben]);
  await ann.evaluate(`${C}.transport.post('history/current/name', { token: ${C}.token, name: 'Code' })`);
  assert.deepEqual(await preview('Code'), {});
  assert.deepEqual(await ann.evaluate(`[...${doc}.querySelectorAll('[data-beeson-changed]')].map((e) => e.localName)`), ['pre']);
  clean(ann);
  clean(ben);
});

// the tints and the outlines of the preview of a version per case, each of which replaces the case
// slide of the one before. a case is a slide with the words that its marks cover, by their
// occurrence after the heading. each tinted range is written with its text, its element, and its
// place among the children of this name, and each outlined element in the same form
async function tintsOf(t, cases) {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const at = TALK.indexOf('\n</div>\n</div>');
  const t0 = Date.now() - (cases.length + 5) * MIN;
  const lines = [JSON.stringify({ kind: 'base', time: t0 - MIN, text: TALK })];
  let last = '';
  cases.forEach((c, i) => {
    const slide = `\n<section>\n  <h2>Case ${c.name}</h2>\n  ${c.html}\n</section>\n`;
    const marks = c.marks.map(([word, nth]) => {
      let k = slide.indexOf('</h2>');
      for (let n = 0; n <= nth; n++) k = slide.indexOf(word, k + 1);
      return { start: at + k, end: at + k + word.length, author: 'pa' };
    });
    lines.push(JSON.stringify({ kind: 'version', id: `c${i}`, time: t0 + i * MIN, authors: ['pa'], slides: [3], patches: [{ start: at, end: at + last.length, text: slide }], marks }));
    lines.push(JSON.stringify({ kind: 'name', id: `c${i}`, name: `Case ${c.name}` }));
    last = slide;
  });
  const server = await crafted(t, { jsonl: `${lines.join('\n')}\n`, text: TALK.slice(0, at) + last + TALK.slice(at) }, HELD);
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await openPane(ann);
  const doc = `${FRAME}.contentDocument`;
  const placed = (e) => `${e.localName}[${[...e.parentElement.children].filter((c) => c.localName === e.localName).indexOf(e)}]`;
  const SEEN = `(() => {
    const d = ${doc};
    const placed = ${placed};
    const tints = [...d.defaultView.CSS.highlights.values()].flatMap((h) => [...h].map((r) => r.toString() + ' in ' + placed(r.startContainer.parentElement)));
    return { tints, outlined: [...d.querySelectorAll('[data-beeson-changed]')].map(placed) };
  })()`;
  const seen = {};
  for (const c of cases) {
    await ann.evaluate(`window.__shownDoc = ${FRAME}?.contentDocument`);
    await tapOrClick(ann, `[...document.querySelectorAll('${PANE} .row.version')].find((r) => r.querySelector('.title').textContent === 'Case ${c.name}')`);
    // the tints are set in the same task as the outlines
    await ann.waitFor(`${doc} !== window.__shownDoc && !!${doc}?.querySelector('[data-beeson-changed]')`, 20_000);
    seen[c.name] = await ann.evaluate(SEEN);
  }
  clean(ann);
  return seen;
}

// the waits are 60 s for the edit command to start, 15 s for each of the open page and the pane,
// and 35 s per case
test('Show changes tints a paragraph only where the page holds as many paragraphs in its slide as the text does', { timeout: 360_000 }, async (t) => {
  const seen = await tintsOf(t, [
    { name: 'p-closed', html: '<p>Same<ul><li>x</li></ul></p>\n  <p>Same</p>\n  <p>Same</p>', marks: [['Same', 2]] },
    { name: 'p-same', html: '<p>Same</p>\n  <p>Same</p>', marks: [['Same', 1]] },
    { name: 'p-moved', html: `<div class="box"></div>\n  <p>Same typed</p>\n  <p>Same typed</p>\n  <script>{const s=document.currentScript.parentNode;s.querySelector('div.box').append(s.querySelector('p'))}</script>`, marks: [['typed', 0]] },
  ]);
  assert.deepEqual(seen, {
    // the parser closes the first p at the ul and adds an empty p, hence the nth p is another one
    'p-closed': { tints: [], outlined: ['p[2]'] },
    'p-same': { tints: ['Same in p[1]'], outlined: ['p[1]'] },
    // a script moves the first p into the box, hence the first p of the slide is the second of the
    // text, which reads the same
    'p-moved': { tints: [], outlined: ['p[0]'] },
  });
});

test('Show changes tints a paragraph with a character reference in an attribute, and neither one moved by a script nor one short of a text node', { timeout: 360_000 }, async (t) => {
  // a script inside the paragraph puts the <i> before the <b>, whose text nodes both read xx
  const swap = `<p><b>xx</b><i>xx</i><script>{const p=document.currentScript.parentNode;p.insertBefore(p.querySelector('i'),p.firstChild)}</script></p>`;
  const seen = await tintsOf(t, [
    { name: 'href-amp', html: '<p>See <a href="https://example.org/?a=1&amp;b=2">here</a> typed</p>', marks: [['typed', 0]] },
    { name: 'script-swap', html: swap, marks: [['xx', 1]] },
    { name: 'pre-newline', html: '<div>Alpha typed<pre>\n</pre></div>\n  <p>Later typed</p>', marks: [['Alpha typed', 0], ['Later typed', 0]] },
  ]);
  assert.deepEqual(seen, {
    'href-amp': { tints: ['typed in p[0]'], outlined: ['p[0]'] },
    'script-swap': { tints: [], outlined: ['p[0]'] },
    // the parser drops the newline of the pre, which leaves the div one text node short
    'pre-newline': { tints: ['Later typed in p[0]'], outlined: ['div[0]', 'p[0]'] },
  });
});

test('Show changes tints the children of a slide to which the theme appends a list of references, a running head, or the step that shows every step again', { timeout: 360_000 }, async (t) => {
  // the deck does not load tex.js, hence the references are set by a script of the slide, which
  // runs before Beeson.start()
  const tex = `<script>window.beesonTex = { references: { floquet1883: { authors: 'G. Floquet', title: 'Sur les équations différentielles linéaires', year: '1883' } } };</script>`;
  const seen = await tintsOf(t, [
    { name: 'cited', html: `<p>Floquet <cite data-key="floquet1883"></cite> showed it</p>\n  <div class="foot">Caption typed here</div>\n  <div class="theorem">A theorem typed here</div>\n  ${tex}`, marks: [['typed', 0], ['typed', 1]] },
    // the slide after a section slide has a running head
    { name: 'run', html: '<p>Before</p>\n</section>\n<section class="section">\n  <h2>Part</h2>\n</section>\n<section>\n  <h2>After</h2>\n  <div class="foot">Caption typed here</div>', marks: [['typed', 0]] },
    { name: 'restore', html: '<p class="fragment">One</p>\n  <p class="fragment">Two</p>\n  <span>Aside typed</span>', marks: [['typed', 0]] },
  ]);
  assert.deepEqual(seen, {
    cited: { tints: ['typed in div[0]', 'typed in div[1]'], outlined: ['div[0]', 'div[1]'] },
    run: { tints: ['typed in div[0]'], outlined: ['div[0]'] },
    restore: { tints: ['typed in span[0]'], outlined: ['span[0]'] },
  });
});

test('Show changes tints a paragraph with a dollar or a backslash that MathJax shows as written, and leaves out math', { timeout: 300_000 }, async (t) => {
  // the deck does not load MathJax, hence the text nodes read as the text, and the math is left out
  // by its delimiters alone
  const lines = [String.raw`Costs $5 a seat typed`, String.raw`Run <code>C:\talk\Edit.cmd</code> typed`, String.raw`In the editor, <code>\cite{</code> opens it, typed`, String.raw`Then <code>\refresh</code> typed`, String.raw`A formula \(x^2\) typed`, String.raw`A display \[x^2\] typed`, String.raw`A break \\ typed`, String.raw`A price \$5 typed`, String.raw`An \begin{align}x\end{align} typed`, String.raw`See \ref{e1} typed`, String.raw`See \eqref{e1} typed`, '<MATH><mi>x</mi></MATH> typed', '<script>0</script> typed'];
  const seen = await tintsOf(t, [{ name: 'math', html: lines.map((l) => `<p>${l}</p>`).join('\n  '), marks: lines.map((_, k) => ['typed', k]) }]);
  assert.deepEqual(seen, { math: { tints: ['typed in p[0]', 'typed in p[1]', 'typed in p[2]', 'typed in p[3]'], outlined: lines.map((_, k) => `p[${k}]`) } });
});

const OVERWRITTEN = 'index.html was changed outside the editor, and text of this session was replaced. This text is kept in Version History.';

const TOAST = `(() => {
  const span = document.querySelector('.beeson-session-toast span');
  const lines = Math.round(span.getBoundingClientRect().height / parseFloat(getComputedStyle(span).lineHeight));
  return { width: Math.round(document.querySelector('.beeson-session-toast').getBoundingClientRect().width), lines, room: innerWidth - 32 };
})()`;

test('a change of index.html from outside over a text that Ann typed is told on every page in a toast as wide as its text allows, whose Show opens Version History, where the newest closed version has the text of Ann, and keeps the focus in Version History open on a phone', { timeout: 600_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  const cy = await open(browser, sessionUrl(server.edit), { name: 'Cy', width: 390, height: 844, mobile: true });
  await converge(server, [ann, ben, cy]);
  // a program reads index.html before Ann types
  const read = server.read();
  await show(ann, 'One');
  // the caret inside the word, which the program changes as a whole
  await ann.evaluate(`(() => { const h = ${el(0, 'h2')}; h.focus(); const r = document.createRange(); r.setStart(h.firstChild, 1); getSelection().removeAllRanges(); getSelection().addRange(r); return document.activeElement === h; })()`);
  await typeKeys(ann, ' by Ann ');
  await converge(server, [ann, ben, cy]);
  assert.ok(server.read().includes('<h2>O by Ann ne</h2>'));
  // Cy previews a version in the sheet of a phone, which hides the other rows
  await openPane(cy);
  await tapOrClick(cy, `[...document.querySelectorAll('${PANE} .versions .row.version')].find((r) => r.getClientRects().length)`);
  await cy.waitFor(`document.querySelector('${PANE}').classList.contains('peek')`);
  for (const page of [ann, ben, cy]) {
    await recordToasts(page);
    await page.evaluate(HOLD);
  }
  writeFileSync(server.file, read.replace('<h2>Two</h2>', '<h2>Two by an agent</h2>'));
  await ann.waitFor(`${TEXT}.includes('Two by an agent')`, 20_000);
  writeFileSync(server.file, read.replace('<h2>One</h2>', '<h2>Uno</h2>'));
  await converge(server, [ann, ben, cy]);
  assert.ok(server.read().includes('<h2>Uno</h2>'));
  for (const page of [ben, cy]) await page.waitFor(`document.querySelector('.beeson-session-toast span')?.textContent === ${JSON.stringify(OVERWRITTEN)}`, 20_000);
  // on a desktop the toast is one line narrower than the window, and on a phone it takes the window less the gutters
  const [wide, narrow] = [await ben.evaluate(TOAST), await cy.evaluate(TOAST)];
  assert.ok(wide.lines === 1 && wide.width < wide.room && narrow.width === narrow.room, JSON.stringify({ wide, narrow }));
  // on a phone, the toast is above the sheet of Version History, also at its full height of 55 % of
  // the window, hence it covers neither a row nor a button of the sheet
  const above = await cy.evaluate(`(() => {
    const toast = document.querySelector('.beeson-session-toast').getBoundingClientRect();
    return { toast: Math.round(toast.bottom), sheet: Math.round(Math.min(document.querySelector('${PANE}').getBoundingClientRect().top, innerHeight - 28 - 0.55 * innerHeight)) };
  })()`);
  assert.ok(above.toast <= above.sheet, JSON.stringify(above));
  await press$(ben, '.beeson-session-toast', 'Show');
  await ben.waitFor(SHOWN);
  await ben.waitFor(`${LIST}.length > 1`);
  // the version of Ann is closed at the change from outside, and the change is in the open version
  const [version] = await versionsOf(ben);
  assert.deepEqual(version.authors, [await ann.evaluate(`${C}.person`)]);
  assert.ok((await (await fetch(`${server.edit.url}index.html?version=${version.id}`)).text()).includes('<h2>O by Ann ne</h2>'));
  await press$(cy, '.beeson-session-toast', 'Show');
  await cy.waitFor(`!document.querySelector('.beeson-session-toast button')`);
  assert.deepEqual(await cy.evaluate(`[document.activeElement.localName, document.activeElement.matches('${PANE} .row[aria-current="true"]')]`), ['button', true]);
  for (const page of [ann, ben, cy]) assert.deepEqual(await page.evaluate('window.__toasts'), [`${OVERWRITTEN}|status`]);
  clean(ann);
  clean(ben);
  clean(cy);
});

// whether the element of expression takes the pointer at its center, and its center
const HIT = (expression) => `(() => { const el = ${expression}; const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); })()`;
const centerOf = (page, expression) => page.evaluate(`(() => { const r = (${expression}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
// the inert and the opacity of each part that is shown
const PARTS = (parts) => `${JSON.stringify(parts)}.map((s) => { const el = document.querySelector(s + ':not([hidden])'); return el && [el.inert, getComputedStyle(el).opacity]; })`;

test('the Slide Sorter open when Version History is opened is inert, dimmed, and does not take the pointer until Version History is left', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const state = PARTS(['.beeson-edit-sorter']);
  await ann.evaluate(`window.BeesonEditor.exec('view.lightTable').then(() => true)`);
  await ann.waitFor(`${state}.every(Boolean)`);
  const sorter = `document.querySelector('.beeson-edit-sorter')`;
  assert.deepEqual([await ann.evaluate(state), await ann.evaluate(HIT(sorter))], [[[false, '1']], true]);
  await openPane(ann);
  assert.deepEqual([await ann.evaluate(state), await ann.evaluate(HIT(sorter))], [[[true, '0.45']], false]);
  await press(ann, 'Escape');
  await ann.waitFor(`!(${SHOWN})`);
  assert.deepEqual([await ann.evaluate(state), await ann.evaluate(HIT(sorter))], [[[false, '1']], true]);
  clean(ann);
});

// the Slide Sorter is not open, since it covers the Objects pane
test('the Objects pane open when Version History is opened is inert and dimmed until Version History is left, and a click on Lock changes the deck only after it', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const state = PARTS(['.beeson-edit-objects']);
  const LOCK = `document.querySelector('.beeson-edit-objects button[aria-label="Lock"]')`;
  await ann.evaluate(`window.BeesonEditor.exec('view.objects').then(() => true)`);
  await ann.waitFor(`${state}.every(Boolean) && !!${LOCK}`);
  assert.deepEqual([await ann.evaluate(state), await ann.evaluate(HIT(LOCK))], [[[false, '1']], true]);
  await openPane(ann);
  assert.deepEqual([await ann.evaluate(state), await ann.evaluate(HIT(LOCK))], [[[true, '0.45']], false]);
  const before = await ann.evaluate(TEXT);
  const at = await centerOf(ann, LOCK);
  await click(ann, at);
  await press(ann, 'Escape');
  await ann.waitFor(`!(${SHOWN})`);
  assert.deepEqual([await ann.evaluate(state), await ann.evaluate(TEXT)], [[[false, '1']], before]);
  // the same click once the mode is left locks the element
  await click(ann, at);
  await ann.waitFor(`${TEXT} !== ${JSON.stringify(before)}`);
  assert.equal((await ann.evaluate(TEXT)).split('data-locked').length, before.split('data-locked').length + 1);
  clean(ann);
});

// the east grip of the paragraph of the first slide
const GRIP = `[...document.querySelectorAll('.beeson-overlay .beeson-grip')].find((g) => {
  const r = g.getBoundingClientRect();
  const p = ${el(0, 'p')}.getBoundingClientRect();
  return g.getClientRects().length && g.dataset.handle === 'e' && r.top + r.height / 2 >= p.top && r.top + r.height / 2 <= p.bottom;
})`;
const LAYERS = `['.beeson-overlay', '.beeson-line-layer', '.beeson-table-bars'].map((s) => document.querySelector(s).inert)`;

// the waits are 60 s for the edit command to start, 15 s for the page, 20 s for each converge, 15 s
// for each of the grip, the pane, and the preview row, 30 s for the preview, and 15 s for each of
// the end of the mode and the resize
test('while Version History is open, the layers of the grips, of the ends of lines, and of the bars of tables are inert, a drag of a grip of the selected paragraph leaves the deck and index.html as they were, and the preview of a version takes the pointer, and the grip resizes the paragraph once Version History is left', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await caretAtEnd(ann, el(0, 'h2'));
  await type(ann, ' x');
  await converge(server, [ann]);
  await ann.evaluate(`${C}.transport.post('history/current/name', { token: ${C}.token, name: 'Typed' }).then(() => true)`);
  await ann.evaluate(`${C}.app.selection.set('elements', [${el(0, 'p')}]), true`);
  await ann.waitFor(`!!(${GRIP})`);
  assert.deepEqual(await ann.evaluate(LAYERS), [false, false, false]);
  const before = await ann.evaluate(TEXT);
  const file = server.read();
  await openPane(ann);
  const mode = { layers: await ann.evaluate(LAYERS), grip: await ann.evaluate(HIT(GRIP)) };
  await drag(ann, await centerOf(ann, GRIP), { dx: 60 });
  await tapOrClick(ann, `[...document.querySelectorAll('${PANE} .row.version')].find((r) => r.querySelector('.title').textContent === 'Typed')`);
  await ann.waitFor(`!!${FRAME}?.contentDocument?.querySelector('[data-beeson-changed]')`, 30_000);
  mode.preview = await ann.evaluate(HIT(FRAME));
  await press(ann, 'Escape');
  await ann.waitFor(`!(${SHOWN})`);
  await converge(server, [ann]);
  mode.deck = (await ann.evaluate(TEXT)) === before;
  mode.file = server.read() === file;
  assert.deepEqual(mode, { layers: [true, true, true], grip: false, preview: true, deck: true, file: true });
  assert.deepEqual(await ann.evaluate(LAYERS), [false, false, false]);
  // the focus goes back to the heading, which takes the selection
  await ann.evaluate(`${C}.app.selection.set('elements', [${el(0, 'p')}]), true`);
  await ann.waitFor(`!!(${GRIP})`);
  await drag(ann, await centerOf(ann, GRIP), { dx: 60 });
  await ann.waitFor(`${TEXT} !== ${JSON.stringify(before)}`);
  await converge(server, [ann]);
  assert.match(server.read(), /<p style="[^"]*width: \d+px[^"]*">First slide<\/p>/);
  clean(ann);
});
