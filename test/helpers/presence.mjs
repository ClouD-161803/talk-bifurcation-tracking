// helpers of the browser tests of presence and the locks, test/session-floor.test.mjs and
// test/session-layer.test.mjs: a session of pages on the edit command, the elements of its deck,
// what the layer of presence draws, and the bubble of a refusal

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { launch } from '../../scripts/chrome.mjs';
import { frame, front } from './apply.mjs';
import { C, converge, open, sessionUrl, talk } from './client.mjs';
import { until } from './session.mjs';

export const P = 'window.BeesonSession.presence()';
// the element of selector on the slide at index
export const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;

export const BUBBLE = `document.querySelector('.beeson-bubble')?.textContent ?? null`;
export const REFUSED = 'Ana is typing here. You can move or delete it once they leave it or stop for 30 s.';
// the name of the person whose caret locks the element of expression, or null
export const LOCKER = (expression) => `(${P}.lockOf(${expression})?.name ?? null)`;
// the bubble of page cleared, so that the next one can be told from it
export const unbubble = (page) => page.evaluate(`document.querySelector('.beeson-bubble')?.remove()`);

/** A session of a page per name on the edit command, with each pair [from, to] of edits replaced in its index.html first. */
export async function session(t, names = ['Ana', 'Ben'], { edits = [], pages: options = [] } = {}) {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  let text = server.read();
  for (const [from, to] of edits) {
    assert.ok(text.includes(from), `the deck holds ${from}`);
    text = text.replace(from, to);
  }
  if (edits.length) writeFileSync(server.file, text);
  const pages = [];
  for (const [i, name] of names.entries()) pages.push(await open(browser, sessionUrl(server.edit), { name, ...(options[i] ?? {}) }));
  await converge(server, pages);
  return { browser, server, pages };
}

/** The elements of expressions selected on page. */
export async function select(page, ...expressions) {
  await front(page);
  const ok = await page.evaluate(`(() => {
    const els = [${expressions.join(', ')}];
    if (els.some((e) => !e)) return false;
    ${C}.app.selection.set('elements', els);
    return true;
  })()`);
  assert.ok(ok, `${expressions.join(', ')} are on the page`);
}

// what the layer of page draws: each frame and caret bar by its box on the screen, and each flag
// with its text, its client, whether it is a chip, and its box
const DRAWN = `(() => {
  const box = (n) => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const layer = document.querySelector('.beeson-presence');
  const text = (f) => f.classList.contains('chip') && !f.parentElement.classList.contains('hover') ? f.querySelector('.short').textContent : f.textContent.replace(f.querySelector('.short')?.textContent ?? '', '');
  return {
    frames: [...layer.querySelectorAll('.frame')].map(box),
    flags: [...layer.querySelectorAll('.flag')].map((f) => ({ text: text(f), client: f.dataset.client ?? null, chip: f.classList.contains('chip'), ...box(f) })),
    carets: [...layer.querySelectorAll('.caret')].map(box),
  };
})()`;

export const drawn = async (page) => {
  await front(page);
  await frame(page);
  return page.evaluate(DRAWN);
};

/** The box of the element of expression on the screen. */
export const boxOf = (page, expression) => page.evaluate(`(() => { const r = ${expression}.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);

/** Waits until the layer of page draws what holds for, and returns it. */
export async function untilDrawn(page, holds, what) {
  return until(async () => {
    const d = await drawn(page);
    return holds(d) ? d : null;
  }, what);
}

// the states that page sends are held back until release(), which sends the last
export const hold = (page) => page.evaluate(`(() => {
  const c = ${C};
  window.__send = c.sendPresence.bind(c);
  window.__held = [];
  c.sendPresence = (s) => window.__held.push(s);
})()`);
export const release = (page) => page.evaluate(`(() => {
  const c = ${C};
  c.sendPresence = window.__send;
  const s = window.__held.at(-1);
  if (s) c.sendPresence(s);
  return s ?? null;
})()`);

// the caret of page taken out of every text
export const leave = (page) => page.evaluate(`(() => { document.activeElement?.blur(); getSelection().removeAllRanges(); })()`);
