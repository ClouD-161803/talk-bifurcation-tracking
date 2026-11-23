import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';

const DECK = 'test/pages/speaker-steps.html';
const CURRENT = 'receiver&progress=false&history=false&transition=none&autoSlide=0&backgroundTransition=none&scrollActivationWidth=false&postMessageEvents=true';

let browser;
let server;
before(async () => {
  browser = await launch({ offline: false });
  server = await serve('.');
});
after(async () => {
  await browser?.close();
  server?.close();
});

const FRAME = `document.querySelector('iframe.current').contentWindow`;
const at = `(() => { const i = ${FRAME}.Reveal.getIndices(); return i.h + '/' + (i.f ?? -1); })()`;
const send = (message) => `(${FRAME}.postMessage(${JSON.stringify(JSON.stringify(message))}, '*'), true)`;
const setState = (h, f) => send({ method: 'setState', args: [{ indexh: h, indexv: 0, indexf: f, paused: false, overview: false }] });
const KEY_RIGHT = send({ method: 'triggerKey', args: [39] });
const KEY_LEFT = send({ method: 'triggerKey', args: [37] });
const moves = `${FRAME}.__moves`;

async function stepTo(page, key, step) {
  const before = await page.evaluate('window.__heard.length');
  await page.evaluate(key);
  await page.waitFor(`window.__heard.slice(${before}).includes('${step}')`);
}

async function currentFrame(t) {
  const page = await browser.newPage({ width: 1280, height: 800 });
  t.after(() => page.close());
  await page.goto(`${server.origin}/${DECK}?still`);
  await page.waitFor(deckSettled);
  await page.evaluate(`(() => {
    window.__heard = [];
    window.addEventListener('message', (ev) => {
      if (ev.source !== ${FRAME}) return;
      const m = JSON.parse(ev.data);
      if (m.namespace === 'reveal' && ['slidechanged', 'fragmentshown', 'fragmenthidden'].includes(m.eventName)) window.__heard.push(m.state.indexh + '/' + m.state.indexf);
    });
    const frame = document.createElement('iframe');
    frame.className = 'current';
    frame.width = 1280;
    frame.height = 720;
    frame.src = ${JSON.stringify(`/${DECK}?${CURRENT}#/1/0`)};
    document.body.append(frame);
    return true;
  })()`);
  await page.waitFor(`(() => { try { return !!${FRAME}.document.querySelector('.reveal.ready'); } catch { return false; } })()`, 30000);
  await page.evaluate(`(() => { const w = ${FRAME}; w.__moves = []; for (const e of ['slidechanged', 'fragmentshown', 'fragmenthidden']) w.Reveal.on(e, () => w.__moves.push(${at.replaceAll(FRAME, 'w')})); return true; })()`);
  return page;
}

test('the frame of the current slide of the speaker view does not post back a step that the speaker view set on it', { timeout: 60000 }, async (t) => {
  const page = await currentFrame(t);
  await page.evaluate(setState(1, 2));
  await page.waitFor(`${at} === '1/2'`);
  await page.evaluate(KEY_RIGHT);
  await page.waitFor(`window.__heard.includes('1/3')`);
  assert.equal(await page.evaluate(`window.__heard.includes('1/2')`), false, 'the step set by the speaker view is posted back as a step of the speaker');
});

test('the frame of the current slide of the speaker view is not set back by a step that it posted before its last one', { timeout: 60000 }, async (t) => {
  const page = await currentFrame(t);
  for (const step of ['1/0', '1/1', '1/2']) {
    await page.evaluate(KEY_RIGHT);
    await page.waitFor(`window.__heard.includes('${step}')`);
  }
  const before = await page.evaluate('window.__heard.length');
  await page.evaluate(setState(1, 0));
  await page.evaluate(KEY_RIGHT);
  await page.waitFor(`window.__heard.slice(${before}).some((step) => step !== '1/0')`);
  assert.equal(await page.evaluate(at), '1/3', 'the frame is set back to an older step that it posted');
  await page.evaluate(setState(1, 3));
  await page.evaluate(setState(1, 1));
  await page.waitFor(`${at} === '1/1'`);
});

test('the frame of the current slide of the speaker view skips the echoes of a step forward and back taken before the first echo came back', { timeout: 60000 }, async (t) => {
  const page = await currentFrame(t);
  await page.evaluate(setState(1, 0));
  await page.waitFor(`${at} === '1/0'`);
  await stepTo(page, KEY_RIGHT, '1/1');
  await stepTo(page, KEY_RIGHT, '1/2');
  await stepTo(page, KEY_LEFT, '1/1');
  const before = await page.evaluate(`${moves}.length`);
  for (const [h, f] of [[1, 1], [1, 2], [1, 1], [1, 4]]) await page.evaluate(setState(h, f));
  await page.waitFor(`${at} === '1/4'`);
  assert.deepEqual(await page.evaluate(`${moves}.slice(${before})`), ['1/4'], 'the frame is moved by an echo of its own steps');
});

test('the frame of the current slide of the speaker view follows the deck after a step of the speaker that the deck sent no echo of', { timeout: 60000 }, async (t) => {
  const page = await currentFrame(t);
  await page.evaluate(setState(1, 1));
  await page.waitFor(`${at} === '1/1'`);
  await stepTo(page, KEY_RIGHT, '1/2');
  await page.evaluate(setState(1, 3));
  await page.waitFor(`${at} === '1/3'`);
  await page.evaluate(setState(1, 2));
  await page.waitFor(`${at} === '1/2'`);
});

test('the frame of the current slide of the speaker view does not post the step that it opens at', { timeout: 60000 }, async (t) => {
  const page = await currentFrame(t);
  await page.evaluate(KEY_RIGHT);
  await page.waitFor(`window.__heard.length > 0`);
  assert.deepEqual(await page.evaluate('window.__heard'), ['1/0'], 'the frame posts its opening step, which the speaker view sends to the deck');
});
