// following a person, the dots of the people on each slide, and the lines of Share, in Chrome on
// the edit command started on a temporary talk folder: a click on an avatar that follows, the
// selection of the person followed brought into view, each way that following stops, the texts of
// the pill, the count of the followers, a person with two pages, the dots of a row and a tile with
// +N and the chips of a shared tone, the changed dot, the lines of the Share dialog, a page that
// closes, which sends no state after its bye, the pill on a phone of 390 px, and a deck of 200
// slides with three people typing, which is not parsed per operation

import assert from 'node:assert/strict';
import { cpSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd, frame, front } from './helpers/apply.mjs';
import { C, clean, converge, ONLINE, open, sessionUrl, show, talk, TALK } from './helpers/client.mjs';
import { click, press as key, typeKeys } from './helpers/editor.mjs';
import { startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';
import { dialogButton, HIT, item, menu, press, tap } from './helpers/share.mjs';

const F = 'window.BeesonSession.follow()';
const P = 'window.BeesonSession.presence()';
// the avatar of the person named name
const avatar = (name) => `.beeson-session-people button[title=${JSON.stringify(name)}]`;
// the element of selector on the slide whose heading starts with heading
const on = (heading, selector) => `[...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector('h2')?.textContent.startsWith(${JSON.stringify(heading)}))?.querySelector(${JSON.stringify(selector)})`;
const HEADING = `Reveal.getCurrentSlide()?.querySelector('h2')?.textContent`;

// the text, the button, and the border of the pill, or null while it is hidden
const PILL = `(() => {
  const box = document.querySelector('.beeson-session-follow');
  if (!box || box.hidden) return null;
  const b = box.querySelector('button');
  return { text: box.querySelector('.text').textContent, button: b.hidden ? null : b.textContent, on: box.classList.contains('on') };
})()`;

async function untilPill(page, want, what = JSON.stringify(want)) {
  await front(page);
  return until(async () => {
    const got = await page.evaluate(PILL);
    return JSON.stringify(got) === JSON.stringify(want) ? got ?? true : null;
  }, `the pill ${what}`);
}

// the elements of expressions selected on page
async function select(page, ...expressions) {
  await front(page);
  const ok = await page.evaluate(`(() => {
    const els = [${expressions.join(', ')}];
    if (els.some((e) => !e)) return false;
    ${C}.app.selection.set('elements', els);
    return true;
  })()`);
  assert.ok(ok, `${expressions.join(', ')} are on the page`);
}

async function session(t, names, options = {}) {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const pages = [];
  for (const name of names) pages.push(await open(browser, url, { name, ...options }));
  await converge(server, pages);
  const ids = await Promise.all(pages.map((p) => p.evaluate(`${C}.person`)));
  return { browser, server, url, pages, ids };
}

// a second page of the person who holds name, which answers Yes to the question of the join
async function samePerson(browser, url, name) {
  const page = await open(browser, url, { name, wait: false });
  await page.waitFor(`!!${dialogButton('beeson-edit-dialog', 'Yes, continue')}`);
  await press(page, dialogButton('beeson-edit-dialog', 'Yes, continue'));
  await page.waitFor(ONLINE);
  return page;
}

// the person followed by page once it is target
const following = async (page, target) => {
  await front(page);
  await page.waitFor(`${F}.target === ${JSON.stringify(target)}`);
};

test('a click on an avatar follows the person to the slide, and brings the selection into view at the own zoom', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben], ids: [anaId] } = await session(t, ['Ana', 'Ben']);
  await press(ben, avatar('Ana'));
  await following(ben, anaId);
  assert.deepEqual(await ben.evaluate(PILL), { text: 'Following Ana', button: 'Stop', on: true });
  assert.equal(await ben.evaluate(`document.querySelector(${JSON.stringify(avatar('Ana'))}).getAttribute('aria-pressed')`), 'true');
  assert.ok(await ben.evaluate(`[...document.querySelectorAll('.beeson-session-live')].some((l) => l.textContent === 'Following Ana')`));
  // the border lies over the canvas, in the tone of Ana, and only the pill takes a pointer
  const border = await ben.evaluate(`(() => {
    const box = document.querySelector('.beeson-session-follow');
    const r = box.getBoundingClientRect(), v = ${C}.app.stage.viewport, s = getComputedStyle(box);
    return { edges: [r.left - v.left, r.top - v.top, r.right - v.right, r.bottom - v.bottom].map(Math.round), shadow: s.boxShadow, events: s.pointerEvents, pill: getComputedStyle(box.querySelector('.pill')).pointerEvents };
  })()`);
  assert.deepEqual(border.edges, [0, 0, 0, 0]);
  assert.match(border.shadow, /0px 0px 0px 3px inset/);
  assert.equal(border.events, 'none');
  assert.equal(border.pill, 'auto');

  await t.test('the slide of Ana is shown without an entry of the history or a change of the deck', async () => {
    await ben.evaluate(`window.__last = ${C}.app.history.last; window.__dirty = ${C}.app.dirty`);
    await show(ana, 'Two');
    await front(ben);
    await ben.waitFor(`${HEADING} === 'Two'`);
    assert.equal(await ben.evaluate(`${C}.app.history.last === window.__last && ${C}.app.dirty === window.__dirty`), true);
    assert.equal(await ben.evaluate(`${F}.target`), anaId);
    // the label of the avatar of Ana reads the slide of Ana
    await ben.waitFor(`document.querySelector(${JSON.stringify(avatar('Ana'))}).getAttribute('aria-label') === 'Ana, on slide 2'`);
  });

  await t.test('a zoom and a scroll do not stop it, and the selection of Ana is scrolled into view', async () => {
    const IN_VIEW = `(() => {
      // an item wider than the canvas at this zoom is brought in by its left edge
      const v = ${C}.app.stage.viewport, r = ${on('Two', 'li:last-child')}.getBoundingClientRect();
      return r.left >= v.left && r.left < v.right && r.top >= v.top && r.bottom <= v.bottom;
    })()`;
    await front(ben);
    await ben.evaluate(`${C}.app.stage.setZoom(4)`);
    await frame(ben);
    await ben.evaluate(`(() => { const el = ${C}.app.stage.el; el.scrollTo(el.scrollWidth, el.scrollHeight); })()`);
    await frame(ben);
    assert.equal(await ben.evaluate(IN_VIEW), false, 'Beta is out of view before Ana selects it');
    assert.equal(await ben.evaluate(`${F}.target`), anaId);
    await select(ana, on('Two', 'li:last-child'));
    await front(ben);
    await ben.waitFor(IN_VIEW);
    assert.equal(await ben.evaluate(`${C}.app.stage.zoom`), 4);
    assert.equal(await ben.evaluate(`${F}.target`), anaId);
    await ben.evaluate(`${C}.app.stage.setZoom(null)`);
    await frame(ben);
    assert.equal(await ben.evaluate(`${F}.target`), anaId);
  });

  await t.test('the own avatar counts the followers', async () => {
    await front(ana);
    await ana.waitFor(`document.querySelector('.beeson-session-people .me .beeson-session-followers')?.dataset.count === '1'`);
    assert.equal(await ana.evaluate(`document.querySelector('.beeson-session-people .me .beeson-session-followers').title`), 'Ben is following you');
    assert.equal(await ana.evaluate(`document.querySelector('.beeson-session-people .me').getAttribute('aria-label')`), 'Ana, you, Ben is following you');
    // the count is drawn by CSS, and the text of the avatar keeps the initials alone
    assert.doesNotMatch(await ana.evaluate(`document.querySelector('.beeson-session-people .me').textContent`), /\d/);
  });

  await t.test('Enter and Space on the focused avatar stop and follow again, and the menu goes to the slide', async () => {
    await front(ben);
    await ben.evaluate(`document.querySelector(${JSON.stringify(avatar('Ana'))}).focus()`);
    // a key of Enter that a button takes as a click carries its text
    for (const type of ['keyDown', 'keyUp']) await ben.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) });
    await following(ben, null);
    await key(ben, 'Space');
    await following(ben, anaId);
    await click(ben, avatar('Ana'), { button: 'right' });
    await ben.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
    assert.deepEqual(await menu(ben), ['Ana', 'Stop Following', 'Go to Slide 2']);
    await key(ben, 'Escape');
    await show(ben, 'One');
    await following(ben, null);
    await click(ben, avatar('Ana'), { button: 'right' });
    await ben.waitFor(`!!${item('Go to Slide 2')}`);
    assert.deepEqual(await menu(ben), ['Ana', 'Follow', 'Go to Slide 2']);
    await press(ben, item('Go to Slide 2'));
    await ben.waitFor(`${HEADING} === 'Two'`);
    assert.equal(await ben.evaluate(`${F}.target`), null);
    // the count goes with the last follower
    await front(ana);
    await ana.waitFor(`!document.querySelector('.beeson-session-followers') && document.querySelector('.beeson-session-people .me').getAttribute('aria-label') === 'Ana, you'`);
  });
  clean(ana);
  clean(ben);
});

test('following stops at the avatar, Stop, Escape, a selection, a slide, an edit, and a show, and the pill tells why', { timeout: 180_000 }, async (t) => {
  const { browser, url, server, pages: [ana, ben], ids: [anaId] } = await session(t, ['Ana', 'Ben']);
  await ben.evaluate(`${F}.notice = 60000`);
  const follow = async () => {
    await front(ben);
    await ben.evaluate(`${F}.start(${JSON.stringify(anaId)})`);
    await following(ben, anaId);
  };
  const stopped = async (how) => {
    await following(ben, null);
    assert.deepEqual(await ben.evaluate(PILL), { text: 'Stopped following Ana', button: 'Follow again', on: false }, how);
    assert.ok(await ben.evaluate(`[...document.querySelectorAll('.beeson-session-live')].some((l) => l.textContent === 'Stopped following Ana')`), how);
  };

  await follow();
  await press(ben, avatar('Ana'));
  await stopped('a click on the avatar');
  await press(ben, '.beeson-session-follow button');
  await following(ben, anaId);
  assert.deepEqual(await ben.evaluate(PILL), { text: 'Following Ana', button: 'Stop', on: true });
  await press(ben, '.beeson-session-follow button');
  await stopped('Stop');

  await follow();
  await ben.evaluate(`document.querySelector('.beeson-session-follow button').focus()`);
  await key(ben, 'Escape');
  await stopped('Escape in the pill');

  await follow();
  await select(ben, on('One', 'p'));
  await stopped('a selection');

  await follow();
  await show(ben, 'Two');
  await stopped('a slide shown by Ben');

  await follow();
  await ben.waitFor(`${HEADING} === 'One'`);
  await ben.evaluate(`${C}.app.commands.run('slide.hide')`);
  await stopped('an edit');
  await ben.evaluate(`${C}.app.commands.run('slide.hide')`);
  await converge(server, [ana, ben]);

  await t.test('a show of Ben stops it, and Ben is presenting for the others', async () => {
    await follow();
    await ben.evaluate(`void ${C}.app.commands.run('file.present')`);
    await ben.waitFor(`!!document.querySelector('body > .beeson-edit-show')`);
    await stopped('a show');
    await front(ana);
    await ana.waitFor(`${C}.resolved().some((r) => r.name === 'Ben' && r.mode === 'present')`);
    await front(ben);
    await ben.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await ben.waitFor(`!document.querySelector('.beeson-edit-show')`);
    await front(ana);
    await ana.waitFor(`${C}.resolved().some((r) => r.name === 'Ben' && r.mode === 'edit')`);
  });

  await t.test('while Ana presents or views the history, the pill tells, and the page stays on its slide', async () => {
    await show(ana, 'One');
    await follow();
    await ben.waitFor(`${HEADING} === 'One'`);
    await front(ana);
    await ana.evaluate(`void ${C}.app.commands.run('file.present')`);
    await ana.waitFor(`!!document.querySelector('body > .beeson-edit-show')`);
    await untilPill(ben, { text: 'Ana is presenting', button: 'Stop', on: true });
    await front(ana);
    await ana.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await ana.waitFor(`!document.querySelector('.beeson-edit-show')`);
    await untilPill(ben, { text: 'Following Ana', button: 'Stop', on: true });
    await front(ana);
    await ana.evaluate(`${P}.set({ mode: 'history' })`);
    await untilPill(ben, { text: 'Ana is viewing the version history', button: 'Stop', on: true });
    await show(ana, 'Two');
    await front(ana);
    await ana.waitFor(`${C}.connection === 'online'`);
    await front(ben);
    await ben.waitFor(`${C}.resolved().some((r) => r.name === 'Ana' && r.slide?.querySelector('h2')?.textContent === 'Two')`);
    assert.equal(await ben.evaluate(HEADING), 'One');
    await front(ana);
    await ana.evaluate(`${P}.set({ mode: 'edit' })`);
    await front(ben);
    await ben.waitFor(`${HEADING} === 'Two'`);
    await untilPill(ben, { text: 'Following Ana', button: 'Stop', on: true });
  });

  await t.test('a person who leaves ends it, and a notice goes after its time', async () => {
    const cleo = await open(browser, url, { name: 'Cleo' });
    const cleoId = await cleo.evaluate(`${C}.person`);
    await front(ben);
    await ben.waitFor(`${C}.people.some((p) => p.person === ${JSON.stringify(cleoId)})`);
    await ben.evaluate(`${F}.start(${JSON.stringify(cleoId)})`);
    await following(ben, cleoId);
    await untilPill(ben, { text: 'Following Cleo', button: 'Stop', on: true });
    await cleo.close();
    await untilPill(ben, { text: 'Cleo left the session', button: null, on: false });
    assert.equal(await ben.evaluate(`${F}.target`), null);
    await ben.evaluate(`${F}.notice = 300`);
    await follow();
    await press(ben, '.beeson-session-follow button');
    await following(ben, null);
    await untilPill(ben, null, 'hidden after the notice');
  });
  clean(ana);
  clean(ben);
});

test('a person with two pages is followed on the page that changed last, and two people who follow each other stay', { timeout: 120_000 }, async (t) => {
  const { browser, url, server, pages: [ana, ben], ids: [anaId, benId] } = await session(t, ['Ana', 'Ben']);
  const ana2 = await samePerson(browser, url, 'Ana');
  await converge(server, [ana, ben, ana2]);
  await front(ben);
  await ben.evaluate(`${F}.start(${JSON.stringify(anaId)})`);
  await following(ben, anaId);
  await show(ana2, 'Two');
  await front(ben);
  await ben.waitFor(`${HEADING} === 'Two'`);
  // the first page of Ana, still on One, selects there and changes last, then the second does
  await select(ana, on('One', 'p'));
  await front(ben);
  await ben.waitFor(`${HEADING} === 'One'`);
  await select(ana2, on('Two', 'p'));
  await front(ben);
  await ben.waitFor(`${HEADING} === 'Two'`);
  assert.equal(await ben.evaluate(`${F}.target`), anaId);

  await t.test('nobody follows the own person, whose avatar keeps its menu', async () => {
    await ben.evaluate(`${F}.start(${JSON.stringify(benId)})`);
    assert.equal(await ben.evaluate(`${F}.target`), anaId);
    await ben.evaluate(`${F}.stop()`);
    await press(ben, '.beeson-session-people .me');
    await ben.waitFor(`!!${item('Change Name…')}`);
    assert.equal(await ben.evaluate(`${F}.target`), null);
    await key(ben, 'Escape');
  });

  await t.test('two people who follow each other both stay where they are', async () => {
    await ana2.close();
    await front(ben);
    await ben.waitFor(`${C}.resolved().filter((r) => r.person === ${JSON.stringify(anaId)}).length === 1`);
    await show(ana, 'One');
    await show(ben, 'Two');
    await front(ana);
    await ana.evaluate(`${F}.start(${JSON.stringify(benId)})`);
    await ana.waitFor(`${HEADING} === 'Two'`);
    // Ben has heard that Ana follows Ben from Two before Ben follows Ana
    await front(ben);
    await ben.waitFor(`${C}.resolved().some((r) => r.person === ${JSON.stringify(anaId)} && r.following === ${JSON.stringify(benId)} && r.slide?.querySelector('h2')?.textContent === 'Two')`);
    await ben.evaluate(`${F}.start(${JSON.stringify(anaId)})`);
    // each page has heard that the other follows it
    await front(ana);
    await ana.waitFor(`${C}.resolved().some((r) => r.following === ${JSON.stringify(anaId)})`);
    await front(ben);
    await ben.waitFor(`${C}.resolved().some((r) => r.following === ${JSON.stringify(benId)})`);
    await converge(server, [ana, ben]);
    for (const [page, name, target] of [[ana, 'Ben', benId], [ben, 'Ana', anaId]]) {
      assert.equal(await page.evaluate(`${F}.target`), target);
      assert.equal(await page.evaluate(HEADING), 'Two');
      await untilPill(page, { text: `Following ${name}`, button: 'Stop', on: true });
    }
  });
  clean(ana);
  clean(ben);
});
