import { caretAtEnd } from './apply.mjs';
import { C, ONLINE, show } from './client.mjs';
import { type } from './editor.mjs';

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
export const goOnline = (page) => page.evaluate(`(window.__offline = false, ${C}.tryNow(), true)`);
export const downloads = (page) => page.evaluate('Promise.all(window.__downloads)');

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

export async function copied(page, part, timeout = 15_000) {
  await page.waitFor(`(${ROWS}).then((rows) => rows.some((r) => r.mine.includes(${JSON.stringify(part)})))`, timeout);
  return (await rows(page)).find((r) => r.mine.includes(part)).id;
}

export const released = (page, id, timeout = 60_000) => page.waitFor(`navigator.locks.query().then((q) => !q.held.some((l) => l.name === 'beeson-session-copy:${id}'))`, timeout);

export const CONFLICTS = `(() => {
  const d = document.querySelector('dialog.beeson-session-conflicts[open]');
  return d && { title: d.querySelector('h3').textContent, items: [...d.querySelectorAll('li')].map((li) => li.textContent), buttons: [...d.querySelectorAll('.row button')].map((b) => b.textContent) };
})()`;
export const press = (page, label) => page.evaluate(`[...document.querySelectorAll('dialog.beeson-session-conflicts[open] .row button')].find((b) => b.textContent === ${JSON.stringify(label)}).click()`);

export async function dropFiles(page, paths) {
  const at = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.75 }; })()`);
  const data = { items: [], files: paths, dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop']) await page.send('Input.dispatchDragEvent', { type, x: at.x, y: at.y, data });
}

export const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;
export const ACTION = `(() => { const b = document.querySelector('.beeson-session-action'); return b && !b.hidden ? b.textContent : null; })()`;
export const SHOWN = (path) => `[...document.querySelectorAll('.reveal .slides img')].some((i) => i.getAttribute('src') === ${JSON.stringify(path)} && i.complete && i.naturalWidth > 0)`;

export async function edit(page, slide, selector, text) {
  await show(page, slide === 0 ? 'One' : 'Two');
  await caretAtEnd(page, el(slide, selector));
  await type(page, text);
}
