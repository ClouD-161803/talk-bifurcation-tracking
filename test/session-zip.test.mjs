import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { deckSettled, deckUrl, launch } from '../scripts/chrome.mjs';
import { startRelay } from '../scripts/relay.mjs';
import { deckTex } from '../scripts/tex.mjs';
import { launch as launchWebDriver, serve } from '../scripts/webdriver.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, ONLINE, open, sessionUrl, show, SIGTERM_TELLS_THE_PAGES } from './helpers/client.mjs';
import { click, press as key, type } from './helpers/editor.mjs';
import { startEdit, stopEdit, talkFolder, until, within } from './helpers/session.mjs';
import { entries, unzipTo } from './helpers/zip.mjs';

const SECRET = 'the secret of the group for this test';
const NAME = 'My talk';
const ZIP = `${NAME}.zip`;
const MB = 1024 * 1024;
const WRAP = 'Beeson.trajectories(';
const PATH = ['File', 'Export To', 'Talk Folder…'];
const PHONES = 'On a phone or a tablet, a deck is opened from a web server, such as the site of the repository. The talk folder is downloaded as a zip, which is unzipped and presented on a computer.';
const DONE = `Unzip ${ZIP} first, unless your browser has already unzipped it. Then open index.html in the unzipped folder with a double click. On a phone or a tablet, a deck is opened from a web server instead.`;
const MOVED = `Move ${ZIP} to a computer and unzip it there. Then open index.html in the unzipped folder with a double click.`;
const FAILED = 'The talk folder could not be downloaded. Try again.';
const LEFT_OUT = ['.env', 'node_modules/x/a.js', 'check/a.png', 'slides.pdf', 'slides.pptx'];

function deck() {
  const text = readFileSync('test-deck.html', 'utf8');
  const sections = text.match(/<section[\s\S]*?<\/section>/g);
  const slide = (heading) => {
    const found = sections.find((s) => new RegExp(`<h[12][^>]*>${heading}`).test(s));
    assert.ok(found, `the slide ${heading} is in test-deck.html`);
    return found;
  };
  const swap = (s, from, to) => {
    assert.ok(s.includes(from), `${from} is in its slide of test-deck.html`);
    return s.split(from).join(to);
  };
  let videos = slide('Embedding videos');
  for (const mode of ['dark', 'light']) videos = swap(swap(videos, `demo/clip-${mode}.mp4`, 'media/clip.mp4'), `demo/clip-${mode}.png`, 'media/clip.png');
  const slides = [
    slide('Presenting in HTML'),
    swap(slide('Chapter one'), 'data-trajectories="demo/broucke-sample.js"', 'data-trajectories="data/broucke.json"'),
    swap(slide('Figures are first class citizens'), String.raw`\(\mathcal{L}_{1}\)`, String.raw`\(\LL{1}\)`),
    videos,
    '<section>\n  <h2>A TikZ figure</h2>\n  <div class="figure-box tikz" data-figure="cr3bp" style="width: 604px; height: 396px"></div>\n</section>',
  ];
  const head = text.slice(0, text.indexOf('<div class="slides">') + '<div class="slides">'.length);
  const tail = text.slice(text.indexOf('</div>\n</div>\n<script', text.lastIndexOf('</section>')));
  assert.ok(tail.includes('Beeson.start'), 'the scripts of test-deck.html are found');
  return `${head}\n\n${slides.join('\n\n')}\n\n${tail}`;
}

function build(folder) {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'index.html'), deck());
  for (const path of ['theme', 'brand', 'preamble.tex', 'references.bib', 'figures/cr3bp.tex', 'figures/cr3bp.js', 'demo/figure-dark.png', 'demo/figure-light.png']) {
    cpSync(resolve(path), join(folder, path), { recursive: true });
  }
  const tex = deckTex(join(folder, 'index.html'));
  writeFileSync(tex.file, tex.text);
  mkdirSync(join(folder, 'media'));
  cpSync(resolve('test/pages/clip-a.mp4'), join(folder, 'media/clip.mp4'));
  cpSync(resolve('test/pages/clip-a.png'), join(folder, 'media/clip.png'));
  const wrapped = readFileSync('demo/broucke-sample.js', 'utf8').trimEnd();
  assert.ok(wrapped.startsWith(WRAP) && wrapped.endsWith(');'), 'demo/broucke-sample.js is wrapped');
  mkdirSync(join(folder, 'data'));
  writeFileSync(join(folder, 'data/broucke.json'), wrapped.slice(WRAP.length, -2));
  for (const path of LEFT_OUT) {
    mkdirSync(join(folder, path, '..'), { recursive: true });
    writeFileSync(join(folder, path), 'left out\n');
  }
}

function files(folder, dir = '') {
  return readdirSync(join(folder, dir), { withFileTypes: true }).flatMap((e) => {
    const path = dir ? `${dir}/${e.name}` : e.name;
    if (path === '.session') return [];
    return e.isDirectory() ? files(folder, path) : [path];
  });
}

async function zipTalk(t, { relay = null, env = {} } = {}) {
  const { root, config } = talkFolder(t);
  const folder = join(root, NAME);
  build(folder);
  const relayed = relay ? { args: ['--relay', relay.url], env: { SLIDES_RELAY_SECRET: SECRET } } : { args: [], env: {} };
  const edit = await within(startEdit(folder, { args: relayed.args, env: { XDG_CONFIG_HOME: config, APPDATA: config, ...relayed.env, ...env } }), 60_000, 'the edit command to start');
  t.after(async () => {
    await stopEdit(edit);
    rmSync(root, { recursive: true, force: true });
  });
  if (relay) await until(async () => (await fetch(`${relay.url}/${edit.key}/index.html`)).status === 200, 'the edit command to register with the relay');
  return {
    root,
    folder,
    edit,
    read: () => readFileSync(join(folder, 'index.html'), 'utf8'),
    guestUrl: relay ? `${relay.url}/${edit.key}/index.html?edit&session` : null,
  };
}

const PAGE = `{
  const fetched = window.fetch;
  window.__zip = [];
  window.__hold = { op: false, piece: false };
  window.__held = [];
  window.__aborted = 0;
  window.fetch = function (input, init = {}) {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const method = (init.method ?? 'GET').toUpperCase();
    if (url.pathname.includes('/.session/zip')) window.__zip.push({ method, url: url.href });
    const op = url.pathname.endsWith('/.session/op');
    const piece = url.pathname.includes('/.session/zip/') && method === 'GET';
    if (piece && window.__hold.piece === 'gone') return Promise.resolve(new Response('{"error":"the zip is not kept any more"}', { status: 404 }));
    if (!(op && window.__hold.op) && !(piece && window.__hold.piece)) return fetched.call(this, input, init);
    return new Promise((done, fail) => {
      init.signal?.addEventListener('abort', () => (window.__aborted++, fail(new DOMException('The operation was aborted.', 'AbortError'))), { once: true });
      window.__held.push(() => fetched.call(this, input, init).then(done, fail));
    });
  };
  window.__release = () => {
    for (const go of window.__held.splice(0)) go();
    return true;
  };
  window.__saved = [];
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) window.__saved.push(this.download);
    return click.call(this);
  };
  window.__said = [];
  const read = () => {
    const d = [...document.querySelectorAll('dialog.beeson-edit-dialog')].find((d) => d.open && d.querySelector('h3')?.textContent === 'Talk Folder');
    const off = (b) => (!b.disabled && b.getAttribute('aria-disabled') !== 'true' ? '' : Number(getComputedStyle(b).opacity) < 1 ? ' (disabled)' : ' (disabled, but drawn as enabled)');
    const now = d ? { text: d.querySelector('p').textContent, buttons: [...d.querySelectorAll('.row button')].map((b) => b.textContent + off(b)) } : null;
    const last = window.__said.at(-1);
    if (JSON.stringify(now) !== JSON.stringify(last ?? null) && (now || last)) window.__said.push(now);
    if (now?.text === 'Sending your last changes…' && window.__hold.op === 'sending') {
      window.__hold.op = false;
      window.__release();
    }
  };
  new MutationObserver(read).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['open', 'disabled', 'aria-disabled'] });
  window.__pressed = [];
  document.addEventListener('click', (ev) => {
    const button = ev.target instanceof Element && ev.target.closest('dialog.beeson-edit-dialog .row button');
    if (button) window.__pressed.push(button.textContent);
  }, true);
}`;

const IPAD = `Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' });
Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 });
{
  const media = window.matchMedia.bind(window);
  window.matchMedia = (query) => media(/^\\(any-pointer: (coarse|fine)\\)$/.test(query) ? 'all' : query);
}`;

const PHONE = `Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Linux armv8l' });`;

const WINDOWS = `Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Win32' });`;

async function editorOn(browser, url, { script = '', ...options }) {
  const page = await open(browser, url, { ...options, script: `${PAGE}\n${script}`, ready: false });
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)', 60_000);
  await page.waitFor(ONLINE, 60_000);
  return page;
}

const texts = (said) => said.filter(Boolean).map((s) => s.text).filter((text, i, all) => text && text !== all[i - 1]);

async function centerOf(page, expression) {
  const read = `(() => {
    const el = ${expression};
    if (!el || !el.getClientRects().length) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`;
  await page.waitFor(`!!${read}`, 10_000);
  return page.evaluate(read);
}

const touch = (page, type, points) => page.send('Input.dispatchTouchEvent', { type, touchPoints: points });

async function press(page, expression, { tap = false } = {}) {
  const at = await centerOf(page, expression);
  if (!tap) return click(page, at);
  await touch(page, 'touchStart', [at]);
  await touch(page, 'touchEnd', []);
}

const TITLE = (bar) => `[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${JSON.stringify(bar)})`;
const ITEM = (label) => `[...document.querySelectorAll('.beeson-edit-menu .item')].filter((i) => i.getClientRects().length && i.querySelector('.label')?.textContent === ${JSON.stringify(label)}).at(-1)`;
const BUTTON = (label) => `[...document.querySelectorAll('dialog.beeson-edit-dialog[open] .row button')].find((b) => b.textContent === ${JSON.stringify(label)})`;

async function choose(page, [bar, ...items], { tap = false } = {}) {
  await front(page);
  await press(page, TITLE(bar), { tap });
  for (const [i, label] of items.entries()) {
    const at = await centerOf(page, ITEM(label));
    if (i < items.length - 1 && !tap) {
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
      await page.waitFor(`!!(${ITEM(items[i + 1])})`, 10_000);
    } else await press(page, ITEM(label), { tap });
  }
}

async function downloadsTo(page, dir) {
  mkdirSync(dir, { recursive: true });
  await page.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, eventsEnabled: true });
}

const downloaded = (dir, name, timeout = 60_000) =>
  until(() => {
    const names = readdirSync(dir);
    return names.includes(name) && !names.some((n) => n.endsWith('.crdownload')) && readFileSync(join(dir, name));
  }, `the download of ${name} in ${dir}`, timeout);

const H2 = (heading) => `[...document.querySelectorAll('.reveal .slides > section h2')].find((h) => h.textContent.startsWith(${JSON.stringify(heading)}))`;

function assertZip(zip, folder, text) {
  const all = entries(zip);
  const names = all.map((e) => e.name).sort();
  const expected = [...files(folder).filter((f) => f !== 'index.html' && !LEFT_OUT.includes(f)), 'index.html', 'data/broucke.json.js'].map((f) => `${NAME}/${f}`).sort();
  assert.deepEqual(names, expected);
  for (const path of LEFT_OUT) assert.ok(!names.includes(`${NAME}/${path}`), `${path} is left out`);
  const byName = new Map(all.map((e) => [e.name, e.bytes]));
  const json = readFileSync(join(folder, 'data/broucke.json'), 'utf8');
  assert.equal(byName.get(`${NAME}/data/broucke.json.js`).toString('utf8'), `${WRAP}${json});\n`);
  assert.ok(byName.get(`${NAME}/brand/transfer.js`).equals(readFileSync(join(folder, 'brand/transfer.js'))));
  const index = byName.get(`${NAME}/index.html`).toString('utf8');
  assert.equal(index, text.replace('data-trajectories="data/broucke.json"', 'data-trajectories="data/broucke.json.js"'));
  return all;
}

const onPath = (name) => (process.env.PATH ?? '').split(delimiter).some((dir) => dir && (existsSync(join(dir, name)) || existsSync(join(dir, `${name}.exe`))));

function cannotRun(browser) {
  if (browser === 'firefox') {
    const gecko = process.env.GECKOWEBDRIVER;
    const found = gecko ? ['geckodriver', 'geckodriver.exe'].some((n) => existsSync(join(gecko, n))) : onPath('geckodriver');
    return found ? null : 'geckodriver is not found in GECKOWEBDRIVER or on the PATH';
  }
  if (browser === 'safari') {
    if (process.platform !== 'darwin') return 'Safari runs on macOS only';
    return existsSync('/usr/bin/safaridriver') ? null : '/usr/bin/safaridriver is not found';
  }
  return null;
}

function check(browser, deck, out, limit) {
  const args = [resolve('scripts/check.mjs'), '--deck', deck, '--out', out, ...(browser === 'chrome' ? [] : ['--browser', browser])];
  const xvfb = browser === 'firefox' && process.platform === 'linux' && !process.env.DISPLAY && onPath('xvfb-run');
  const [command, argv] = xvfb ? ['xvfb-run', ['-a', '-s', '-screen 0 1920x1080x24', process.execPath, ...args]] : [process.execPath, args];
  return new Promise((done) => {
    const unix = process.platform !== 'win32';
    const child = spawn(command, argv, { stdio: ['ignore', 'pipe', 'pipe'], detached: unix });
    let output = '';
    const timer = setTimeout(() => {
      output += `\nkilled after ${limit} ms`;
      try {
        if (unix) process.kill(-child.pid, 'SIGKILL');
        else spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      } catch {
        child.kill();
      }
    }, limit);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => (output += chunk));
    child.once('error', (e) => (output += `\n${e.message}`));
    child.once('close', (code) => {
      clearTimeout(timer);
      done({ code, output });
    });
  });
}

const SAFARI_OFF = /Allow remote automation|safaridriver --enable|did not start|session not created|Could not create a session|the page is hidden/i;

const WARNINGS = `window.__warnings = [];
  { const warn = console.warn; console.warn = function (...a) { window.__warnings.push(a.map(String).join(' ')); return warn.apply(this, a); }; }`;

async function backdropsDrawn(name, deckFile) {
  const chrome = name === 'chrome';
  const site = name === 'safari' ? await serve(dirname(deckFile)) : null;
  const browser = chrome ? await launch() : await launchWebDriver(name);
  try {
    const page = await browser.newPage();
    if (chrome) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: WARNINGS });
    const from = site ? `${site.origin}/` : 'file:';
    await page.goto(site ? `${site.origin}/index.html?still` : deckUrl(deckFile, 'still'));
    await page.waitFor(deckSettled, 60_000);
    assert.ok((await page.evaluate('location.href')).startsWith(from), `the deck is opened from ${from}`);
    const read = (path) => `(async () => {
      const b = Beeson.backdrops.find((b) => b.el.dataset.trajectories === ${JSON.stringify(path)});
      if (!b) return null;
      const { h, v } = Reveal.getIndices(b.el.closest('section'));
      Reveal.slide(h, v);
      await b.ready;
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      return { trajectories: b.trajectories.length, painted: b.base.getContext('2d').getImageData(0, 0, b.base.width, b.base.height).data.some(Boolean) };
    })()`;
    for (const path of ['data/broucke.json.js', 'brand/transfer.js']) {
      await page.waitFor(`${read(path)}.then((r) => !!r?.painted)`, 30_000).catch(() => {});
      const seen = await page.evaluate(read(path));
      assert.ok(seen && seen.trajectories > 0 && seen.painted, `in ${name}, the backdrop of ${path} reads ${JSON.stringify(seen)}`);
    }
    if (chrome) {
      assert.deepEqual((await page.evaluate('window.__warnings')).filter((w) => /is not drawn/.test(w)), []);
      assert.deepEqual(page.errors, []);
    }
    assert.deepEqual(await page.evaluate(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => !n.startsWith(${JSON.stringify(from)}))`), []);
  } finally {
    await browser.close();
    await site?.close();
  }
}

test('a guest downloads the talk folder through the relay with its last edit, and the unzipped deck is shown in Chrome, Firefox, and Safari with the backdrop of its wrapped file', { timeout: 2_520_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => relay.close());
  const server = await zipTalk(t, { relay });
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  let guestZip = null;
  let deckFile = null;

  await t.test('the guest chooses File > Export To > Talk Folder… right after an edit, and the zip holds the edit', { timeout: 420_000 }, async () => {
    const guest = await editorOn(browser, server.guestUrl, { name: 'Ben' });
    assert.equal(await guest.evaluate(`${C}.host`), false);
    const dir = join(server.root, 'guest downloads');
    await downloadsTo(guest, dir);
    await show(guest, 'Figures');
    await guest.evaluate(`window.__hold.op = 'sending'`);
    await caretAtEnd(guest, H2('Figures'));
    await type(guest, ' and a guest');
    await choose(guest, PATH);
    const zip = await downloaded(dir, ZIP);
    await guest.waitFor(`window.__said.at(-1)?.text === ${JSON.stringify(DONE)}`, 10_000);
    const said = await guest.evaluate('window.__said');
    assert.deepEqual(said.at(-1), { text: DONE, buttons: ['Done'] });
    const shown = texts(said);
    const size = (zip.length / MB).toFixed(1);
    assert.deepEqual(shown.slice(0, 2), ['Sending your last changes…', 'The zip is being built on the computer of the host…']);
    const progress = shown.slice(2, -1);
    assert.ok(progress.length >= 2, `the progress reads ${JSON.stringify(progress)}`);
    for (const line of progress) assert.match(line, new RegExp(`^Downloading ${NAME}\\.zip: \\d+\\.\\d of ${size.replace('.', '\\.')} MB$`));
    assert.equal(progress[0], `Downloading ${ZIP}: 0.0 of ${size} MB`);
    assert.equal(progress.at(-1), `Downloading ${ZIP}: ${size} of ${size} MB`);
    assert.deepEqual(await guest.evaluate('window.__saved'), [ZIP]);
    assert.deepEqual(readdirSync(dir), [ZIP]);

    const requests = await guest.evaluate('window.__zip');
    const piece = requests.find((r) => r.method === 'GET');
    assert.ok(piece && requests.some((r) => r.method === 'DELETE'), JSON.stringify(requests));
    assert.ok(piece.url.startsWith(`${relay.url}/${server.edit.key}/.session/zip/`), piece.url);
    await until(async () => (await fetch(piece.url)).status === 404, 'a piece of the freed zip to be answered 404');
    await until(() => relay.held() === 0, 'the relay to hold no bytes');

    await press(guest, BUTTON('Done'));
    await guest.waitFor('window.__said.at(-1) === null');
    const text = await converge(server, [guest]);
    assert.match(text, /<h2>Figures are first class citizens, too and a guest<\/h2>/);
    assertZip(zip, server.folder, text);
    const file = join(server.root, 'guest.zip');
    writeFileSync(file, zip);
    const tool = unzipTo(file, zip, join(server.root, 'unzipped'));
    t.diagnostic(`unzipped with ${tool}`);
    deckFile = join(server.root, 'unzipped', NAME, 'index.html');
    assert.ok(statSync(deckFile).isFile());
    guestZip = zip;
    clean(guest);
    await guest.close();
  });

  await t.test('the host has the command, and downloads the same folder directly', { timeout: 300_000 }, async () => {
    const host = await editorOn(browser, sessionUrl(server.edit), { name: 'Ann' });
    assert.equal(await host.evaluate(`${C}.host`), true);
    const dir = join(server.root, 'host downloads');
    await downloadsTo(host, dir);
    await choose(host, PATH);
    const zip = await downloaded(dir, ZIP);
    await host.waitFor(`window.__said.at(-1)?.text === ${JSON.stringify(DONE)}`, 10_000);
    const shown = texts(await host.evaluate('window.__said'));
    assert.equal(shown[0], 'The zip is being built…');
    const requests = await host.evaluate('window.__zip');
    assert.ok(requests[0].url.startsWith(server.edit.url), requests[0].url);
    const all = assertZip(zip, server.folder, server.read());
    assert.ok(guestZip, 'the guest downloaded the folder');
    assert.deepEqual(all.map((e) => e.name), entries(guestZip).map((e) => e.name));
    clean(host);
    await host.close();
  });

  for (const name of ['chrome', 'firefox', 'safari']) {
    const titles = [`scripts/check.mjs shows the unzipped deck in ${name} without a page error`, `in ${name}, the backdrops of the wrapped file and of brand/transfer.js draw their trajectories`];
    const reason = cannotRun(name);
    if (reason) {
      t.diagnostic(`${name}: not run, since ${reason}`);
      for (const title of titles) await t.test(title, { skip: reason }, () => {});
      continue;
    }
    let off = false;
    await t.test(titles[0], { timeout: 300_000 }, async (s) => {
      assert.ok(deckFile, 'the deck was unzipped');
      const start = Date.now();
      const { code, output } = await check(name, deckFile, join(server.root, `check ${name}`), 270_000);
      t.diagnostic(`${name}: check.mjs ran ${((Date.now() - start) / 1000).toFixed(1)} s`);
      if (name === 'safari' && code !== 0 && SAFARI_OFF.test(output)) {
        off = true;
        t.diagnostic(`safari: not run, since Safari could not be driven:\n${output.slice(-600)}`);
        s.skip('Safari could not be driven');
        return;
      }
      assert.equal(code, 0, output);
      assert.match(output, /no page errors/);
      assert.match(output, /dark: 5 slides saved/);
    });
    await t.test(titles[1], { skip: off && 'Safari could not be driven', timeout: 240_000 }, async () => {
      assert.ok(deckFile, 'the deck was unzipped');
      await backdropsDrawn(name, deckFile);
    });
  }
});

test('on a phone, Talk Folder… is reached through the File menu, tells about phones and tablets first, and downloads the zip only after Download', { timeout: 540_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await zipTalk(t);
  const phone = await editorOn(browser, `${sessionUrl(server.edit)}&edit-platform=other`, { name: 'Cy', width: 390, height: 844, mobile: true, script: PHONE });
  assert.deepEqual(await phone.evaluate(`[matchMedia('(any-pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches, navigator.platform]`), [true, 'Linux armv8l'], 'the page has a touch screen alone');
  const dir = join(server.root, 'phone downloads');
  await downloadsTo(phone, dir);

  await choose(phone, PATH, { tap: true });
  await phone.waitFor(`window.__said.at(-1)?.text === ${JSON.stringify(PHONES)}`);
  assert.deepEqual(await phone.evaluate('window.__said'), [{ text: PHONES, buttons: ['Cancel', 'Download'] }]);
  await press(phone, BUTTON('Cancel'), { tap: true });
  await phone.waitFor('window.__said.at(-1) === null');
  assert.deepEqual(await phone.evaluate('({ zip: window.__zip, saved: window.__saved })'), { zip: [], saved: [] });

  await choose(phone, PATH, { tap: true });
  await phone.waitFor(`window.__said.at(-1)?.text === ${JSON.stringify(PHONES)}`);
  const described = `document.getElementById(document.querySelector('dialog.beeson-edit-dialog[open]').getAttribute('aria-describedby'))`;
  assert.equal(await phone.evaluate(`${described}?.textContent`), PHONES);
  assert.equal(await phone.evaluate(`${described}.getAttribute('aria-live')`), 'polite');
  await phone.evaluate('window.__hold.piece = true');
  await press(phone, BUTTON('Download'), { tap: true });
  await phone.waitFor(`window.__held.length > 0 && /^Downloading ${NAME}\\.zip: 0\\.0 of /.test(window.__said.at(-1)?.text)`);
  const way = `({ buttons: window.__said.at(-1)?.buttons, focus: document.activeElement?.textContent, posts: window.__zip.filter((r) => r.method === 'POST').length })`;
  const held = { buttons: ['Cancel', 'Download (disabled)'], focus: 'Download', posts: 1 };
  assert.deepEqual(await phone.evaluate(way), held);
  await press(phone, BUTTON('Download'), { tap: true });
  await key(phone, 'Enter');
  await phone.waitFor(`window.__pressed.join() === 'Cancel,Download,Download,Download'`).catch(() => {});
  assert.deepEqual(await phone.evaluate('window.__pressed'), ['Cancel', 'Download', 'Download', 'Download']);
  assert.deepEqual(await phone.evaluate(way), held);
  await phone.evaluate('(window.__hold.piece = false, window.__release())');
  const zip = await downloaded(dir, ZIP);
  await phone.waitFor(`window.__said.at(-1)?.text === ${JSON.stringify(MOVED)}`, 10_000);
  const said = await phone.evaluate('window.__said');
  const states = said.slice(said.lastIndexOf(null) + 1);
  assert.deepEqual(states[0], { text: PHONES, buttons: ['Cancel', 'Download'] });
  assert.deepEqual(states.at(-1), { text: MOVED, buttons: ['Done'] });
  assert.ok(states.length > 2, JSON.stringify(states));
  for (const state of states.slice(1, -1)) assert.deepEqual(state.buttons, ['Cancel', 'Download (disabled)'], JSON.stringify(state));
  assert.deepEqual(await phone.evaluate('window.__saved'), [ZIP]);
  assert.deepEqual(readdirSync(dir), [ZIP]);
  assert.equal((await phone.evaluate('window.__zip')).filter((r) => r.method === 'POST').length, 1);
  assertZip(zip, server.folder, server.read());
  clean(phone);
});

test('a tablet with a trackpad is told about phones and tablets as well, and to move the zip to a computer', { timeout: 420_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await zipTalk(t);
  const tablet = await editorOn(browser, sessionUrl(server.edit), { name: 'Di', script: IPAD });
  assert.deepEqual(await tablet.evaluate(`[matchMedia('(any-pointer: coarse)').matches, matchMedia('(any-pointer: fine)').matches, navigator.platform, navigator.maxTouchPoints]`), [true, true, 'MacIntel', 5]);
  const dir = join(server.root, 'tablet downloads');
  await downloadsTo(tablet, dir);
  await choose(tablet, PATH);
  await tablet.waitFor(`window.__said.at(-1)?.text === ${JSON.stringify(PHONES)}`);
  assert.deepEqual(await tablet.evaluate('({ said: window.__said, zip: window.__zip })'), { said: [{ text: PHONES, buttons: ['Cancel', 'Download'] }], zip: [] });
  await press(tablet, BUTTON('Download'));
  await downloaded(dir, ZIP);
  await tablet.waitFor(`window.__said.at(-1)?.text === ${JSON.stringify(MOVED)}`, 10_000);
  assert.deepEqual(await tablet.evaluate('window.__saved'), [ZIP]);
  clean(tablet);
});

test('a tablet of Windows without a keyboard or a mouse downloads the zip at once, as a computer does', { timeout: 420_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await zipTalk(t);
  const tablet = await editorOn(browser, `${sessionUrl(server.edit)}&edit-platform=other`, { name: 'Eve', width: 1280, height: 800, mobile: true, script: WINDOWS });
  assert.deepEqual(await tablet.evaluate(`[matchMedia('(any-pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches, navigator.platform]`), [true, 'Win32']);
  const dir = join(server.root, 'tablet downloads');
  await downloadsTo(tablet, dir);
  await choose(tablet, PATH, { tap: true });
  await downloaded(dir, ZIP);
  await tablet.waitFor(`window.__said.at(-1)?.text === ${JSON.stringify(DONE)}`, 10_000);
  const said = await tablet.evaluate('window.__said');
  assert.deepEqual(said.filter((state) => state.text === PHONES || state.buttons.includes('Download')), [], JSON.stringify(said));
  assert.deepEqual(await tablet.evaluate('window.__saved'), [ZIP]);
  clean(tablet);
});

test('a guest whose talk folder is over the limit of a download is told its size and the limit, and nothing is downloaded', { timeout: 360_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => relay.close());
  const server = await zipTalk(t, { relay, env: { SLIDES_ZIP_MAX_BYTES: String(MB) } });
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const guest = await editorOn(browser, server.guestUrl, { name: 'Ben' });
  const dir = join(server.root, 'guest downloads');
  await downloadsTo(guest, dir);
  await choose(guest, PATH);
  await guest.waitFor(`window.__said.at(-1)?.buttons?.join() === 'Close'`);
  const index = Buffer.byteLength(server.read()) + '.js'.length;
  const bytes = files(server.folder).filter((f) => f !== 'index.html' && !LEFT_OUT.includes(f)).reduce((n, f) => n + statSync(join(server.folder, f)).size, index);
  const size = (Math.ceil((bytes / MB) * 10) / 10).toFixed(1);
  assert.deepEqual((await guest.evaluate('window.__said')).at(-1), { text: `The talk folder is ${size} MB, over the limit of 1 MB for a download.`, buttons: ['Close'] });
  assert.deepEqual(await guest.evaluate('window.__zip.map((r) => r.method)'), ['POST']);
  assert.deepEqual(await guest.evaluate('window.__saved'), []);
  assert.deepEqual(readdirSync(dir), []);
  await press(guest, BUTTON('Close'));
  await guest.waitFor('window.__said.at(-1) === null');
  clean(guest, [/status of 413/]);
});

test('a page whose file of the talk folder changes during the download is told the name of the file, and nothing is downloaded', { timeout: 360_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await zipTalk(t);
  const host = await editorOn(browser, sessionUrl(server.edit), { name: 'Ann' });
  const dir = join(server.root, 'downloads');
  await downloadsTo(host, dir);
  await host.evaluate('window.__hold.piece = true');
  await choose(host, PATH);
  await host.waitFor('window.__held.length > 0');
  writeFileSync(join(server.folder, 'media/clip.mp4'), 'a shorter clip');
  await host.evaluate('(window.__hold.piece = false, window.__release())');
  await host.waitFor(`window.__said.at(-1)?.buttons?.join() === 'Close'`, 60_000);
  assert.deepEqual((await host.evaluate('window.__said')).at(-1), { text: 'The file media/clip.mp4 changed while the talk folder was downloaded. Try again.', buttons: ['Close'] });
  assert.deepEqual(await host.evaluate('window.__saved'), []);
  assert.deepEqual(readdirSync(dir), []);
  clean(host, [/status of 409/, /status of 404/]);
});

test('Cancel during a download closes the dialog, downloads nothing, and the edit command frees the zip', { timeout: 360_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await zipTalk(t);
  const host = await editorOn(browser, sessionUrl(server.edit), { name: 'Ann' });
  const dir = join(server.root, 'downloads');
  await downloadsTo(host, dir);
  await host.evaluate('window.__hold.piece = true');
  await choose(host, PATH);
  await host.waitFor(`window.__held.length > 0 && /^Downloading ${NAME}\\.zip: 0\\.0 of /.test(window.__said.at(-1)?.text)`);
  await press(host, BUTTON('Cancel'));
  await host.waitFor('window.__said.at(-1) === null');
  const piece = (await host.evaluate('window.__zip')).find((r) => r.method === 'GET');
  await until(async () => (await host.evaluate(`window.__zip.some((r) => r.method === 'DELETE')`)) && (await fetch(piece.url)).status === 404, 'the zip to be freed');
  const asked = await host.evaluate('window.__held.length');
  await host.evaluate('(window.__hold.piece = false, window.__release())');
  assert.deepEqual(await host.evaluate('window.__saved'), []);
  assert.deepEqual(readdirSync(dir), []);
  assert.deepEqual(await host.evaluate('window.__zip.map((r) => r.method)'), ['POST', ...Array(asked).fill('GET'), 'DELETE']);
  clean(host);
});

test('on a Mac, Return during a download does not press Cancel, which Space presses', { timeout: 360_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await zipTalk(t);
  const host = await editorOn(browser, `${sessionUrl(server.edit)}&edit-platform=mac`, { name: 'Ann' });
  await host.evaluate('window.__hold.piece = true');
  await choose(host, PATH);
  await host.waitFor(`window.__held.length > 0 && /^Downloading ${NAME}\\.zip: 0\\.0 of /.test(window.__said.at(-1)?.text)`);
  const seen = `({ buttons: window.__said.at(-1)?.buttons, focus: document.activeElement?.textContent, pressed: window.__pressed, zip: window.__zip.map((r) => r.method) })`;
  const way = { buttons: ['Cancel'], focus: 'Cancel', pressed: [], zip: ['POST', ...Array(await host.evaluate('window.__held.length')).fill('GET')] };
  assert.deepEqual(await host.evaluate(seen), way);
  await key(host, 'Enter');
  assert.deepEqual(await host.evaluate(seen), way);
  await key(host, 'Space');
  await host.waitFor('window.__said.at(-1) === null');
  assert.deepEqual(await host.evaluate('window.__pressed'), ['Cancel']);
  await host.waitFor(`window.__zip.some((r) => r.method === 'DELETE')`);
  await host.evaluate('(window.__hold.piece = false, window.__release())');
  assert.deepEqual(await host.evaluate('window.__saved'), []);
  clean(host);
});

test('the end of the session closes the dialog of a download that is on its way or that failed, and not the one of a finished download', { timeout: 840_000, skip: !SIGTERM_TELLS_THE_PAGES && 'signals' }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await zipTalk(t);
  const pages = [];
  for (const name of ['Ann', 'Ben', 'Cy']) pages.push(await editorOn(browser, sessionUrl(server.edit), { name }));
  const [waiting, refused, finished] = pages;
  const HOME = `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Navigator')`;
  for (const page of [waiting, refused]) await page.evaluate(`(${HOME}.focus(), true)`);
  await waiting.evaluate('window.__hold.piece = true');
  await choose(waiting, PATH);
  await waiting.waitFor(`window.__held.length > 0 && /^Downloading ${NAME}\\.zip: 0\\.0 of /.test(window.__said.at(-1)?.text)`);
  await refused.evaluate(`window.__hold.piece = 'gone'`);
  await choose(refused, PATH);
  await refused.waitFor(`window.__said.at(-1)?.text === ${JSON.stringify(FAILED)}`);
  assert.deepEqual((await refused.evaluate('window.__said')).at(-1), { text: FAILED, buttons: ['Close'] });
  await downloadsTo(finished, join(server.root, 'downloads'));
  await choose(finished, PATH);
  await finished.waitFor(`window.__said.at(-1)?.text === ${JSON.stringify(DONE)}`, 60_000);

  await stopEdit(server.edit);
  const open = `[...document.querySelectorAll('dialog.beeson-edit-dialog[open] h3')].map((h) => h.textContent).sort()`;
  for (const page of [waiting, refused]) {
    await page.waitFor(`${open}.join() === 'The session has ended'`, 30_000);
    assert.equal((await page.evaluate('window.__said')).at(-1), null);
    assert.equal(await page.evaluate('document.activeElement?.textContent'), 'Close');
    await press(page, BUTTON('Close'));
    await page.waitFor(`${open}.length === 0`, 10_000);
    assert.equal(await page.evaluate(`document.activeElement === ${HOME}`), true, 'the focus is on the button that had it before Talk Folder…');
  }
  await waiting.waitFor(`window.__aborted === window.__held.length`, 10_000);
  assert.deepEqual((await waiting.evaluate('window.__said')).filter((state) => state && state.buttons.join() !== 'Cancel'), []);
  await finished.waitFor(`${open}.join() === 'Talk Folder,The session has ended'`, 30_000);
  assert.deepEqual((await finished.evaluate('window.__said')).at(-1), { text: DONE, buttons: ['Done'] });
  await waiting.evaluate('(window.__hold.piece = false, window.__release())');
  assert.deepEqual(await waiting.evaluate('window.__saved'), []);
  assert.deepEqual(await refused.evaluate('window.__saved'), []);
});

test('a page that edits without a session does not have Talk Folder…, and Export To lists PDF…, Editable HTML…, and PowerPoint…', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const { root } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const folder = join(root, NAME);
  build(folder);
  const site = await serve(folder);
  t.after(() => site.close());
  for (const url of [deckUrl(join(folder, 'index.html'), 'edit'), `${site.origin}/index.html?edit`]) {
    const page = await browser.newPage({ width: 1280, height: 800 });
    await page.goto(url);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)', 60_000);
    const seen = await page.evaluate(`(() => {
      const E = window.BeesonEditor;
      let defined = true;
      try { E.state('file.export.folder'); } catch { defined = false; }
      return { session: !!window.BeesonSession, defined, items: window.BeesonEditorShell.menuItems('File', 'Export To').map((i) => E.state(i.command).label) };
    })()`);
    assert.deepEqual(seen, { session: false, defined: false, items: ['PDF…', 'Editable HTML…', 'PowerPoint…'] }, url);
    await page.close();
  }
});

test('a guest downloads the single web page through the relay with its last edit, the bytes that the host gets, and the deck of the file is shown alone', { timeout: 600_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => relay.close());
  const server = await zipTalk(t, { relay });
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const guest = await editorOn(browser, server.guestUrl, { name: 'Ben' });
  const dir = join(server.root, 'guest downloads');
  await downloadsTo(guest, dir);
  await show(guest, 'Figures');
  await caretAtEnd(guest, H2('Figures'));
  await type(guest, ' and a guest');
  await choose(guest, ['File', 'Export To', 'Single Web Page…']);
  const single = await downloaded(dir, `${NAME}.html`);
  const told = `${NAME}.html holds the whole talk. Open it with a double click, without the talk folder and without a network.`;
  await guest.waitFor(`[...document.querySelectorAll('dialog.beeson-edit-dialog[open]')].some((d) => d.querySelector('h3')?.textContent === 'Single Web Page' && d.querySelector('p').textContent === ${JSON.stringify(told)})`, 60_000);
  assert.deepEqual(await guest.evaluate('window.__saved'), [`${NAME}.html`]);
  const html = single.toString('utf8');
  assert.match(html, /<h2>Figures are first class citizens, too and a guest<\/h2>/);
  await until(() => relay.held() === 0, 'the relay to hold no bytes');

  const hello = await fetch(`http://127.0.0.1:${server.edit.port}/${server.edit.key}/.session/hello`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Host' }) });
  const { token } = await hello.json();
  const made = await (await fetch(`http://127.0.0.1:${server.edit.port}/${server.edit.key}/.session/single?token=${token}`, { method: 'POST' })).json();
  const pieces = [];
  for (let at = 0; at < made.size; at += 2 * MB) pieces.push(Buffer.from(await (await fetch(`http://127.0.0.1:${server.edit.port}/${server.edit.key}/.session/single/${made.id}?token=${token}&at=${at}`)).arrayBuffer()));
  assert.ok(Buffer.concat(pieces).equals(single), 'the guest gets the bytes of the host');

  const alone = join(server.root, 'alone');
  mkdirSync(alone);
  writeFileSync(join(alone, `${NAME}.html`), single);
  const offline = await launch();
  t.after(() => offline.close());
  const page = await offline.newPage();
  await page.goto(deckUrl(join(alone, `${NAME}.html`), '?still'));
  await page.waitFor('window.Reveal?.isReady?.()', 120_000);
  await page.evaluate(deckSettled);
  assert.equal(await page.evaluate('Reveal.getTotalSlides()'), 3);
  assert.ok(await page.evaluate(`[...document.querySelectorAll('.reveal h2')].some((h) => h.textContent === 'Figures are first class citizens, too and a guest')`));
  assert.deepEqual(page.errors, []);
});
