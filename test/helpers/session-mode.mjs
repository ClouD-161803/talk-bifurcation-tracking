// helpers of the tests of the session mode of the editor, in which it does not save, keep drafts,
// or follow its file by itself, see src/editor/session/session.ts

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { E, caretAtEnd, showSlide } from './apply.mjs';

const deckText = readFileSync('test-deck.html', 'utf8');

// window.__timers holds the timers of a second or longer that the page sets after this script,
// e.g. the timer of a draft in src/editor/file/drafts.ts and of the autosave in files.ts. its run()
// runs each pending one at once, hence a test does not wait for them
export const TIMERS = `(() => {
  const set = window.setTimeout.bind(window);
  const clear = window.clearTimeout.bind(window);
  const due = new Map();
  window.setTimeout = (fn, ms, ...args) => {
    if (!(ms >= 1000) || typeof fn !== 'function') return set(fn, ms, ...args);
    const id = set(() => {
      due.delete(id);
      fn(...args);
    }, ms);
    due.set(id, () => fn(...args));
    return id;
  };
  window.clearTimeout = (id) => {
    due.delete(id);
    clear(id);
  };
  window.__timers = {
    pending: () => due.size,
    run: () => {
      for (const [id, fn] of [...due]) {
        due.delete(id);
        clear(id);
        fn();
      }
    },
  };
  return true;
})()`;

// a stand-in for theme/session.js, which keeps a page in the session mode without an edit command.
// as the client does, it begins the session and opens the text of the page, where it can be read
export const CLIENT = `window.BeesonSession = {
  start: async ({ app, port }) => {
    port.begin();
    try {
      if (location.protocol === 'file:') throw new Error('a file cannot be fetched');
      const response = await fetch(location.href.split('#')[0], { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const text = await response.text();
      app.files.open(text);
      // the text that the watch of follow.ts compares the file with, for the tests after end()
      app.follow.read(text);
    } catch {
      app.state = 'waiting';
      app.report();
    }
    return true;
  },
};`;

/** Types ' Go.' at the end of the first paragraph of the slide 'Show your steps'. */
export async function typeGo(page) {
  await showSlide(page, 'Show your steps');
  await caretAtEnd(page, `Reveal.getCurrentSlide().querySelector('p')`);
  await page.evaluate(`document.execCommand('insertText', false, ' Go.')`);
  await page.waitFor(`${E}.render().includes(' Go.')`);
}

// a saver for onSave of the port, which counts its calls in window.__saves and resolves once the
// test calls release()
export const HELD_SAVER = `(() => {
  window.__saves = 0;
  window.__release = [];
  ${E}.session.onSave(() => {
    window.__saves++;
    return new Promise((done) => window.__release.push(done));
  });
  return true;
})()`;
export const release = (page) => page.evaluate('(window.__release.splice(0).forEach((done) => done()), true)');

// window.open recorded in window.__opened. it returns null, as for a tab that the browser blocked
export const NO_TABS = `(() => {
  window.__opened = [];
  window.open = (url) => (window.__opened.push(String(url)), null);
  return true;
})()`;

/** Keeps a draft of test-deck.html in the storage of the file origin, as an earlier visit leaves it. */
export async function keepOldDraft(page, text = deckText.replace('Thank you', 'Thanks from a draft')) {
  assert.notEqual(text, deckText);
  await page.evaluate(`localStorage.setItem('beeson-draft:' + location.href.split(/[?#]/)[0], ${JSON.stringify(JSON.stringify({ at: Date.now(), text }))})`);
  return text;
}

export const draftText = `JSON.parse(localStorage.getItem('beeson-draft:' + location.href.split(/[?#]/)[0]) ?? 'null')?.text ?? null`;

/** The items of the File menu by command id, each with its label and whether it is dimmed. */
export async function fileMenu(page) {
  const items = await page.evaluate(`(() => {
    const title = [...document.querySelectorAll('.beeson-edit-menubar [role="menuitem"]')].find((b) => b.textContent === 'File');
    if (!title) return null;
    title.click();
    const out = {};
    for (const i of document.querySelectorAll('.beeson-edit-menu .item')) {
      const label = i.querySelector('.label');
      out[i.dataset.command ?? label.firstChild?.textContent ?? ''] = { label: label.textContent, disabled: i.getAttribute('aria-disabled') === 'true' };
    }
    return out;
  })()`);
  assert.ok(items, 'the menu bar has a File menu');
  await page.evaluate(`document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true`);
  await page.waitFor(`!document.querySelector('.beeson-edit-menu')`);
  return items;
}
