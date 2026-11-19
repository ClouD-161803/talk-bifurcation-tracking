import assert from 'node:assert/strict';
import { editorPage } from './editor.mjs';

export const E = 'window.BeesonEditor';

export async function sessionPage(browser, options = {}) {
  const page = await editorPage(browser, options);
  await page.evaluate(`(async () => {
    await ${E}.loadSession();
    window.__changes = 0;
    ${E}.session.onChange(() => window.__changes++);
    ${E}.session.begin();
  })()`);
  return page;
}

export const front = (page) => page.send('Page.bringToFront');

export const frame = (page) => page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))');

export async function showSlide(page, heading) {
  const found = await page.evaluate(`(() => {
    const s = [...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector('h1, h2')?.textContent.startsWith(${JSON.stringify(heading)}));
    if (!s) return false;
    const { h, v } = Reveal.getIndices(s);
    Reveal.slide(h, v);
    window.__shown = s;
    return true;
  })()`);
  assert.ok(found, `the slide ${heading} is in the deck`);
  await page.waitFor('Reveal.getCurrentSlide() === window.__shown');
  await frame(page);
}

export async function caretAtEnd(page, expression) {
  const state = await page.evaluate(`(() => {
    const host = ${expression};
    if (!host) return 'not found';
    host.focus();
    const r = document.createRange();
    r.selectNodeContents(host);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    if (document.activeElement === host) return true;
    const a = document.activeElement;
    return {
      contenteditable: host.getAttribute('contenteditable'),
      connected: host.isConnected,
      drawn: host.getClientRects().length > 0,
      current: !!window.Reveal?.getCurrentSlide?.()?.contains(host),
      active: a && a.localName + (a.id ? '#' + a.id : '') + (typeof a.className === 'string' && a.className ? '.' + a.className.trim().split(/\\s+/).join('.') : ''),
      visibility: document.visibilityState,
    };
  })()`);
  assert.equal(state, true, `the caret is in ${expression}, and the page holds ${JSON.stringify(state)}`);
}

export async function applyOn(page, text) {
  await front(page);
  return page.evaluate(`${E}.loadSession().then(() => ${E}.apply(${JSON.stringify(text)})).then((r) => ({ reload: r.reload, changed: r.changed.map((el) => el.localName) }))`);
}

export async function applied(page, text, label = '') {
  const got = await page.evaluate(`({ text: ${E}.render(), status: ${E}.status() })`);
  if (got.text !== text) {
    let i = 0;
    while (got.text[i] === text[i]) i++;
    assert.fail(`${label}: the page renders as\n${JSON.stringify(got.text.slice(i - 80, i + 120))}\nwhere the text is\n${JSON.stringify(text.slice(i - 80, i + 120))}`);
  }
  assert.deepEqual(got.status.problems, [], `${label}: problems`);
  assert.equal(got.status.dirty, false, `${label}: unsaved changes`);
  assert.equal(got.status.undo, false, `${label}: an entry to undo`);
  assert.equal(got.status.redo, false, `${label}: an entry to redo`);
}

export const VIEW = `(() => {
  const RUNTIME = /^(beeson-|hl-|plot-)/;
  const STATE = new Set(['visible', 'current-fragment', 'present', 'past', 'future', 'disabled', 'enabled', 'stack']);
  const skip = (el) => el.hasAttribute('data-generated') || el.matches('canvas, script, style, .backdrop > svg, .qr > svg, .qr-logo, .qr-error')
    || (el.matches('aside.notes') && !el.textContent.trim());
  const walk = (el) => {
    if (el.localName === 'mjx-container') return 'math';
    const classes = [...el.classList].filter((c) => !RUNTIME.test(c) && !STATE.has(c)).sort();
    const style = el.localName === 'section' || !el.style || el.matches('.backdrop > .label, .surface > .label') ? '' : [...el.style].sort().map((p) => p + ': ' + el.style.getPropertyValue(p) + (el.style.getPropertyPriority(p) ? ' !important' : '')).join('; ');
    const out = [el.localName + classes.map((c) => '.' + c).join('') + (style ? '[' + style + ']' : '')];
    let text = '';
    const flush = () => {
      const t = text.replace(/\\s+/g, ' ').trim();
      if (t) out.push(t);
      text = '';
    };
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) text += n.data;
      else if (n.nodeType === Node.ELEMENT_NODE && !skip(n)) {
        const k = walk(n);
        if (k === 'math') text += ' $ ';
        else {
          flush();
          out.push(k);
        }
      }
    }
    flush();
    return out;
  };
  return [...document.querySelectorAll('.reveal .slides > section')].map((s) => JSON.stringify(walk(s)));
})()`;
