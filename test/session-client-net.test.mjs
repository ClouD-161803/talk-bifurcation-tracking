// the client of a session in Chrome against a network that holds, cuts, or refuses its requests:
// the reload after a change of the head, the end of a session, the reconnect, the rejoin, the
// acknowledgment of Save, and the bookkeeping of a poll, with the requests ruled by NET of net.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd } from './helpers/apply.mjs';
import { clean, converge, loads, ONLINE, open, sessionUrl, show, STATE, talk } from './helpers/client.mjs';
import { until } from './helpers/session.mjs';

const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;
// the paragraph of slide One in index.html
const paragraph = (text) => /<h2>One<\/h2>\n  <p>([^<]*)<\/p>/.exec(text)?.[1];
// the records of copy.ts in IndexedDB for the address of the page
const COPIES = `new Promise((done) => {
  const r = indexedDB.open('beeson-session', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('copies', { keyPath: 'id' }).createIndex('key', 'key');
  r.onsuccess = () => {
    const get = r.result.transaction('copies').objectStore('copies').index('key').getAll(location.origin + location.pathname);
    get.onsuccess = () => done(get.result.length);
  };
})`;

test('converge fails with the text of each page when a page agrees with the file and another does not', { timeout: 30_000 }, () => {
  // a loop that does not end blocks the event loop of node, hence the call runs in a child process
  const script = `
    import { converge } from './test/helpers/client.mjs';
    const page = (text) => ({ send: async () => ({}), evaluate: async () => text });
    converge({ read: () => 'abc' }, [page('abc'), page('abd')], 'the pages to agree', 300).then(
      () => console.log('resolved'),
      (e) => console.log(e.message),
    );
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(run.signal, null, 'converge did not fail within 10 s');
  assert.equal(run.stdout.trim(), 'timed out waiting for the pages to agree\npage 0: agrees\npage 1: "abd" where the file has "abc"');
});

test('letters typed while a page waits to load again after a change of the head reach index.html', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [page]);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  // a letter every 20 ms, and the paragraph as the deck reads at the unload of the page
  await page.evaluate(`(() => {
    const p = ${el(0, 'p')};
    let n = 0;
    window.__typing = setInterval(() => document.execCommand('insertText', false, 'abcdefghijklmnopqrstuvwxyz'[n++ % 26]), 20);
    addEventListener('pagehide', () => sessionStorage.setItem('__shown', p.textContent));
    return true;
  })()`);
  await page.waitFor(`${el(0, 'p')}.textContent.length > 'First slide'.length + 10`);
  writeFileSync(server.file, server.read().replace('<title>A session</title>', '<title>A session, renamed</title>'));
  await until(async () => (await loads(page).catch(() => 0)) > 1, 'the page to load again');
  await page.waitFor(`document.readyState === 'complete' && ${ONLINE}`);
  const shown = await page.evaluate(`sessionStorage.getItem('__shown')`);
  assert.ok(shown.length > 'First slide'.length + 10, shown);
  // the edit command writes index.html up to 1 s after an operation
  await until(() => paragraph(server.read()) === shown, 'index.html to hold the letters shown at the unload', 10_000).catch((e) => {
    throw new Error(`${e.message}: ${paragraph(server.read())} where the page showed ${shown}`);
  });
  assert.equal(await page.evaluate(`${el(0, 'p')}.textContent`), shown);
  assert.equal(await page.evaluate(COPIES), 0);
  assert.equal(await page.evaluate(STATE), 'Saved to index.html');
  clean(page);
});
