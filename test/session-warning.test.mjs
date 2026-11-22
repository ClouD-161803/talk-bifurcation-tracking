import assert from 'node:assert/strict';
import { chmodSync } from 'node:fs';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { clean, open, sessionUrl, STATE, talk } from './helpers/client.mjs';
import { post } from './helpers/session.mjs';

const WARNING = "The deck cannot be written on the computer of the host: ";

test('a page shows that the deck cannot be written on the host machine, until a write succeeds', { timeout: 120_000, skip: (process.platform === 'win32' || process.getuid?.() === 0) && 'a folder without write permission' }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit));
  const { port, base } = server.edit;
  const bo = (await post(port, `${base}.session/hello`, { name: 'Bo' })).json();
  chmodSync(server.talk, 0o555);
  try {
    const at = bo.text.indexOf('First slide');
    const op = (await post(port, `${base}.session/op`, { token: bo.token, seq: 1, base: bo.v, patches: [{ start: at, end: at + 5, text: 'Opening' }] })).json();
    assert.equal(op.ok, true);
    await page.waitFor(`${STATE}?.startsWith(${JSON.stringify(WARNING)})`, 30_000);
    assert.match(await page.evaluate(STATE), /EACCES|EPERM/);
  } finally {
    chmodSync(server.talk, 0o755);
  }
  await page.waitFor(`${STATE} === 'Saved to index.html'`, 30_000);
  assert.ok(server.read().includes('Opening slide'));
  clean(page);
});
