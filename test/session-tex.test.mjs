import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { startRelay } from '../scripts/relay.mjs';
import { deckTex } from '../scripts/tex.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { A, FILES, QUERY, copySlide, openDeck } from './helpers/cross-deck.mjs';
import { C, clean, converge, loads, ONLINE, open, sessionUrl, show, STATE } from './helpers/client.mjs';
import { press, type, typeKeys } from './helpers/editor.mjs';
import { goOffline, goOnline, tab } from './helpers/offline.mjs';
import { fileMenu } from './helpers/session-mode.mjs';
import { post, raw, startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const DIR = 'test/pages/tex-sheets';
const DECK = readFileSync(`${DIR}/index.html`, 'utf8').replaceAll('../../../theme/', 'theme/');
const SOURCES = ['preamble.tex', 'references.bib', 'tex.js', 'defs.tex', 'mymath.sty'];
const SECRET = 'a secret of the relay of the tests';
const LIST = '.beeson-cite';
const NUMBERS = `[...document.querySelectorAll('.reveal .slides cite[data-key]')].map((c) => c.dataset.key + '=' + (c.dataset.n ?? '') + (c.hasAttribute('data-missing') ? '!' : '')).join(' ')`;
const RED = `!!document.querySelector('tr[data-case="a macro that is not defined yet"]').querySelector('[fill="red"], [data-mjx-error]')`;
const HEAD = `document.querySelector('.reveal .slides p.theorem[data-kind="conjecture"]').dataset.head`;
const MISSING = [/404/];
const CUT = /^Failed to load resource: net::ERR_(CONTENT_LENGTH_MISMATCH|EMPTY_RESPONSE) \S+\/tex\.js$/;

let browser;
before(async () => {
  browser = await launch({ offline: false });
});
after(() => browser?.close());

async function texTalk(t, { names = SOURCES, change = (name, text) => text, env = {}, deck = DECK } = {}) {
  const folder = talkFolder(t, deck);
  for (const name of names) writeFileSync(join(folder.talk, name), change(name, readFileSync(join(DIR, name), 'utf8')));
  for (const dir of ['theme', 'brand']) cpSync(resolve(dir), join(folder.talk, dir), { recursive: true });
  const server = {
    ...folder,
    file: join(folder.talk, 'index.html'),
    edit: null,
    read: (name = 'index.html') => readFileSync(join(folder.talk, name), 'utf8'),
    write: (name, text) => writeFileSync(join(folder.talk, name), text),
    snapshot: () => Object.fromEntries(['index.html', ...names].map((name) => [name, { text: server.read(name), at: statSync(join(folder.talk, name)).mtimeMs }])),
  };
  server.before = server.snapshot();
  t.after(async () => {
    if (server.edit) await stopEdit(server.edit);
    rmSync(folder.root, { recursive: true, force: true });
  });
  server.edit = await startEdit(folder.talk, { env: { XDG_CONFIG_HOME: folder.config, APPDATA: folder.config, ...env } });
  return server;
}

async function pages(t, server, urls = [sessionUrl(server.edit), sessionUrl(server.edit)]) {
  const list = [];
  for (const [i, url] of urls.entries()) list.push(await open(browser, url, { name: ['Ann', 'Ben'][i] }));
  t.after(() => Promise.all(list.map((page) => page.close())));
  await converge(server, list);
  return list;
}

async function onEvery(list, expression, timeout = 30_000) {
  for (const [i, page] of list.entries()) {
    await front(page);
    await page.waitFor(expression, timeout).catch(async (e) => {
      throw new Error(`page ${i} reads ${NUMBERS} as ${JSON.stringify(await page.evaluate(NUMBERS))} and tex.js as ${JSON.stringify(await page.evaluate('Object.keys(window.beesonTex?.macros ?? {}).join(" ")'))}: ${e.message}`);
    });
  }
}

async function cite(page, expression, query, key) {
  await front(page);
  await caretAtEnd(page, expression);
  await type(page, ' \\cite{');
  await page.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length > 0`);
  await type(page, query);
  await page.waitFor(`document.querySelector('${LIST} li[aria-selected="true"]')?.dataset.key === ${JSON.stringify(key)}`);
  await press(page, 'Enter');
  await page.waitFor(`!document.querySelector('${LIST}')`);
}

test('a paper of references.bib that tex.js does not have, cited on one page, is written into tex.js, and is numbered the same on both pages', { timeout: 300_000 }, async (t) => {
  const server = await texTalk(t);
  const [ann, ben] = await pages(t, server);
  assert.ok(!server.read('tex.js').includes('szebehely1967'));
  await show(ann, 'Citations');
  await show(ben, 'Citations');
  await cite(ann, `document.querySelector('.reveal section.present p:nth-of-type(3)')`, 'szeb', 'szebehely1967');
  await until(() => server.read('tex.js').includes('"szebehely1967"'), 'the reference of szebehely1967 in tex.js');
  assert.equal(server.read('tex.js'), deckTex(server.file).text, 'tex.js is the one of npm run tex');
  await onEvery([ann, ben], `${NUMBERS} === 'koon2000=1 gomez2004=2 szebehely1967=3'`);
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('a citation deleted on one page is taken out of tex.js, and the others are numbered again on both pages', { timeout: 300_000 }, async (t) => {
  const server = await texTalk(t);
  const [ann, ben] = await pages(t, server);
  assert.ok(server.read('tex.js').includes('"koon2000"'));
  await show(ann, 'Citations');
  await show(ben, 'Citations');
  await front(ann);
  await ann.evaluate(`(() => {
    const c = document.querySelector('.reveal .slides cite[data-key="koon2000"]');
    c.closest('p').focus();
    const r = document.createRange();
    r.selectNode(c);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    return true;
  })()`);
  await press(ann, 'Backspace');
  await until(() => !server.read().includes('koon2000'), 'the citation of koon2000 deleted from index.html');
  await until(() => !server.read('tex.js').includes('koon2000'), 'the reference of koon2000 taken out of tex.js');
  assert.equal(server.read('tex.js'), deckTex(server.file).text, 'tex.js is the one of npm run tex');
  await onEvery([ann, ben], `${NUMBERS} === 'gomez2004=1'`);
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('a citation of a paper of tex.js put into a text element by one page is numbered on the other page', { timeout: 300_000 }, async (t) => {
  const server = await texTalk(t);
  const [ann, ben] = await pages(t, server);
  const tex = server.read('tex.js');
  await show(ann, 'Citations');
  await show(ben, 'Citations');
  await cite(ann, `document.querySelector('.reveal section.present h2')`, 'gomez', 'gomez2004');
  await converge(server, [ann, ben]);
  await onEvery([ann, ben], `${NUMBERS} === 'gomez2004=1 koon2000=2 gomez2004=1'`);
  assert.equal(server.read('tex.js'), tex, 'tex.js is written for a paper that it has');
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('a citation typed with its closing brace in a session is taken back by two undos, on both pages and in index.html', { timeout: 300_000 }, async (t) => {
  const server = await texTalk(t);
  const [ann, ben] = await pages(t, server);
  await show(ann, 'Citations');
  await show(ben, 'Citations');
  const LAST = `[...document.querySelectorAll('.reveal section.present p')].at(-1)`;
  await front(ann);
  await caretAtEnd(ann, LAST);
  await type(ann, ' \\cite{');
  await ann.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length > 0`);
  await type(ann, 'gomez2004}');
  await ann.waitFor(`!document.querySelector('${LIST}')`);
  await converge(server, [ann, ben]);
  assert.match(server.read(), /transfer<cite data-key="gomez2004"><\/cite><\/p>/);
  await ann.evaluate('window.BeesonEditor.undo().then(() => true)');
  await ann.evaluate('window.BeesonEditor.undo().then(() => true)');
  await converge(server, [ann, ben]);
  assert.equal(server.read(), server.before['index.html'].text);
  await front(ben);
  assert.equal(await ben.evaluate(`${LAST}.textContent`), 'Invariant manifolds guide a low-energy transfer');
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('a macro added to preamble.tex on disk is written into tex.js, and is drawn on a page of the host and on a page of a guest through the relay', { timeout: 240_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => relay.close());
  const server = await texTalk(t);
  const shared = await post(server.edit.port, `${server.edit.base}.session/share`, { relay: relay.url, secret: SECRET });
  assert.equal(shared.status, 200, shared.text);
  const [host, guest] = await pages(t, server, [sessionUrl(server.edit), shared.json().link]);
  assert.equal(await host.evaluate('window.BeesonSession.client().host'), true);
  assert.equal(await guest.evaluate('window.BeesonSession.client().host'), false);
  await onEvery([host, guest], RED);
  server.write('preamble.tex', `${server.read('preamble.tex')}\\newcommand{\\Q}{\\mathbb{Q}}\n`);
  await until(() => server.read('tex.js').includes('"Q"'), 'the macro Q in tex.js');
  assert.equal(server.read('tex.js'), deckTex(server.file).text, 'tex.js is the one of npm run tex');
  await onEvery([host, guest], `!${RED}`);
  assert.equal(await guest.evaluate('window.beesonTex.macros.Q'), '\\mathbb{Q}');
  clean(host, MISSING);
  clean(guest, MISSING);
});

test('a formula of an open Edit Formula field is applied after the macro that it uses is added to preamble.tex on disk, which draws the formula again', { timeout: 300_000 }, async (t) => {
  const server = await texTalk(t);
  const [ann] = await pages(t, server, [sessionUrl(server.edit)]);
  await show(ann, 'Macros');
  await front(ann);
  await ann.evaluate(`(() => {
    const c = document.querySelector('tr[data-case="a macro that is not defined yet"] mjx-container');
    window.__formula = c;
    c.focus();
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  })()`);
  await ann.waitFor(`document.querySelector('.beeson-math textarea')?.value === '\\\\Q'`);
  server.write('preamble.tex', `${server.read('preamble.tex')}\\newcommand{\\Q}{\\mathbb{Q}}\n`);
  await ann.waitFor(`!!window.beesonTex.macros.Q && !window.__formula.isConnected`);
  await front(ann);
  await press(ann, 'End');
  await typeKeys(ann, '^n');
  await press(ann, 'Mod+Enter');
  await until(() => server.read().includes('<td>\\(\\Q^n\\)</td>'), 'the formula applied in index.html', 30_000).catch(async (e) => {
    throw new Error(`the field reads ${JSON.stringify(await ann.evaluate(`document.querySelector('.beeson-math')?.innerText ?? null`))}: ${e.message}`);
  });
  clean(ann, MISSING);
});

const CELL = 'tr[data-case="a macro that is not defined yet"] td';
const CHANGED = 'Another person changed the formulas of this text. Copy your TeX, press Cancel, and open the formula again.';
const FIELD = `JSON.stringify({ open: !!document.querySelector('.beeson-math'), tex: document.querySelector('.beeson-math textarea')?.value ?? null, message: document.querySelector('.beeson-math .error')?.textContent ?? null })`;
const cellOf = (server) => server.read().match(/<tr data-case="a macro that is not defined yet"><td>(.*?)<\/td><\/tr>/)[1];

async function fieldOpen(t, cell, index) {
  const server = await texTalk(t, { deck: DECK.replace('<td>\\(\\Q\\)</td>', `<td>${cell}</td>`) });
  const [ann, ben] = await pages(t, server);
  await show(ben, 'Theorems');
  await show(ann, 'Macros');
  await front(ann);
  await ann.evaluate(`(() => {
    const c = document.querySelectorAll('${CELL} mjx-container')[${index}];
    c.focus();
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  })()`);
  await ann.waitFor(`!!document.querySelector('.beeson-math textarea')`);
  await press(ann, 'End');
  await typeKeys(ann, '^n');
  await ann.waitFor(`document.querySelector('.beeson-math textarea').value.endsWith('^n')`);
  return { server, ann, ben };
}

async function other(server, from, to) {
  const { port, base } = server.edit;
  const bo = (await post(port, `${base}.session/hello`, { name: 'Bo' })).json();
  const at = bo.text.indexOf(from);
  assert.ok(at >= 0, from);
  const op = (await post(port, `${base}.session/op`, { token: bo.token, seq: 1, base: bo.v, patches: [{ start: at, end: at + from.length, text: to }] })).json();
  assert.equal(op.ok, true, JSON.stringify(op));
}

async function refused(server, ann, ben, cell, tex) {
  await front(ann);
  await ann.evaluate(`document.querySelector('.beeson-math textarea').focus(), true`);
  await press(ann, 'Mod+Enter');
  await ann.waitFor(`document.querySelector('.beeson-math .error')?.textContent === ${JSON.stringify(CHANGED)}`, 30_000).catch(async (e) => {
    throw new Error(`the field reads ${await ann.evaluate(FIELD)}, and the cell in index.html ${cellOf(server)}: ${e.message}`);
  });
  await converge(server, [ann, ben]);
  assert.equal(cellOf(server), cell);
  assert.deepEqual(JSON.parse(await ann.evaluate(FIELD)), { open: true, tex, message: CHANGED });
}

test('Apply in an open Edit Formula field is refused with a message after another person adds a formula before the edited one in the same text element', { timeout: 300_000 }, async (t) => {
  const { server, ann, ben } = await fieldOpen(t, '\\(\\half\\) and \\(\\Q\\)', 1);
  await other(server, '<td>\\(\\half\\) and', '<td>\\(\\vb{y}\\), \\(\\half\\) and');
  await ann.waitFor(`document.querySelectorAll('${CELL} mjx-container').length === 3`, 30_000);
  await refused(server, ann, ben, '\\(\\vb{y}\\), \\(\\half\\) and \\(\\Q\\)', '\\Q^n');
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('Apply in an open Edit Formula field is refused with a message after another person removes the edited formula, which leaves another one at its place', { timeout: 300_000 }, async (t) => {
  const { server, ann, ben } = await fieldOpen(t, '\\(\\Q\\) and \\(\\half\\)', 0);
  await other(server, '<td>\\(\\Q\\) and ', '<td>');
  await ann.waitFor(`document.querySelectorAll('${CELL} mjx-container').length === 1`, 30_000);
  await refused(server, ann, ben, '\\(\\half\\)', '\\Q^n');
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('Apply in an open Edit Formula field writes the formula after another person changes a different text element', { timeout: 300_000 }, async (t) => {
  const { server, ann, ben } = await fieldOpen(t, '\\(\\half\\) and \\(\\Q\\)', 1);
  await other(server, '<td>\\(\\dist\\)</td>', '<td>\\(\\dist\\) and \\(\\vb{y}\\)</td>');
  await ann.waitFor(`document.querySelectorAll('tr[data-case="a macro of a local package"] mjx-container').length === 2`, 30_000);
  await front(ann);
  await ann.evaluate(`document.querySelector('.beeson-math textarea').focus(), true`);
  await press(ann, 'Mod+Enter');
  await until(() => cellOf(server) === '\\(\\half\\) and \\(\\Q^n\\)', 'the formula applied in index.html', 30_000).catch(async (e) => {
    throw new Error(`the field reads ${await ann.evaluate(FIELD)}, and the cell in index.html ${cellOf(server)}: ${e.message}`);
  });
  await converge(server, [ann, ben]);
  assert.ok(server.read().includes('<td>\\(\\dist\\) and \\(\\vb{y}\\)</td>'));
  assert.equal(await ann.evaluate(`!!document.querySelector('.beeson-math')`), false);
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('a new formula whose commit at a click away is refused, since another person changed it, keeps its Insert Formula field open with the typed TeX and the message', { timeout: 300_000 }, async (t) => {
  const server = await texTalk(t);
  const [ann, ben] = await pages(t, server);
  await show(ben, 'Macros');
  await show(ann, 'Citations');
  await front(ann);
  await ann.evaluate(`(() => {
    document.activeElement?.blur();
    window.__before = new Set(document.querySelectorAll('.reveal .slides mjx-container'));
    window.BeesonEditor.exec('insert.formula');
    return true;
  })()`);
  await ann.waitFor(`!!document.querySelector('.beeson-math textarea') && document.activeElement === document.querySelector('.beeson-math textarea')`);
  await ann.evaluate(`(window.__made = [...document.querySelectorAll('.reveal .slides mjx-container')].find((c) => !window.__before.has(c)), true)`);
  await typeKeys(ann, 'y');
  await ann.waitFor(`document.querySelector('.beeson-math textarea').value === 'y'`);
  await converge(server, [ann, ben]);
  await other(server, '\\[\\]', '\\[x\\]');
  await ann.waitFor(`!window.__made.isConnected`, 30_000);
  await front(ann);
  await ann.evaluate(`document.querySelector('.reveal section.present h2').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })), true`);
  await ann.waitFor(`!document.querySelector('.beeson-math') || document.querySelector('.beeson-math .error')?.textContent === ${JSON.stringify(CHANGED)}`, 30_000);
  await converge(server, [ann, ben]);
  assert.ok(server.read().includes('\\[x\\]'), `index.html keeps the formula of the other person, and holds ${server.read().match(/\\\[.*?\\\]/g)}`);
  assert.deepEqual(JSON.parse(await ann.evaluate(FIELD)), { open: true, tex: 'y', message: CHANGED });
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('a new formula that another person removes while its Insert Formula field is open closes the field', { timeout: 300_000 }, async (t) => {
  const server = await texTalk(t);
  const [ann, ben] = await pages(t, server);
  await show(ben, 'Macros');
  await show(ann, 'Citations');
  await front(ann);
  await ann.evaluate(`(document.activeElement?.blur(), window.BeesonEditor.exec('insert.formula'), true)`);
  await ann.waitFor(`!!document.querySelector('.beeson-math textarea') && document.activeElement === document.querySelector('.beeson-math textarea')`);
  await typeKeys(ann, 'y');
  await ann.waitFor(`document.querySelector('.beeson-math textarea').value === 'y'`);
  await converge(server, [ann, ben]);
  const made = server.read().match(/\n *<div class="math"[^\n]*>\\\[\\\]<\/div>/);
  assert.ok(made, 'the new formula is not in index.html');
  await other(server, made[0], '');
  await ann.waitFor(`!document.querySelector('.beeson-math')`, 30_000).catch(async (e) => {
    throw new Error(`the field reads ${await ann.evaluate(FIELD)}: ${e.message}`);
  });
  await converge(server, [ann, ben]);
  assert.doesNotMatch(server.read(), /<div class="math"[^\n]*>\\\[\\\]<\/div>/);
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('the list of Insert Citation closes when another person removes its text element', { timeout: 300_000 }, async (t) => {
  const server = await texTalk(t);
  const [ann, ben] = await pages(t, server);
  await show(ben, 'Macros');
  await show(ann, 'Citations');
  await front(ann);
  const para = `[...document.querySelectorAll('.reveal section.present p')].find((p) => p.textContent.startsWith('Invariant'))`;
  await caretAtEnd(ann, para);
  await ann.evaluate(`(window.BeesonEditor.exec('insert.citation'), true)`);
  await ann.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length > 0 && document.activeElement === document.querySelector('${LIST} input')`);
  await other(server, '\n      <p>Invariant manifolds guide a low-energy transfer</p>', '');
  await ann.waitFor(`!${para}`, 30_000);
  await ann.waitFor(`!document.querySelector('${LIST}')`, 30_000);
  await converge(server, [ann, ben]);
  assert.ok(!server.read().includes('Invariant manifolds'));
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('a tex.js replaced from outside, as npm run tex writes it, draws its macros and kinds of theorem on both pages', { timeout: 300_000 }, async (t) => {
  const server = await texTalk(t);
  const [ann, ben] = await pages(t, server);
  await onEvery([ann, ben], `${RED} && ${HEAD} === 'conjecture.'`);
  const tex = server.read('tex.js');
  const changed = tex
    .replace('  "macros": {\n', '  "macros": {\n    "Q": "\\\\mathbb{Q}",\n')
    .replace('  "theorems": {\n', '  "theorems": {\n    "conjecture": {"title":"Conjecture","style":"plain","counter":"theorem"},\n');
  assert.notEqual(changed, tex);
  server.write('tex.js', changed);
  await onEvery([ann, ben], `!${RED} && ${HEAD} === 'Conjecture 2.'`);
  assert.equal(server.read('tex.js'), changed, 'the edit command writes over a tex.js changed from outside');
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('a tex.js read cut off while a program writes it is not run, and the page draws the whole tex.js once it is written', { timeout: 300_000 }, async (t) => {
  const server = await texTalk(t);
  const [ann] = await pages(t, server, [sessionUrl(server.edit)]);
  await onEvery([ann], `${RED} && ${HEAD} === 'conjecture.'`);
  const changed = server.read('tex.js').replace('  "macros": {\n', '  "macros": {\n    "Q": "\\\\mathbb{Q}",\n');
  await ann.evaluate(`(${C}.on('tex', () => (window.__drawn = ${C}.tex)), true)`);
  const count = await ann.evaluate(`${C}.tex`);
  server.write('tex.js', changed.slice(0, changed.indexOf('mathbb')));
  await ann.waitFor(`${C}.tex !== ${count} && window.__drawn === ${C}.tex`, 30_000);
  assert.equal(await ann.evaluate(RED), true, 'the page keeps the macros of the tex.js before');
  server.write('tex.js', changed);
  await onEvery([ann], `!${RED}`);
  clean(ann, [...MISSING, CUT]);
});

test('a page that stays open across a kill and a start of the edit command draws a tex.js changed after the start, also when the new count of the changes reaches the count of the page', { timeout: 300_000, skip: process.platform === 'win32' && 'signals' }, async (t) => {
  const server = await texTalk(t);
  const page = await tab(browser, sessionUrl(server.edit));
  t.after(() => page.close());
  await converge(server, [page]);
  const add = (name) => server.write('tex.js', server.read('tex.js').replace('  "macros": {\n', `  "macros": {\n    "${name}": "\\\\mathbb{${name}}",\n`));
  add('Qa');
  await page.waitFor(`window.beesonTex.macros.Qa === '\\\\mathbb{Qa}'`);
  await page.evaluate('(window.__kept = true)');
  await goOffline(page);
  const { port } = server.edit;
  server.edit.child.kill('SIGKILL');
  await server.edit.exited;
  server.edit = await startEdit(server.talk, { port, env: { XDG_CONFIG_HOME: server.config, APPDATA: server.config } });
  const hello = (await post(port, `${server.edit.base}.session/hello`, { name: 'Probe' })).json();
  add('Qb');
  await until(async () => (await raw(port, 'GET', `${server.edit.base}.session/events?token=${hello.token}&since=${hello.v}`)).json().tex !== hello.tex, 'the change of tex.js counted by the new edit command', 60_000);
  await goOnline(page);
  await page.waitFor(ONLINE);
  await page.waitFor(`window.beesonTex.macros.Qb === '\\\\mathbb{Qb}'`, 30_000).catch(async (e) => {
    throw new Error(`the page holds the count ${await page.evaluate(`${C}.tex`)}, and the edit command ${hello.tex}: ${e.message}`);
  });
  assert.equal(await page.evaluate('window.__kept'), true, 'the page is not loaded again');
});

test('a page shows that tex.js cannot be written on the host machine, until a write succeeds', { timeout: 300_000 }, async (t) => {
  const server = await texTalk(t);
  rmSync(join(server.talk, 'tex.js'));
  mkdirSync(join(server.talk, 'tex.js'));
  const [ann] = await pages(t, server, [sessionUrl(server.edit)]);
  const { port, base } = server.edit;
  const bo = (await post(port, `${base}.session/hello`, { name: 'Bo' })).json();
  const at = bo.text.indexOf('low-energy transfer</p>') + 'low-energy transfer'.length;
  const op = (await post(port, `${base}.session/op`, { token: bo.token, seq: 1, base: bo.v, patches: [{ start: at, end: at, text: '<cite data-key="szebehely1967"></cite>' }] })).json();
  assert.equal(op.ok, true);
  await ann.waitFor(`${STATE}?.startsWith("tex.js cannot be written on the host machine: ")`, 30_000);
  rmSync(join(server.talk, 'tex.js'), { recursive: true });
  await until(() => existsSync(join(server.talk, 'tex.js')) && server.read('tex.js').includes('"szebehely1967"'), 'the reference of szebehely1967 in tex.js', 30_000);
  assert.equal(server.read('tex.js'), deckTex(server.file).text, 'tex.js is the one of npm run tex');
  await ann.waitFor(`${STATE} === 'Saved to index.html'`, 30_000);
  clean(ann, MISSING);
});

test('a page whose fetch of a changed tex.js fails fetches it again, and draws it', { timeout: 300_000 }, async (t) => {
  const server = await texTalk(t, { env: { SLIDES_POLL_HOLD_MS: '1000' } });
  const script = `{
    window.__texFetches = 0;
    window.__texFail = 0;
    const fetched = window.fetch;
    window.fetch = function (input, init) {
      if (new URL(input instanceof Request ? input.url : String(input), location.href).pathname.endsWith('/tex.js')) {
        window.__texFetches++;
        if (window.__texFail > 0) {
          window.__texFail--;
          return Promise.reject(new TypeError('Failed to fetch'));
        }
      }
      return fetched.call(this, input, init);
    };
  }`;
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben', script });
  t.after(() => Promise.all([ann.close(), ben.close()]));
  await converge(server, [ann, ben]);
  await onEvery([ann, ben], RED);
  await ben.waitFor('window.__texFetches === 1');
  await ben.evaluate('(window.__texFail = 1)');
  server.write('tex.js', server.read('tex.js').replace('  "macros": {\n', '  "macros": {\n    "Q": "\\\\mathbb{Q}",\n'));
  await ben.waitFor('window.__texFetches >= 2 && window.__texFail === 0');
  await onEvery([ann, ben], `!${RED}`);
  assert.equal(await ben.evaluate('window.__texFetches'), 3);
  clean(ann, MISSING);
  clean(ben, [...MISSING, /Failed to fetch/]);
});

test('a start of the edit command and a join of two pages do not write any file of the talk folder', { timeout: 180_000 }, async (t) => {
  const server = await texTalk(t, { change: (name, text) => (name === 'tex.js' ? text.replace('    "half": "\\\\frac{1}{2}",\n', '') : text) });
  assert.notEqual(server.read('tex.js'), deckTex(server.file).text);
  const [ann, ben] = await pages(t, server);
  await show(ann, 'Citations');
  await show(ben, 'Citations');
  assert.deepEqual(server.snapshot(), server.before);
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('tex.js is not written in a talk folder without preamble.tex and references.bib', { timeout: 180_000 }, async (t) => {
  const server = await texTalk(t, { names: ['tex.js'] });
  const [ann, ben] = await pages(t, server);
  server.write('index.html', server.read().replace('low-energy transfer</p>', 'low-energy transfer<cite data-key="szebehely1967"></cite></p>'));
  await converge(server, [ann, ben]);
  await show(ann, 'Citations');
  await caretAtEnd(ann, `document.querySelector('.reveal section.present p:nth-of-type(2)')`);
  await typeKeys(ann, ' again');
  await until(() => server.read().includes('halo orbits<cite data-key="gomez2004"></cite>. again'), 'the typing in index.html');
  await converge(server, [ann, ben]);
  assert.deepEqual(server.snapshot()['tex.js'], server.before['tex.js']);
  clean(ann, MISSING);
  clean(ben, MISSING);
});

async function search(page, n, query) {
  await show(page, 'Citations');
  await page.waitFor(`(() => {
    const host = document.querySelector('.reveal section.present p:nth-of-type(${n})');
    host?.focus();
    if (!host || document.activeElement !== host) return false;
    const r = document.createRange();
    r.selectNodeContents(host);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    return true;
  })()`).catch(async (e) => {
    throw new Error(`the paragraph ${n} does not take the caret, with ${await page.evaluate(`JSON.stringify({ active: document.activeElement?.tagName, dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.className), editable: document.querySelector('.reveal section.present p:nth-of-type(${n})')?.isContentEditable })`)}: ${e.message}`);
  });
  await page.evaluate(`Promise.resolve(window.BeesonEditor.exec('insert.citation')).then(() => true)`);
  await page.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length > 0`);
  await page.evaluate(`(() => {
    const input = document.querySelector('${LIST} input');
    input.value = ${JSON.stringify(query)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
}

test('a paper added to references.bib on disk is found by a new search on a page of the host and on a page of a guest through the relay, without a reload', { timeout: 300_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => relay.close());
  const server = await texTalk(t);
  const shared = await post(server.edit.port, `${server.edit.base}.session/share`, { relay: relay.url, secret: SECRET });
  assert.equal(shared.status, 200, shared.text);
  const list = await pages(t, server, [sessionUrl(server.edit), shared.json().link]);
  const tex = server.read('tex.js');
  for (const [i, page] of list.entries()) {
    await search(page, 3 - i, 'conley');
    await page.waitFor(`document.querySelector('${LIST} .note').textContent === ${JSON.stringify('No entry of references.bib matches conley. Paste the BibTeX of the paper to add it.')}`);
    await press(page, 'Escape');
    await page.waitFor(`!document.querySelector('${LIST}')`);
  }
  server.write('references.bib', `${server.read('references.bib')}\n@article{conley1968,\n  author = {Conley, Charles},\n  title = {Low energy transit orbits in the restricted three-body problem},\n  year = {1968},\n}\n`);
  for (const [i, page] of list.entries()) {
    await search(page, 3 - i, 'conley');
    await page.waitFor(`(() => {
      document.querySelector('${LIST} input').dispatchEvent(new Event('input', { bubbles: true }));
      return !!document.querySelector('${LIST} li[data-key="conley1968"]');
    })()`, 30_000);
    await press(page, 'Escape');
    assert.equal(await loads(page), 1);
  }
  assert.equal(server.read('tex.js'), tex, 'tex.js does not have an uncited paper');
  clean(list[0], MISSING);
  clean(list[1], MISSING);
});

const SHEET = 'dialog.beeson-edit-tex[open]';

async function sheet(page, id) {
  await front(page);
  await page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${JSON.stringify(id)})).then(() => true)`);
  await page.waitFor(`!!document.querySelector('${SHEET}:not([aria-busy])')`);
}

async function typeInto(page, text, find = null) {
  await front(page);
  await page.evaluate(`(() => {
    const t = document.querySelector('${SHEET} textarea');
    t.focus();
    const at = ${find === null ? 't.value.length' : `t.value.indexOf(${JSON.stringify(find)})`};
    t.setSelectionRange(at, ${find === null ? 'at' : `at + ${JSON.stringify(find)}.length`});
    return true;
  })()`);
  await type(page, text);
}

async function holdSaves(page) {
  await page.evaluate(`(() => {
    const fetch = (window.__fetch ??= window.fetch);
    window.__held = [];
    window.fetch = function (input, init) {
      if (!String(input).includes('/.session/source/')) return fetch.call(this, input, init);
      return new Promise((done) => window.__held.push(() => done(fetch.call(window, input, init))));
    };
    return true;
  })()`);
  return {
    count: () => page.evaluate('window.__held.length'),
    release: () => page.evaluate(`(() => { const held = window.__held; window.__held = []; window.fetch = window.__fetch; held.forEach((go) => go()); return held.length; })()`),
  };
}

test('File > Preamble… of a guest of the relay and of the host saves preamble.tex through the edit command, and every page draws the new macro and kind of theorem', { timeout: 300_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => relay.close());
  const server = await texTalk(t);
  const shared = await post(server.edit.port, `${server.edit.base}.session/share`, { relay: relay.url, secret: SECRET });
  assert.equal(shared.status, 200, shared.text);
  const [host, guest] = await pages(t, server, [sessionUrl(server.edit), shared.json().link]);
  for (const id of ['file.preamble', 'file.bibliography']) assert.equal(await guest.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)}).enabled`), true, `${id} is enabled in a session`);
  await onEvery([host, guest], `${RED} && ${HEAD} === 'conjecture.'`);
  await sheet(guest, 'file.preamble');
  await typeInto(guest, '\\newcommand{\\Q}{\\mathbb{Q}}\n');
  await until(() => server.read('preamble.tex').endsWith('\\newcommand{\\Q}{\\mathbb{Q}}\n'), 'the macro Q in preamble.tex', 30_000);
  await until(() => server.read('tex.js').includes('"Q"'), 'the macro Q in tex.js', 30_000);
  assert.equal(server.read('tex.js'), deckTex(server.file).text, 'tex.js is the one of npm run tex');
  await onEvery([host, guest], `!${RED}`);
  await sheet(host, 'file.preamble');
  await host.waitFor(`document.querySelector('${SHEET} textarea').value.includes('\\\\newcommand{\\\\Q}')`, 30_000);
  await typeInto(host, '\\newtheorem{conjecture}[theorem]{Conjecture}\n');
  await press(host, 'Escape');
  await until(() => server.read('tex.js').includes('"conjecture"'), 'the kind conjecture in tex.js', 30_000);
  await onEvery([host, guest], `${HEAD} === 'Conjecture 2.'`);
  await guest.waitFor(`document.querySelector('${SHEET} textarea').value.includes('{Conjecture}')`, 30_000);
  assert.equal(await guest.evaluate(`document.querySelector('${SHEET} .note').textContent`), '');
  clean(host, MISSING);
  clean(guest, MISSING);
});

test('a save of a sheet on a text that another person saved since is refused, merged when the edits are apart, and the person is told and chooses when they clash', { timeout: 300_000 }, async (t) => {
  const server = await texTalk(t);
  const [ann, ben] = await pages(t, server);
  const preamble = server.read('preamble.tex');
  await sheet(ann, 'file.preamble');
  await sheet(ben, 'file.preamble');
  const held = await holdSaves(ben);
  await typeInto(ben, '\\boldsymbol{#1}\\,', '\\boldsymbol{#1}');
  await until(() => held.count(), 'the held save of Ben', 30_000);
  await typeInto(ann, '\\newcommand{\\Q}{\\mathbb{Q}}\n');
  await until(() => server.read('preamble.tex').includes('\\Q'), 'the save of Ann', 30_000);
  await held.release();
  await until(() => server.read('preamble.tex').includes('\\boldsymbol{#1}\\,'), 'the merged save of Ben', 30_000);
  assert.equal(server.read('preamble.tex'), `${preamble.replace('\\boldsymbol{#1}', '\\boldsymbol{#1}\\,')}\\newcommand{\\Q}{\\mathbb{Q}}\n`);
  await ben.waitFor(`document.querySelector('${SHEET} .note').textContent === 'Someone else saved preamble.tex since you read it, and your edits are merged into their text.'`, 30_000);
  await ann.waitFor(`document.querySelector('${SHEET} textarea').value.includes('\\\\,')`, 30_000);
  const again = await holdSaves(ben);
  await typeInto(ben, '\\newcommand{\\R}{\\mathbb{R}}\n');
  await until(() => again.count(), 'the held save of Ben', 30_000);
  await typeInto(ann, '\\newcommand{\\C}{\\mathbb{C}}\n');
  await until(() => server.read('preamble.tex').includes('\\C'), 'the save of Ann', 30_000);
  const anns = server.read('preamble.tex');
  await again.release();
  const clash = 'Someone else saved preamble.tex since you read it, and your edits clash with theirs. Keep your text, or use theirs.';
  await ben.waitFor(`document.querySelector('${SHEET} .note').textContent === ${JSON.stringify(clash)}`, 30_000);
  assert.ok((await ben.evaluate(`document.querySelector('${SHEET} textarea').value`)).includes('\\mathbb{R}'), 'the text of Ben is kept in his sheet');
  assert.equal(server.read('preamble.tex'), anns);
  await ben.evaluate(`[...document.querySelectorAll('${SHEET} button')].find((b) => b.textContent === 'Keep My Text').click(), true`);
  await until(() => server.read('preamble.tex').includes('\\R'), 'the text of Ben saved over the text of Ann', 30_000);
  assert.ok(!server.read('preamble.tex').includes('\\C'));
  await ben.waitFor(`document.querySelector('${SHEET} .note').textContent === ''`, 30_000);
  clean(ann, MISSING);
  clean(ben, [...MISSING, /409 \(Conflict\)/]);
});

test('the people who have a sheet open are shown in the same sheet of the others, and in their status', { timeout: 300_000 }, async (t) => {
  const server = await texTalk(t);
  const [ann, ben] = await pages(t, server);
  await sheet(ann, 'file.bibliography');
  await sheet(ben, 'file.bibliography');
  await ben.waitFor(`document.querySelector('${SHEET} .beeson-sheet-presence')?.textContent === 'Annhas references.bib open'`, 30_000);
  await ann.waitFor(`document.querySelector('${SHEET} .beeson-sheet-presence')?.textContent === 'Benhas references.bib open'`, 30_000);
  assert.equal(await ben.evaluate(`document.querySelector('${SHEET} .beeson-sheet-presence .flag').classList.contains('c' + ${C}.resolved()[0].color)`), true, 'the flag is in the tone of Ann');
  await ben.waitFor(`[...document.querySelectorAll('.beeson-session-people .beeson-session-avatar[data-person]')].some((b) => b.getAttribute('aria-label').endsWith('editing references.bib'))`, 30_000);
  await front(ann);
  await press(ann, 'Escape');
  await ben.waitFor(`!document.querySelector('.beeson-sheet-presence')`, 30_000);
  await press(ben, 'Escape');
  await sheet(ben, 'file.preamble');
  await sheet(ann, 'file.bibliography');
  await front(ben);
  assert.equal(await ben.evaluate(`!!document.querySelector('.beeson-sheet-presence')`), false, 'a person with the other sheet open is not shown');
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('a BibTeX entry pasted into the list of Insert > Citation… in a session is added to references.bib through the edit command, and is cited on every page', { timeout: 300_000 }, async (t) => {
  const server = await texTalk(t);
  const [ann, ben] = await pages(t, server);
  const bib = server.read('references.bib');
  await show(ann, 'Citations');
  await show(ben, 'Citations');
  await front(ann);
  await caretAtEnd(ann, `document.querySelector('.reveal section.present p:nth-of-type(3)')`);
  await ann.evaluate(`Promise.resolve(window.BeesonEditor.exec('insert.citation')).then(() => true)`);
  await ann.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length === 3`);
  assert.equal(await ann.evaluate(`document.querySelector('${LIST} input').placeholder`), 'Author, year, title, key, or pasted BibTeX');
  const entry = '@article{conley1968, author = {Conley, Charles}, title = {Low energy transit orbits}, year = {1968}}';
  await ann.evaluate(`(() => {
    const data = new DataTransfer();
    data.setData('text/plain', ${JSON.stringify(entry)});
    document.querySelector('${LIST} input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    return true;
  })()`);
  await until(() => server.read('references.bib').includes(entry), 'the entry in references.bib', 30_000);
  assert.ok(server.read('references.bib').startsWith(bib));
  await until(() => server.read('tex.js').includes('"conley1968"'), 'the reference of conley1968 in tex.js', 30_000);
  await onEvery([ann, ben], `${NUMBERS} === 'koon2000=1 gomez2004=2 conley1968=3'`);
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('the rows of the File menu in a session fit the menu on a phone of 390 px and on a screen of 1440 px, also with wider letters', { timeout: 300_000 }, async (t) => {
  const server = await texTalk(t);
  const wide = '.beeson-edit-menu { letter-spacing: 1px; }';
  for (const [name, width, height, mobile, style] of [['Ann', 390, 844, true], ['Ben', 1440, 900, false], ['Cy', 390, 844, true, wide], ['Dee', 320, 700, true, wide]]) {
    const page = await open(browser, sessionUrl(server.edit), { name, width, height, mobile });
    t.after(() => page.close());
    await converge(server, [page]);
    if (style) await page.evaluate(`document.head.append(Object.assign(document.createElement('style'), { textContent: ${JSON.stringify(style)} })), true`);
    const items = await fileMenu(page);
    for (const id of ['file.preamble', 'file.bibliography']) assert.deepEqual({ label: items[id]?.label, disabled: items[id]?.disabled }, { label: id === 'file.preamble' ? 'Preamble…' : 'Bibliography…', disabled: false });
    for (const [id, item] of Object.entries(items)) {
      assert.ok(item.scroll <= item.client + 1, `the label of ${id} is wider than its box at ${width} px${style ? ` with ${style}` : ''}: ${JSON.stringify(item)}`);
      assert.ok(item.off <= 1.5, `the keys or the arrow of ${id} are not in line with its label at ${width} px${style ? ` with ${style}` : ''}: ${JSON.stringify(item)}`);
    }
    clean(page, MISSING);
  }
});

test('a slide pasted in a session with macros that preamble.tex does not have opens the dialog that says to paste their lines with File > Preamble…', { timeout: 300_000 }, async (t) => {
  const deck = await serve('.');
  t.after(() => deck.close());
  const a = await openDeck(browser, `${deck.origin}/${A}?${QUERY}`, A);
  t.after(() => a.close());
  const copied = await copySlide(a, FILES);
  const server = await texTalk(t);
  const [ann] = await pages(t, server, [sessionUrl(server.edit)]);
  await front(ann);
  await ann.evaluate(`(() => {
    document.activeElement?.blur();
    window.__pasted = false;
    Promise.resolve(window.BeesonEditor.exec('slide.paste', ${JSON.stringify(copied)})).then(() => { window.__pasted = true; }, (e) => { window.__pasted = String(e); });
    return true;
  })()`);
  await ann.waitFor(`!!document.querySelector('dialog.deck-folder[open]')`, 30_000);
  await ann.evaluate(`[...document.querySelectorAll('dialog.deck-folder[open] button')].find((b) => b.textContent === 'Paste Without Files').click(), true`);
  await ann.waitFor(`!!document.querySelector('dialog.paste-macros:not([hidden])') || window.__pasted !== false`, 30_000);
  assert.ok(await ann.evaluate(`!!document.querySelector('dialog.paste-macros:not([hidden])')`), `the paste ended without the dialog: ${await ann.evaluate('String(window.__pasted)')}, ${(await ann.evaluate('window.BeesonEditor.status()')).message}`);
  const text = await ann.evaluate(`document.querySelector('dialog.paste-macros:not([hidden]) p').textContent`);
  assert.ok(text.startsWith('Choose File > Preamble… and paste the lines below at the end of the preamble of this deck.'), text);
});
