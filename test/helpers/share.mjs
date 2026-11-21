import assert from 'node:assert/strict';
import { front } from './apply.mjs';
import { click } from './editor.mjs';

export const avatars = (page) =>
  page.evaluate(`[...document.querySelectorAll('.beeson-session-people > button')].filter((b) => b.getClientRects().length).map((b) => ({ text: b.textContent, label: b.getAttribute('aria-label'), me: b.classList.contains('me') }))`);

export const menu = (page) => page.evaluate(`[...(document.querySelector('.beeson-edit-menu')?.querySelectorAll('.note, .item') ?? [])].map((el) => el.textContent.replace(/\\s+/g, ' ').trim())`);

async function centerOf(page, target) {
  const expression = target.startsWith('(') ? target : `[...document.querySelectorAll(${JSON.stringify(target)})].find((el) => el.getClientRects().length)`;
  const at = await page.evaluate(`(() => {
    const el = ${expression};
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  assert.ok(at, `${target} is shown`);
  return at;
}

export async function press(page, target) {
  await front(page);
  await click(page, await centerOf(page, target));
}

export const item = (label) => `([...document.querySelectorAll('.beeson-edit-menu .item')].find((el) => el.textContent.trim().startsWith(${JSON.stringify(label)})))`;

export const dialogButton = (cls, label) => `([...document.querySelectorAll('dialog.${cls}[open] button')].find((b) => b.textContent === ${JSON.stringify(label)}))`;

const touch = (page, type, points) => page.send('Input.dispatchTouchEvent', { type, touchPoints: points });

export async function tap(page, target) {
  const { x, y } = await centerOf(page, target);
  await touch(page, 'touchStart', [{ x, y }]);
  await touch(page, 'touchEnd', []);
}

export async function hold(page, target, ready) {
  const { x, y } = await centerOf(page, target);
  await touch(page, 'touchStart', [{ x, y }]);
  try {
    await page.waitFor(ready, 5000);
  } finally {
    await touch(page, 'touchEnd', []);
  }
}

export const HIT = `((el) => {
  const r = el.getBoundingClientRect();
  const a = getComputedStyle(el, '::after');
  const inset = (v) => (a.content === 'none' || a.position !== 'absolute' ? 0 : parseFloat(v) || 0);
  const box = { left: r.left + inset(a.left), top: r.top + inset(a.top), right: r.right - inset(a.right), bottom: r.bottom - inset(a.bottom) };
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { width: box.right - box.left, height: box.bottom - box.top, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, hit: el.contains(hit) };
})`;

export const FITS = `((d) => {
  const r = d.getBoundingClientRect();
  const vv = window.visualViewport;
  const height = vv ? vv.height : innerHeight;
  return { open: d.open, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= height + 0.5, across: d.scrollWidth <= d.clientWidth, page: document.documentElement.scrollWidth <= innerWidth };
})`;
