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

test('the Share dialog connects a host to the relay, and a guest joins through the link, edits, and leaves', { timeout: 300_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET, guestMs: 10_000 });
  t.after(() => relay.close());
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const host = await open(browser, sessionUrl(server.edit), { name: 'Ann Smith' });

  const openShare = async (page) => {
    await press(page, '.beeson-session-share');
    await page.waitFor(`document.querySelector(${JSON.stringify(SHARE)})?.open`);
  };
  const connect = async (address, secret) => {
    await host.evaluate(`(() => {
      const set = (id, v) => { const el = document.getElementById(id); el.value = v; };
      set('beeson-session-relay', ${JSON.stringify(address)});
      set('beeson-session-secret', ${JSON.stringify(secret)});
    })()`);
    await press(host, dialogButton('beeson-session-share-dialog', 'Connect'));
  };
  const error = (id) => host.evaluate(`document.getElementById('beeson-session-${id}-error').textContent`);

  await openShare(host);
  await host.waitFor(`!!document.getElementById('beeson-session-relay')`);
  assert.equal(await host.evaluate(`document.querySelector('${SHARE} p').textContent`), 'Guests join through the relay of your group.');
  assert.equal(await host.evaluate(`document.getElementById('beeson-session-secret').type`), 'password');
  await press(host, `(${dialogButton('beeson-session-share-dialog', 'Show')})`);
  assert.equal(await host.evaluate(`document.getElementById('beeson-session-secret').type`), 'text');

  await connect('http://relay.example.org', SECRET);
  await host.waitFor(`!!document.getElementById('beeson-session-relay-error').textContent`);
  assert.equal(await error('relay'), 'The address of the relay must start with https://');
  await connect(relay.url, 'not the secret of the group');
  await host.waitFor(`!!document.getElementById('beeson-session-secret-error').textContent`);
  assert.match(await error('secret'), /^The relay refused the session with 401/);
  assert.equal(await error('relay'), '');

  await connect(relay.url, SECRET);
  await host.waitFor(`!!document.querySelector('${SHARE} input[readonly]')`);
  const link = `${relay.url}/${server.edit.key}/index.html?edit&session`;
  assert.equal(await host.evaluate(`document.querySelector('${SHARE} input[readonly]').value`), link);
  assert.equal(await host.evaluate(`document.querySelector('${SHARE} p').textContent`), 'Anyone with this link can edit the deck while the session runs.');
  assert.deepEqual(await host.evaluate(`[...document.querySelectorAll('${SHARE} .row button')].map((b) => b.textContent)`), ['End session', 'Done']);

  await t.test('the QR code holds the link, black on white with a quiet zone of four modules', async () => {
    const drawn = await host.evaluate(`(() => {
      const svg = document.querySelector('${SHARE} .qr svg');
      const r = svg.getBoundingClientRect();
      return { size: [r.width, r.height], box: svg.getAttribute('viewBox'), ground: svg.querySelector('rect').getAttribute('fill'), ink: svg.querySelector('path').getAttribute('fill'), d: svg.querySelector('path').getAttribute('d') };
    })()`);
    const want = qr(link);
    const n = want.length;
    assert.deepEqual(drawn.size, [160, 160]);
    assert.equal(drawn.box, `0 0 ${n + 8} ${n + 8}`);
    assert.deepEqual([drawn.ground, drawn.ink], ['#fff', '#000']);
    const got = Array.from({ length: n + 8 }, () => Array(n + 8).fill(false));
    for (const [, x, y, w] of drawn.d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) for (let i = 0; i < Number(w); i++) got[Number(y)][Number(x) + i] = true;
    assert.equal(drawn.d.replace(/M(\d+) (\d+)h(\d+)v1h-\d+z/g, ''), '');
    // the quiet zone is light, and the modules inside it are the code of the link
    assert.ok(got.every((row, y) => row.every((dark, x) => !dark || (x >= 4 && y >= 4 && x < n + 4 && y < n + 4))));
    assert.deepEqual(got.slice(4, n + 4).map((row) => row.slice(4, n + 4)), want);
  });

  await t.test('Copy puts the link into the clipboard and reads Copied', async () => {
    await host.send('Browser.grantPermissions', { origin: new URL(server.edit.url).origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
    await press(host, `${SHARE} button.copy`);
    await host.waitFor(`document.querySelector('${SHARE} button.copy').textContent === 'Copied'`);
    assert.equal(await host.evaluate('navigator.clipboard.readText()'), link);
    await host.waitFor(`document.querySelector('${SHARE} button.copy').textContent === 'Copy'`, 10_000);
  });

  // the guest pages are of the origin of the relay, hence their storage is apart from the host's
  const guest = await open(browser, link, { name: 'Gus Grant' });
  assert.equal(await guest.evaluate(`${C}.host`), false);

  await t.test('a guest who joins through the link edits, and sees the link and the people in Share', async () => {
    await show(guest, 'One');
    await caretAtEnd(guest, `document.querySelector('.reveal .slides > section h2')`);
    await typeKeys(guest, ' guest');
    assert.equal(await converge(server, [host, guest]), TALK.replace('<h2>One</h2>', '<h2>One guest</h2>'));
    await openShare(guest);
    assert.equal(await guest.evaluate(`document.querySelector('${SHARE} input[readonly]').value`), link);
    assert.equal(await guest.evaluate(`!!document.querySelector('${SHARE} .qr svg')`), true);
    assert.deepEqual(await guest.evaluate(`[...document.querySelectorAll('${SHARE} .row button')].map((b) => b.textContent)`), ['Done']);
    assert.equal(await guest.evaluate(`document.querySelector('${SHARE} h4').textContent`), 'People in this session (2)');
    assert.deepEqual(await guest.evaluate(`[...document.querySelectorAll('${SHARE} ul.people .name')].map((n) => n.textContent)`), ['Ann Smith', 'Gus Grant (you)']);
    await press(guest, dialogButton('beeson-session-share-dialog', 'Done'));
    await guest.waitFor(`!document.querySelector(${JSON.stringify(SHARE)})`);
    // the list of the host follows the guest
    await host.waitFor(`document.querySelector('${SHARE} h4').textContent === 'People in this session (2)'`);
  });

  await t.test('Leave Session leaves the session of a guest, who can join again', async () => {
    const lea = await open(browser, link, { name: 'Lea Lane' });
    await until(async () => (await avatars(host)).length === 3, 'Lea Lane on the page of the host');
    await press(lea, '.beeson-session-people .me');
    await lea.waitFor(`!!${item('Leave Session')}`);
    assert.deepEqual(await menu(lea), ['Lea Lane', 'Change Name…', 'Leave Session']);
    await press(lea, item('Leave Session'));
    await lea.waitFor(`document.querySelector('dialog.beeson-session-left')?.open`);
    assert.deepEqual(await lea.evaluate(`({ title: document.querySelector('dialog.beeson-session-left h3').textContent, connection: ${C}.connection, controls: !!document.querySelector('.beeson-session-share, .beeson-session-people, .beeson-session-state') })`), { title: 'You left the session', connection: 'ended', controls: false });
    await until(async () => (await avatars(host)).length === 2, 'Lea Lane to leave the page of the host');
    await lea.evaluate(`(${dialogButton('beeson-session-left', 'Join again')}).click()`).catch(() => {});
    await lea.waitFor(`document.readyState === 'complete' && ${ONLINE}`);
    await until(async () => (await avatars(host)).length === 3, 'Lea Lane to join again');
    await lea.close();
  });

  await t.test('End session asks, tells the guest, and the link answers as the relay does without a host', async () => {
    await front(host);
    await press(host, dialogButton('beeson-session-share-dialog', 'End session'));
    await host.waitFor(`[...document.querySelectorAll('dialog[open] p')].some((p) => p.textContent === 'Guests can no longer edit. The deck stays open for you.')`);
    await press(host, `([...document.querySelectorAll('dialog[open]')].pop().querySelector('button.primary'))`);
    await host.waitFor(`!!document.getElementById('beeson-session-relay')`);
    await front(guest);
    await guest.waitFor(`[...document.querySelectorAll('dialog[open] h3')].some((h) => h.textContent === 'Ann Smith ended the session')`);
    await until(async () => (await fetch(link)).status === 502, 'the link to answer 502');
    assert.equal(await host.evaluate(ONLINE), true);
  });
  // the refusals of the edit command to connect are answers of share with an error
  clean(host, [/\.session\/share/]);
  clean(guest, [/502/]);
});
