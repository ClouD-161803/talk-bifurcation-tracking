// three people who type in one paragraph of a session in Chrome, on the edit command started on a
// temporary talk folder: the keys of two people that come in one answer on both sides of an unread
// key of the person are kept with it

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caretAtEnd } from './helpers/apply.mjs';
import { converge, show } from './helpers/client.mjs';
import { typeKeys } from './helpers/editor.mjs';
import { NET } from './helpers/net.mjs';
import { el, session } from './helpers/presence.mjs';
import { until } from './helpers/session.mjs';

const p = el(1, 'p');
const para = (text) => text.match(/<p>[^\n]*<\/p>/g)[1];

// the caret of a page put into the paragraph, at offset of its first text node
const caretAt = (page, offset) => page.evaluate(`(() => { const q = ${p}; q.focus(); getSelection().collapse(q.firstChild, ${offset}); return document.activeElement === q; })()`);

test('the keys of two other people that come in one answer on both sides of an unread key of the person are kept with it', { timeout: 120_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben', 'Cleo'], { pages: [{ script: NET }] });
  const [ana, ben, cleo] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  assert.ok(await caretAt(ana, 6));
  // a key of Ana typed after the client read the deck and before the apply of both keys reads it
  await ana.evaluate(`(() => {
    const port = window.BeesonEditor.session;
    const apply = port.apply;
    window.__armed = true;
    port.apply = function (text) {
      if (window.__armed && text.includes('BSecond slideC')) {
        window.__armed = false;
        document.execCommand('insertText', false, 'A');
      }
      return apply.call(this, text);
    };
    return true;
  })()`);
  // the poll of Ana is held, hence both keys come in its next answer
  await ana.evaluate(`__net.rule('/.session/events', 'hold') && __net.drop('/.session/events')`);
  await until(() => ana.evaluate('__net.held.length > 0'), 'a held poll of Ana');
  assert.ok(await caretAt(ben, 0));
  await typeKeys(ben, 'B');
  await caretAtEnd(cleo, p);
  await typeKeys(cleo, 'C');
  await until(() => para(server.read()) === '<p>BSecond slideC</p>', 'both keys in index.html');
  await ana.evaluate(`__net.clear() && __net.release('/.session/events')`);
  await until(() => ana.evaluate('window.__armed === false'), 'the key of Ana at the apply');
  const text = await converge(server, pages);
  assert.equal(para(text), '<p>BSecondA slideC</p>');
  assert.deepEqual([ana.errors, ben.errors, cleo.errors], [[], [], []]);
});
