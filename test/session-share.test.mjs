// the avatars and the Share dialog of a session in Chrome, on the edit command started on a
// temporary talk folder: the avatars of two and of six people, one person with two pages, the
// initials, Change Name seen on the other page, a taken name, the Share dialog of a host against a
// relay started here, a guest who joins through the link, edits, and leaves, End session, and the
// title bar and the dialogs on a phone of 390 px

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { startRelay } from '../scripts/relay.mjs';
import { qr } from '../src/session/qr.ts';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, ONLINE, open, sessionUrl, show, talk, TALK } from './helpers/client.mjs';
import { press as key, type, typeKeys } from './helpers/editor.mjs';
import { until } from './helpers/session.mjs';
import { avatars, dialogButton, FITS, HIT, hold, item, menu, press, tap } from './helpers/share.mjs';

const SECRET = 'the secret of the group for this test';
const SHARE = 'dialog.beeson-session-share-dialog';

// the avatars of a page once it shows count of them
async function shown(page, count) {
  await front(page);
  await page.waitFor(`[...document.querySelectorAll('.beeson-session-people > button')].filter((b) => b.getClientRects().length).length === ${count}`);
  return avatars(page);
}

// a second page of the person who holds name, which answers Yes to the question of the join
async function samePerson(browser, url, name) {
  const page = await open(browser, url, { name, wait: false });
  await page.waitFor(`!!${dialogButton('beeson-edit-dialog', 'Yes, continue')}`);
  await press(page, dialogButton('beeson-edit-dialog', 'Yes, continue'));
  await page.waitFor(ONLINE);
  return page;
}

test('the avatars of two and of six people, one person with two pages, and the initials', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const ann = await open(browser, url, { name: 'Ann Smith' });
  const ben = await open(browser, url, { name: 'Ben Carter' });
  assert.deepEqual(await shown(ann, 2), [
    { text: 'BC', label: 'Ben Carter', me: false },
    { text: 'AS', label: 'Ann Smith, you', me: true },
  ]);
  assert.deepEqual(await shown(ben, 2), [
    { text: 'AS', label: 'Ann Smith', me: false },
    { text: 'BC', label: 'Ben Carter, you', me: true },
  ]);
  // the tone of the person, with dark text on --data-2 and --data-3
  const tones = await ann.evaluate(`[...document.querySelectorAll('.beeson-session-people > button')].map((b) => [b.style.getPropertyValue('--tone'), getComputedStyle(b).color])`);
  assert.deepEqual(tones, [['var(--data-3)', 'rgb(29, 29, 31)'], ['var(--data-2)', 'rgb(29, 29, 31)']]);

  await t.test('one person with two pages has one avatar', async () => {
    const again = await samePerson(browser, url, 'Ben Carter');
    assert.equal(await again.evaluate(`${C}.person`), await ben.evaluate(`${C}.person`));
    await until(() => ann.evaluate(`${C}.people.length === 3`), 'the third page in the people of Ann');
    assert.deepEqual((await shown(ann, 2)).map((a) => a.text), ['BC', 'AS']);
    assert.deepEqual((await shown(again, 2)).map((a) => a.text), ['AS', 'BC']);
    clean(again);
  });

  await t.test('six people: four others, +1 with the rest, and a digit for the same initials in the same tone', async () => {
    // the tones go round in the order of joining, hence Ana Silva has the tone of Ann Smith. the
    // pages are opened in a second Chrome, since one holds six connections to a host, and each
    // page holds one with its poll
    const other = await launch({ offline: false });
    t.after(() => other.close());
    const more = [];
    for (const name of ['Cleo Diaz', 'Dan Evans', 'Ana Silva', 'Fay Gold']) more.push(await open(other, url, { name }));
    const list = await shown(ann, 6);
    assert.deepEqual(list.map((a) => a.text), ['BC', 'CD', 'DE', 'AS2', '+1', 'AS']);
    assert.deepEqual(list.map((a) => a.label), ['Ben Carter', 'Cleo Diaz', 'Dan Evans', 'Ana Silva', '1 more person', 'Ann Smith, you']);
    const ana = more[2];
    assert.deepEqual((await shown(ana, 6)).map((a) => a.text), ['AS', 'BC', 'CD', 'DE', '+1', 'AS2']);
    await press(ann, '.beeson-session-people .more');
    await ann.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
    assert.deepEqual(await menu(ann), ['Fay Gold']);
    await key(ann, 'Escape');
    // the menu of another person holds the full name
    await press(ann, `.beeson-session-people button[aria-label="Cleo Diaz"]`);
    await ann.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
    assert.deepEqual(await menu(ann), ['Cleo Diaz']);
    await key(ann, 'Escape');
    // Shift+F10 and Enter with the focus on an avatar open its menu, also with an element selected,
    // whose menu the same keys open on the canvas
    await show(ann, 'One');
    await caretAtEnd(ann, `document.querySelector('.reveal .slides > section p')`);
    await key(ann, 'Escape');
    await ann.waitFor('window.BeesonEditor.selection().length === 1');
    await ann.evaluate(`document.querySelector('.beeson-session-people button[aria-label="Cleo Diaz"]').focus()`);
    for (const keys of ['Shift+F10', 'Enter']) {
      await key(ann, keys);
      await ann.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
      assert.deepEqual(await menu(ann), ['Cleo Diaz'], keys);
      await key(ann, 'Escape');
      await ann.waitFor(`!document.querySelector('.beeson-edit-menu') && document.activeElement?.getAttribute('aria-label') === 'Cleo Diaz'`);
    }
    // a person who leaves is announced, and the avatars move up
    const before = await ann.evaluate(`document.querySelector('.beeson-session-live').textContent`);
    await more[1].close();
    await until(async () => (await avatars(ann)).length === 5, 'Dan Evans to leave');
    assert.deepEqual((await avatars(ann)).map((a) => a.text), ['BC', 'CD', 'AS2', 'FG', 'AS']);
    await ann.waitFor(`document.querySelector('.beeson-session-live').textContent.includes('Dan Evans left the session.')`);
    assert.equal(before.includes('Fay Gold joined the session.'), true);
  });
  clean(ann);
  clean(ben);
});

test('Change Name is seen on the other page, also for one word and an emoji, and a taken name is asked about', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const ann = await open(browser, url, { name: 'Ann Smith' });
  const ben = await open(browser, url, { name: 'Ben Carter' });
  await shown(ben, 2);

  const rename = async (name) => {
    await press(ann, '.beeson-session-people .me');
    await ann.waitFor(`!!${item('Change Name…')}`);
    assert.deepEqual(await menu(ann), [await ann.evaluate(`${C}.name`), 'Change Name…']);
    await press(ann, item('Change Name…'));
    await ann.waitFor(`document.querySelector('dialog.beeson-session-rename')?.open && document.activeElement === document.querySelector('dialog.beeson-session-rename input')`);
    await ann.evaluate(`document.querySelector('dialog.beeson-session-rename input').select()`);
    await type(ann, name);
    await key(ann, 'Enter');
  };

  for (const [name, initials] of [['Cher', 'CH'], ['👩‍🚀 Ada Byron', '👩‍🚀B'], ['Ann Smith', 'AS']]) {
    await rename(name);
    await ann.waitFor(`!document.querySelector('dialog.beeson-session-rename') && ${C}.name === ${JSON.stringify(name)}`);
    await front(ben);
    const selector = `.beeson-session-people button[aria-label=${JSON.stringify(name)}]`;
    await ben.waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);
    assert.deepEqual((await avatars(ben))[0], { text: initials, label: name, me: false });
    assert.equal((await avatars(ann)).at(-1).text, initials);
  }

  await t.test('a name held by another person asks, and Use another name keeps the dialog', async () => {
    await rename('ben carter');
    await ann.waitFor(`[...document.querySelectorAll('dialog[open] h3')].some((h) => h.textContent === 'Ben Carter has joined this deck before. Is that you?')`);
    await press(ann, dialogButton('beeson-edit-dialog', 'Use another name'));
    await ann.waitFor(`document.querySelector('dialog.beeson-session-rename')?.open && document.activeElement === document.querySelector('dialog.beeson-session-rename input')`);
    assert.equal(await ann.evaluate(`${C}.name`), 'Ann Smith');
    await press(ann, dialogButton('beeson-session-rename', 'Cancel'));
    await ann.waitFor(`!document.querySelector('dialog.beeson-session-rename')`);
  });

  await t.test('Yes takes the person over after a reload, with one avatar for the two pages', async () => {
    await rename('ben carter');
    await ann.waitFor(`!!${dialogButton('beeson-edit-dialog', 'Yes, continue')}`);
    await press(ann, dialogButton('beeson-edit-dialog', 'Yes, continue')).catch((e) => {
      if (!/navigated or closed/.test(e.message)) throw e;
    });
    await until(() => ann.evaluate(`document.readyState === 'complete' && ${ONLINE} && ${C}.name === 'Ben Carter'`).catch(() => false), 'the page to join as Ben Carter');
    assert.equal(await ann.evaluate(`${C}.person`), await ben.evaluate(`${C}.person`));
    assert.deepEqual(await shown(ben, 1), [{ text: 'BC', label: 'Ben Carter, you', me: true }]);
  });
  clean(ben);
});
