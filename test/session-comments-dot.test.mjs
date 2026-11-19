import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { front } from './helpers/apply.mjs';
import { clean, converge, open, sessionUrl, show, talk } from './helpers/client.mjs';
import { click, contrast, GROUND, press, type } from './helpers/editor.mjs';

const PANE = '.beeson-edit-inspector .panel.comments';
const COMMENT_KEY = process.platform === 'darwin' ? 'Mod+Alt+M' : 'Shift+F2';
const BUTTON = `document.querySelector('.beeson-session-comments')`;

const DOT = `(() => {
  const d = ${BUTTON}.querySelector('.count.dot');
  if (!d || !d.getClientRects().length) return null;
  const c = getComputedStyle(d).backgroundColor.match(/[\\d.]+/g).map(Number);
  let a = c.length > 3 ? c[3] : 1;
  for (let e = d; e; e = e.parentElement) a *= Number(getComputedStyle(e).opacity);
  return { dot: 'rgba(' + c.slice(0, 3).join(', ') + ', ' + a + ')', ground: ${GROUND}(d.parentElement) };
})()`;

test('the dot of unread comments has a contrast of 3:1 against the title bar in both modes, at rest and under hover', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [a, b]);
  await show(a, 'One');
  await click(a, '.reveal .slides > section:nth-child(1) p');
  await press(a, COMMENT_KEY);
  await a.waitFor(`document.activeElement?.matches('${PANE} .draft textarea')`);
  await type(a, 'For the dot');
  await click(a, `${PANE} .draft .actions .primary`);
  await a.waitFor(`!document.querySelector('${PANE} .draft')`);
  await front(b);
  await b.waitFor(`!!(${DOT})`);
  const away = { x: 800, y: 600 };
  const center = await b.evaluate(`(() => { const r = ${BUTTON}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  for (const scheme of ['light', 'dark']) {
    await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await b.waitFor(`matchMedia('(prefers-color-scheme: ${scheme})').matches`);
    for (const [state, at, hovered] of [
      ['at rest', away, false],
      ['under hover', center, true],
    ]) {
      await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at });
      await b.waitFor(`${BUTTON}.matches(':hover') === ${hovered}`);
      const { dot, ground } = await b.evaluate(DOT);
      assert.ok(contrast(dot, ground) >= 3, `${scheme}, ${state}: ${dot} on ${ground} is ${contrast(dot, ground).toFixed(2)}:1`);
    }
  }
  clean(a);
  clean(b);
});
