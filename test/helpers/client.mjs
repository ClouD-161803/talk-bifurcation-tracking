// helpers of the browser tests of the client of a session, theme/session.js: a talk folder with a
// small deck and a copy of theme/, the edit command on it, and pages of the editor that join it

import assert from 'node:assert/strict';
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { front } from './apply.mjs';
import { startEdit, stopEdit, talkFolder, until } from './session.mjs';

export const TALK = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>A session</title>
<link rel="icon" href="brand/favicon-32x32.png" sizes="32x32" type="image/png">
<link rel="stylesheet" href="theme/vendor/reveal/reset.css">
<link rel="stylesheet" href="theme/vendor/reveal/reveal.css">
<link rel="stylesheet" href="theme/beeson.css">
</head>
<body>
<div class="reveal">
<div class="slides">

<section>
  <h2>One</h2>
  <p>First slide</p>
</section>

<section>
  <h2>Two</h2>
  <p>Second slide</p>
  <ul>
    <li>Alpha</li>
    <li>Beta</li>
  </ul>
</section>

</div>
</div>
<script src="theme/vendor/reveal/reveal.js"></script>
<script src="theme/beeson.js"></script>
<script>Beeson.start({});</script>
</body>
</html>
`;

export const C = 'window.BeesonSession.client()';
export const ONLINE = `(window.BeesonSession?.client?.()?.connection === 'online')`;
// the text of the deck as the port reads it
export const TEXT = 'window.BeesonEditor.session.text()';
// the text of the save state in the title bar
export const STATE = `document.querySelector('.beeson-session-state')?.getAttribute('aria-label')`;

/**
 * A talk folder with TALK and a copy of theme/ and brand/, since the edit command serves only what is inside
 * the folder, and the edit command on it. start() starts it again, e.g. after a kill, with more
 * arguments given after the earlier ones, so that a later --port wins.
 */
export async function talk(t, { args = [], env = {} } = {}) {
  const folder = talkFolder(t, TALK);
  for (const dir of ['theme', 'brand']) cpSync(resolve(dir), join(folder.talk, dir), { recursive: true });
  const file = join(folder.talk, 'index.html');
  const server = {
    ...folder,
    file,
    edit: null,
    read: () => readFileSync(file, 'utf8'),
    async start(more = []) {
      server.edit = await startEdit(folder.talk, { args: [...args, ...more], env: { XDG_CONFIG_HOME: folder.config, APPDATA: folder.config, ...env } });
      return server.edit;
    },
  };
  t.after(async () => {
    if (server.edit) await stopEdit(server.edit);
    rmSync(folder.root, { recursive: true, force: true });
  });
  await server.start();
  return server;
}

let pages = 0;

/**
 * A page of the editor at url, with the keys beeson-session-* of its localStorage kept apart from
 * those of the other pages of the browser, as if it were another browser, and with the name preset
 * unless name is empty, which leaves the join dialog open. The script of the page counts its loads
 * and the operations that it sends in sessionStorage, which a reload keeps, and with
 * window.__corrupt set it sends each operation with a patch out of bounds. The page reads as
 * visible while it is behind another page, unless window.__visibility is set. script runs after
 * this script and before the scripts of the page, e.g. NET of net.mjs, and before(page) runs before
 * the page is loaded, e.g. to block a file. ready = false does not wait for the editor to be ready,
 * e.g. while a dialog holds the start of the session.
 */
export async function open(browser, url, { name = 'Ann', width = 1280, height = 800, mobile = false, wait = true, ready = true, script = '', before = null } = {}) {
  const page = await browser.newPage({ width, height, mobile });
  const prefix = `page${++pages}:`;
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `{
      const prefix = ${JSON.stringify(prefix)};
      const key = (k) => (String(k).startsWith('beeson-session-') ? prefix + k : k);
      const get = Storage.prototype.getItem;
      const set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (k) { return get.call(this, key(k)); };
      Storage.prototype.setItem = function (k, v) { set.call(this, key(k), v); };
      try {
        if (${JSON.stringify(name)} && get.call(localStorage, prefix + 'beeson-session-name') === null) set.call(localStorage, prefix + 'beeson-session-name', ${JSON.stringify(name)});
        sessionStorage.setItem('__loads', String(Number(sessionStorage.getItem('__loads') || 0) + 1));
      } catch {}
      // a page behind another of the test browser is hidden, which the page of a person on another
      // computer is not. it reads as visible unless window.__visibility is 'hidden', or 'real'
      const visibility = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState').get;
      Object.defineProperty(Document.prototype, 'visibilityState', {
        configurable: true,
        get() { return window.__visibility === 'real' ? visibility.call(this) : window.__visibility === 'hidden' ? 'hidden' : 'visible'; },
      });
      const fetched = window.fetch;
      window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/.session/op')) {
          sessionStorage.setItem('__ops', String(Number(sessionStorage.getItem('__ops') || 0) + 1));
          if (window.__corrupt) {
            const body = JSON.parse(init.body);
            body.patches = [{ start: 1e9, end: 1e9, text: 'x' }];
            init = { ...init, body: JSON.stringify(body) };
          }
        }
        return fetched.call(this, input, init);
      };
    }
    ${script}`,
  });
  await before?.(page);
  await page.goto(url);
  if (!ready) return page;
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  if (wait) await page.waitFor(ONLINE);
  return page;
}

// the page of the editor in a session of the edit command
export const sessionUrl = (edit) => `${edit.url}index.html?edit&session`;

export const loads = (page) => page.evaluate(`Number(sessionStorage.getItem('__loads') || 0)`);
export const ops = (page) => page.evaluate(`Number(sessionStorage.getItem('__ops') || 0)`);

/**
 * Waits until every page is online, has every edit acknowledged, and reads as index.html, and
 * returns this text. Each page is brought to the front in turn, since a page behind does not draw
 * frames, and an apply waits for one.
 */
export async function converge(server, list, what = 'the pages and index.html to agree', timeout = 20_000) {
  let last = [];
  try {
    return await until(async () => {
      const text = server.read();
      last = [];
      for (const page of list) {
        await front(page);
        const got = await page.evaluate(`(${ONLINE} && ${C}.acked()) ? ${TEXT} : null`).catch(() => null);
        last.push(got);
        if (got !== text) return null;
      }
      return text;
    }, what, timeout);
  } catch (e) {
    const text = server.read();
    const diff = last.map((got, i) => {
      if (got === null) return `page ${i}: not online or not acknowledged`;
      if (got === text) return `page ${i}: agrees`;
      const n = Math.min(got.length, text.length);
      let at = 0;
      while (at < n && got[at] === text[at]) at++;
      const from = Math.max(0, at - 40);
      return `page ${i}: ${JSON.stringify(got.slice(from, at + 60))} where the file has ${JSON.stringify(text.slice(from, at + 60))}`;
    });
    throw new Error(`${e.message}\n${diff.join('\n')}`);
  }
}

/** The slide whose heading starts with heading shown, once reveal.js has made it the current slide. */
export async function show(page, heading) {
  await front(page);
  const ok = await page.evaluate(`(() => {
    const s = [...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector('h2')?.textContent.startsWith(${JSON.stringify(heading)}));
    if (!s) return false;
    const { h, v } = Reveal.getIndices(s);
    Reveal.slide(h, v);
    window.__shown = s;
    return true;
  })()`);
  assert.ok(ok, `the slide ${heading} is in the deck`);
  await page.waitFor('Reveal.getCurrentSlide() === window.__shown');
}

/** Asserts that the page threw nothing and loaded every file, apart from the errors of allowed. */
export function clean(page, allowed = []) {
  assert.deepEqual(page.errors.filter((e) => !allowed.some((a) => a.test(e))), []);
}
