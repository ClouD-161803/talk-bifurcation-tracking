import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { launch } from '../../scripts/chrome.mjs';
import { frame, front } from './apply.mjs';
import { C, converge, open, sessionUrl, talk } from './client.mjs';
import { until } from './session.mjs';

export const P = 'window.BeesonSession.presence()';
export const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;

export const BUBBLE = `document.querySelector('.beeson-bubble')?.textContent ?? null`;
export const REFUSED = 'Ana is typing here. You can do this once they leave it or stop for 30 s.';
export const HOLDER = (expression) => `(${P}.holderOf(${expression})?.name ?? null)`;
export async function keep(page) {
  const kept = await page.evaluate(`(() => {
    let n = 0;
    for (const o of ${P}.others.values()) {
      if (typeof o.activeAt !== 'number') continue;
      Object.defineProperty(o, 'activeAt', { get: () => Infinity, set() {} });
      n++;
    }
    return n;
  })()`);
  assert.ok(kept > 0, 'the page heard a person whose holds are kept');
}
export const unbubble = (page) => page.evaluate(`document.querySelector('.beeson-bubble')?.remove()`);

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

export const boxOf = (page, expression) => page.evaluate(`(() => { const r = ${expression}.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);

export async function untilDrawn(page, holds, what) {
  return until(async () => {
    const d = await drawn(page);
    return holds(d) ? d : null;
  }, what);
}

export const leave = (page) => page.evaluate(`(() => { document.activeElement?.blur(); getSelection().removeAllRanges(); })()`);
