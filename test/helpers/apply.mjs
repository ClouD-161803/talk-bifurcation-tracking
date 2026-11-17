// helpers of the tests of the session of the synchronous editor, see src/editor/session/

import assert from 'node:assert/strict';
import { editorPage } from './editor.mjs';

export const E = 'window.BeesonEditor';

/**
 * The editor on test-deck.html in a session, with the changes of the person counted in
 * window.__changes by onChange of the port.
 */
export async function sessionPage(browser, options = {}) {
  const page = await editorPage(browser, options);
  await page.evaluate(`(() => {
    window.__changes = 0;
    ${E}.session.onChange(() => window.__changes++);
    ${E}.session.begin();
  })()`);
  return page;
}

// a page of a test with two pages in front, since a page behind does not draw frames
export const front = (page) => page.send('Page.bringToFront');

// two animation frames of the page
export const frame = (page) => page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))');

/** The slide whose heading starts with heading shown, once reveal.js has made it the current slide. */
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

/** The caret put at the end of the text element of expression, with the focus in it. */
export async function caretAtEnd(page, expression) {
  const ok = await page.evaluate(`(() => {
    const host = ${expression};
    if (!host) return false;
    host.focus();
    const r = document.createRange();
    r.selectNodeContents(host);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    return document.activeElement === host;
  })()`);
  assert.ok(ok, `the caret is in ${expression}`);
}

/** The apply of text on page, with its reload flag and the tags of the elements it changed. */
export async function applyOn(page, text) {
  await front(page);
  return page.evaluate(`${E}.apply(${JSON.stringify(text)}).then((r) => ({ reload: r.reload, changed: r.changed.map((el) => el.localName) }))`);
}

/** Asserts that page renders as text, with zero problems, no unsaved change, and an empty history. */
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

// a function of the page that describes each slide as a tree of its elements, each with its tag,
// the classes of the file, and its style, and of its text, without the elements, the classes, and
// the styles that the theme and reveal.js make at run time, and with each formula as math
export const VIEW = `(() => {
  const RUNTIME = /^(beeson-|hl-|plot-)/;
  const STATE = new Set(['visible', 'current-fragment', 'present', 'past', 'future', 'disabled', 'enabled', 'stack']);
  const skip = (el) => el.hasAttribute('data-generated') || el.matches('canvas, script, style, .backdrop > svg, .qr > svg, .qr-logo, .qr-error')
    || (el.matches('aside.notes') && !el.textContent.trim());
  const walk = (el) => {
    if (el.localName === 'mjx-container') return 'math';
    const classes = [...el.classList].filter((c) => !RUNTIME.test(c) && !STATE.has(c)).sort();
    // the declarations of the style, which a page writes with or without a semicolon at the end.
    // the theme places a label of a backdrop or a surface when it draws it
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
