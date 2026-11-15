// helpers of the browser tests of the offline path of a session: a page that is a tab of the one
// browser of a test, whose requests to the edit command can be cut, the copies of the edits that
// the client keeps in IndexedDB, the downloads of a page, and the edits and pictures of a page

import { caretAtEnd } from './apply.mjs';
import { C, ONLINE, show } from './client.mjs';
import { type } from './editor.mjs';

/**
 * A page of the editor at url as a tab of the browser of the test, i.e. with the localStorage of
 * the other tabs, and the name preset when the browser does not have one. Its requests under
 * .session/ fail while window.__offline is set, and window.__goOffline() sets it and fails the
 * requests in flight, e.g. the long poll. With window.__blockOps only the operations fail, and with
 * window.__failMedia an upload is answered 500. Each download of the page is read into
 * window.__downloads. script runs before the scripts of the page.
 */
export async function tab(browser, url, { name = 'Ann', script = '', wait = true } = {}) {
  const page = await browser.newPage({ width: 1280, height: 800 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `{
      try {
        if (localStorage.getItem('beeson-session-name') === null) localStorage.setItem('beeson-session-name', ${JSON.stringify(name)});
      } catch {}
      const fetched = window.fetch;
      const pending = new Set();
      window.fetch = function (input, init) {
        const url = input instanceof Request ? input.url : String(input);
        if (!url.includes('/.session/')) return fetched.call(this, input, init);
        if (window.__offline || (window.__blockOps && url.includes('/.session/op'))) return Promise.reject(new TypeError('Failed to fetch'));
        if (window.__failMedia && url.includes('/.session/media/')) return Promise.resolve(new Response('{"error":"the test refused the upload"}', { status: 500, headers: { 'Content-Type': 'application/json' } }));
        return new Promise((done, fail) => {
          pending.add(fail);
          fetched.call(this, input, init).then(done, fail).finally(() => pending.delete(fail));
        });
      };
      window.__goOffline = () => {
        window.__offline = true;
        window.__offAt = Date.now();
        for (const fail of pending) fail(new TypeError('Failed to fetch'));
        pending.clear();
        return true;
      };
      window.__downloads = [];
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (!this.download) return click.call(this);
        const name = this.download;
        window.__downloads.push(fetched(this.href).then((r) => r.text()).then((text) => ({ name, text })));
      };
    }
    ${script}`,
  });
  await page.goto(url);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  if (wait) await page.waitFor(ONLINE);
  return page;
}

export const goOffline = (page) => page.evaluate('window.__goOffline()');
// the page reaches the edit command again, and reconnects at once
export const goOnline = (page) => page.evaluate(`(window.__offline = false, ${C}.tryNow(), true)`);
export const downloads = (page) => page.evaluate('Promise.all(window.__downloads)');

// the copies of the address of the page in IndexedDB, as { id, mine }, or null without IndexedDB
export const ROWS = `new Promise((done) => {
  const r = indexedDB.open('beeson-session', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('copies', { keyPath: 'id' }).createIndex('key', 'key');
  r.onerror = () => done(null);
  r.onsuccess = () => {
    const db = r.result;
    const q = db.transaction('copies').objectStore('copies').getAll();
    q.onsuccess = () => {
      db.close();
      done(q.result.filter((x) => x.key === location.origin + location.pathname).map((x) => ({ id: x.id, mine: x.mine })));
    };
  };
})`;
export const rows = (page) => page.evaluate(ROWS);

/** Waits until the copy of a page whose text includes part is in IndexedDB, and returns its id. */
export async function copied(page, part, timeout = 15_000) {
  await page.waitFor(`(${ROWS}).then((rows) => rows.some((r) => r.mine.includes(${JSON.stringify(part)})))`, timeout);
  return (await rows(page)).find((r) => r.mine.includes(part)).id;
}

/** Waits on a page of the same origin until the page of the copy id is gone for the Web Locks API. */
export const released = (page, id) => page.waitFor(`navigator.locks.query().then((q) => !q.held.some((l) => l.name === 'beeson-session-copy:${id}'))`);

// the open dialog of the conflicts at a reconnect, as its title, the items of its list, and its buttons
export const CONFLICTS = `(() => {
  const d = document.querySelector('dialog.beeson-session-conflicts[open]');
  return d && { title: d.querySelector('h3').textContent, items: [...d.querySelectorAll('li')].map((li) => li.textContent), buttons: [...d.querySelectorAll('.row button')].map((b) => b.textContent) };
})()`;
export const press = (page, label) => page.evaluate(`[...document.querySelectorAll('dialog.beeson-session-conflicts[open] .row button')].find((b) => b.textContent === ${JSON.stringify(label)}).click()`);

/** A trusted drag of the files at paths from the Finder, dropped at the middle of the current slide. */
export async function dropFiles(page, paths) {
  const at = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.75 }; })()`);
  const data = { items: [], files: paths, dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop']) await page.send('Input.dispatchDragEvent', { type, x: at.x, y: at.y, data });
}

// the element of selector in the slide of index slide, as an expression of the page
export const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;
// the label of the button beside the save state, or null while it is hidden
export const ACTION = `(() => { const b = document.querySelector('.beeson-session-action'); return b && !b.hidden ? b.textContent : null; })()`;
// an image of the page whose src is path, loaded, or null
export const SHOWN = (path) => `[...document.querySelectorAll('.reveal .slides img')].some((i) => i.getAttribute('src') === ${JSON.stringify(path)} && i.complete && i.naturalWidth > 0)`;

/** Types text at the end of the element of selector on slide One (0) or Two (1). */
export async function edit(page, slide, selector, text) {
  await show(page, slide === 0 ? 'One' : 'Two');
  await caretAtEnd(page, el(slide, selector));
  await type(page, text);
}
