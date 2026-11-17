// Headless Chrome driven over the DevTools protocol, used in scripts/check.mjs and
// scripts/export-pdf.mjs. The protocol is used in place of the --dump-dom, --screenshot, and
// --print-to-pdf flags, since requestAnimationFrame is stopped after one or two frames under these
// flags, and it is awaited in the print layout of reveal.js. The messages are sent over
// --remote-debugging-pipe as JSON terminated with a NUL byte, on file descriptors 3 and 4, hence an
// npm package is not required.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function chromePaths(env, platform) {
  if (platform === 'darwin') return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  if (platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
    return [
      ...roots.map((root) => join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')),
      ...roots.map((root) => join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    ];
  }
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  return (env.PATH ?? '').split(delimiter).flatMap((dir) => names.map((name) => join(dir, name)));
}

export function findChrome({ env = process.env, platform = process.platform } = {}) {
  const paths = env.CHROME_PATH ? [env.CHROME_PATH] : chromePaths(env, platform);
  const path = paths.find((candidate) => existsSync(candidate));
  if (!path) {
    const where = env.CHROME_PATH ? ` at ${env.CHROME_PATH}` : '';
    throw new Error(`Chrome not found${where}. Set CHROME_PATH to the Chrome executable.`);
  }
  return path;
}

export function deckUrl(deck, query = '', hash = '') {
  return `${pathToFileURL(resolve(deck)).href}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// after the browser has exited, files can still be written to the profile, hence the whole removal
// is retried. The retries of rmSync are not enough, since only the last rmdir is repeated with them
export async function removeProfile(profile) {
  for (let attempt = 1; ; attempt++) {
    try {
      rmSync(profile, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 25) throw error;
      await sleep(200);
    }
  }
}

/** Returns the Chrome flags for a profile, offline mode, frame rastering, platform, and CI. */
export function chromeArgs({ profile, offline = true, wholeFrames = false, platform = process.platform, ci = Boolean(process.env.CI) } = {}) {
  return [
    '--headless=new',
    '--remote-debugging-pipe',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--mute-audio',
    // WebGL is required in the tycho viewer, and without a GPU it is not available in Chromium 159
    // unless this flag is set
    '--enable-unsafe-swiftshader',
    // the paravirtual GPU of the macOS runners of GitHub fails at times to create a WebGL context,
    // hence WebGL is drawn there in SwiftShader, as on the Linux runners
    ...(ci && platform === 'darwin' ? ['--use-angle=swiftshader'] : []),
    // the sandbox of Chrome cannot be started on the Ubuntu runners of GitHub, and the pages are local
    ...(platform === 'linux' ? ['--no-sandbox'] : []),
    // on Windows 11 and Server 2025, TcpPortRandomizationWin sets SO_RANDOMIZE_PORT and causes
    // spurious net::ERR_NO_BUFFER_SPACE on rapid 127.0.0.1 loopback fetches, including inside iframes
    ...(platform === 'win32' ? ['--disable-features=TcpPortRandomizationWin'] : []),
    // without offline, only the server of scripts/webdriver.mjs at 127.0.0.1 is reached. With the
    // network, Chrome downloads components and models into the profile in the background, and on
    // Windows such a file is still locked when the profile is removed
    `--host-resolver-rules=MAP * ~NOTFOUND${offline ? '' : ', EXCLUDE 127.0.0.1'}`,
    // without it, a frame is drawn while the tiles of a layer that the scroll has brought into view
    // are rastered, and the layer is left out of the frame. a fragment is a layer of its own, with
    // will-change: opacity in reveal.css
    ...(wholeFrames ? ['--run-all-compositor-stages-before-draw'] : []),
    // on Linux and Windows, text over an opaque ground is drawn with subpixel antialiasing, whose
    // color fringes stay in a picture shown on another screen. the picture of the words of a step,
    // taken over a transparent ground, has gray edges, hence it differs from the print view there
    ...(wholeFrames ? ['--disable-lcd-text'] : []),
    'about:blank',
  ];
}

/**
 * Starts Chrome and returns an object with newPage() and close(). With offline set, every host
 * name is mapped to a failed lookup, thus each network load of a deck is reported as an error.
 * Without it, only 127.0.0.1 is reached. A request that is not answered within timeout ms fails.
 * A step of the setup of a new page is given setup ms, at most timeout ms, before the page is tried
 * again. With wholeFrames set, a frame is drawn only once every layer in it is rastered, which a screenshot
 * after a scroll and heavy work in the page needs, see scripts/export-pptx.mjs, and text is drawn
 * without subpixel antialiasing.
 */
export async function launch({ offline = true, timeout = 120000, setup = 15000, wholeFrames = false } = {}) {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'beeson-chrome-'));
  const args = chromeArgs({ profile, offline, wholeFrames });
  const child = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  // the crashes of the network service of Chrome, which Chrome reports on stderr and starts again
  let networkCrashes = 0;
  const onNetworkCrash = new Set();
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-2000);
    if (!chunk.includes('Network service crashed')) return;
    networkCrashes++;
    for (const listener of onNetworkCrash) listener();
  });
  let hasExited = false;
  // set once Chrome has answered a Target.createTarget
  let started = false;
  const exited = new Promise((done) => child.once('exit', (...a) => {
    hasExited = true;
    done(...a);
  }));
  // rejected when Chrome exits, so that a request in flight is not left unsettled
  const crashed = new Promise((_, fail) => {
    child.once('exit', (code, signal) => fail(new Error(`Chrome exited with ${signal ?? `code ${code}`}\n${stderr}`)));
  });
  crashed.catch(() => {});
  // a write after an exit of Chrome fails, and the exit is reported with crashed
  child.stdio[3].on('error', () => {});

  function answered(promise, what, limit = timeout) {
    let timer;
    const late = new Promise((_, fail) => {
      timer = setTimeout(() => fail(new Error(`Chrome did not answer ${what} within ${limit} ms\n${stderr}`)), limit);
    });
    return Promise.race([promise, late, crashed]).finally(() => clearTimeout(timer));
  }

  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  let buffer = '';
  child.stdio[4].setEncoding('utf8');
  child.stdio[4].on('data', (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\0')) >= 0) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (message.id && pending.has(message.id)) {
        const { done, fail } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) fail(new Error(`${message.error.message} (${message.error.code})`));
        else done(message.result);
      } else if (message.method) {
        for (const listener of listeners) listener(message);
      }
    }
  });

  function send(method, params = {}, sessionId, limit = timeout) {
    const id = nextId++;
    child.stdio[3].write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    // an expression that is not answered is named by its start, to tell which read of a test hung
    const what = typeof params.expression === 'string' ? `${method} of ${params.expression.slice(0, 300)}` : method;
    return answered(new Promise((done, fail) => pending.set(id, { done, fail, sessionId })), what, limit)
      .finally(() => pending.delete(id));
  }

  // fails the calls in flight to the page of a session, which Chrome does not answer once the page
  // is closed
  function failCalls(sessionId, error) {
    for (const call of pending.values()) if (call.sessionId === sessionId) call.fail(error);
  }

  // with mobile set, the page is laid out as on a phone, with touch and a coarse pointer, and scale
  // is the device pixel ratio. with motion set, the page is shown without reduced motion, which is
  // the setting of the macOS and Windows runners of GitHub, hence a backdrop is traced there too.
  // without drafts, the unsaved edits that the editor keeps in the storage of the browser 1 s after
  // its last change are not written, since they were offered on a dialog to the next page of a test
  async function newPage({ width = 1920, height = 1080, mobile = false, scale = 1, motion = false, drafts = false } = {}) {
    // on Windows runners, a fresh about:blank tab right after closing a page can hang or detach
    // before answering Page.enable. close a wedged tab and try another target twice at most
    const setupLimit = Math.min(timeout, setup);
    const cleanupLimit = Math.min(timeout, 2000);
    let targetId;
    let sessionId;
    let call;
    let errors;
    let onEvent;
    // set by close() of the page
    let closed = false;
    for (let n = 0; ; n++) {
      targetId = null;
      errors = [];
      onEvent = null;
      let onCrash;
      try {
        // the first target is given the whole timeout. on a fresh Windows runner, Chrome answers its
        // first commands after up to a minute, and a try again does not help (issue #136)
        ({ targetId } = await send('Target.createTarget', { url: 'about:blank' }, undefined, started ? setupLimit : timeout));
        started = true;
        ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }, undefined, setupLimit));
        call = (method, params, limit = timeout) => send(method, params, sessionId, limit);
        onEvent = ({ method, params, sessionId: from }) => {
          if (from !== sessionId) return;
          if (method === 'Runtime.exceptionThrown') {
            const details = params.exceptionDetails;
            errors.push(details.exception?.description ?? details.text);
          } else if (method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(params.type)) {
            errors.push(`console.${params.type}: ${params.args.map((a) => a.value ?? a.description).join(' ')}`);
          } else if (method === 'Log.entryAdded' && (params.entry.level === 'error' || params.entry.text.includes('GL_INVALID'))) {
            // failed loads of scripts, styles, fonts, and images are reported here, and an invalid call
            // of WebGL only as a warning
            errors.push(`${params.entry.text} ${params.entry.url ?? ''}`.trim());
          }
        };
        listeners.add(onEvent);
        const targetLost = new Promise((_, fail) => {
          onCrash = ({ method, params, sessionId: from }) => {
            if (
              (from === sessionId && method === 'Inspector.targetCrashed') ||
              (method === 'Target.targetCrashed' && params?.targetId === targetId) ||
              (method === 'Target.detachedFromTarget' && params?.sessionId === sessionId)
            ) {
              fail(new Error(`Chrome target ${targetId} closed during setup (${method})`));
            }
          };
          listeners.add(onCrash);
        });
        targetLost.catch(() => {});
        const settingUp = (async () => {
          await Promise.all([
            call('Page.enable', {}, setupLimit),
            call('Runtime.enable', {}, setupLimit),
            call('Log.enable', {}, setupLimit),
          ]);
          await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile }, setupLimit);
          if (mobile) await call('Emulation.setTouchEmulationEnabled', { enabled: true }, setupLimit);
          if (motion) await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }, setupLimit);
          if (!drafts) {
            await call('Page.addScriptToEvaluateOnNewDocument', {
              source: `{
                const set = Storage.prototype.setItem;
                Storage.prototype.setItem = function (key, value) {
                  if (!String(key).startsWith('beeson-draft:')) set.call(this, key, value);
                };
              }`,
            }, setupLimit);
          }
        })();
        settingUp.catch(() => {});
        await Promise.race([settingUp, targetLost]);
        listeners.delete(onCrash);
        // Chrome leaves a call to a closed page without an answer at times. such a call would wait for
        // the whole timeout, e.g. in a cleanup of a test that is run after the close of its page
        const ask = call;
        call = (method, params, limit) => (closed
          ? Promise.reject(new Error(`${method} was not sent, since the page is closed`))
          : ask(method, params, limit));
        break;
      } catch (error) {
        if (onEvent) listeners.delete(onEvent);
        if (onCrash) listeners.delete(onCrash);
        if (targetId && !hasExited) {
          await send('Target.closeTarget', { targetId }, undefined, cleanupLimit).catch(() => {});
        }
        if (hasExited || n === 2) throw error;
      }
    }

    async function evaluate(expression) {
      const { result, exceptionDetails } = await call('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      return result.value;
    }

    return {
      errors,
      evaluate,
      // sends a command of the DevTools protocol to the page, e.g. Emulation.setCPUThrottlingRate
      send: call,
      // on a Windows runner of GitHub, about one page in a few thousand is refused one of its
      // files with net::ERR_NO_BUFFER_SPACE, while ports and memory are free. such a page is loaded
      // again, twice at most, and the error of the load before is dropped. a load in flight when the
      // network service of Chrome crashes is lost, and it is made again, twice at most
      async goto(url) {
        const once = async (method, params) => {
          const loaded = new Promise((done) => {
            const onLoad = ({ method: event, sessionId: from }) => {
              if (from === sessionId && event === 'Page.loadEventFired') {
                listeners.delete(onLoad);
                done();
              }
            };
            listeners.add(onLoad);
          });
          const { errorText } = await call(method, params);
          if (errorText) throw new Error(`${url}: ${errorText}`);
          await answered(loaded, `the load of ${url}`);
        };
        const load = async (method, params) => {
          for (let n = 0; ; n++) {
            const seen = networkCrashes;
            let crash;
            const crashed = new Promise((done) => onNetworkCrash.add((crash = done)));
            // a lost load may not be answered, hence it is left once the crash is reported
            const attempt = once(method, params);
            attempt.catch(() => {});
            try {
              if ((await Promise.race([attempt.then(() => 'loaded'), crashed])) === 'loaded') return;
            } catch (error) {
              // the load is reported as aborted before the crash is written to stderr
              if (networkCrashes === seen && error.message.includes('net::ERR_ABORTED')) await Promise.race([crashed, sleep(2000)]);
              if (networkCrashes === seen || n === 2) throw error;
            } finally {
              onNetworkCrash.delete(crash);
            }
            if (n === 2) throw new Error(`${url}: the network service of Chrome crashed three times`);
          }
        };
        // the other errors of a refused load are dropped with it, since they follow from the file
        // that is missing, e.g. MathJax without theme/mathjax-config.js asks its CDN for a font
        const before = errors.length;
        const refused = () => {
          const found = errors.slice(before).some((error) => error.includes('net::ERR_NO_BUFFER_SPACE'));
          if (found) errors.splice(before);
          return found;
        };
        await load('Page.navigate', { url });
        for (let n = 0; n < 2 && refused(); n++) await load('Page.reload', { ignoreCache: true });
      },
      // polls the expression every 50 ms until it is truthy, and fails after timeout ms
      // an expression evaluated while the page is loaded anew is answered with an error, hence it
      // is read as not yet true
      async waitFor(expression, timeout = 15000) {
        const start = Date.now();
        const loading = (error) => {
          if (!/Inspected target navigated or closed/.test(error.message)) throw error;
          return false;
        };
        while (!(await evaluate(expression).catch(loading))) {
          if (Date.now() - start > timeout) {
            throw new Error(`timed out waiting for ${expression}\n${errors.join('\n')}`);
          }
          await sleep(50);
        }
      },
      // clip is a box of the document, with x, y, width, height, and scale
      async screenshot(clip) {
        const { data } = await call('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
        return Buffer.from(data, 'base64');
      },
      async pdf() {
        const { data } = await call('Page.printToPDF', {
          preferCSSPageSize: true,
          printBackground: true,
          displayHeaderFooter: false,
          marginTop: 0,
          marginBottom: 0,
          marginLeft: 0,
          marginRight: 0,
        });
        return Buffer.from(data, 'base64');
      },
      async close() {
        listeners.delete(onEvent);
        closed = true;
        try {
          await send('Target.closeTarget', { targetId });
        } finally {
          failCalls(sessionId, new Error('the call was not answered, since the page is closed'));
        }
      },
    };
  }

  async function close() {
    let timer;
    try {
      await Promise.race([send('Browser.close').catch(() => {}), new Promise((done) => (timer = setTimeout(done, 2000)))]);
    } finally {
      clearTimeout(timer);
      child.kill();
      await exited;
      // chrome_crashpad_handler and GoogleUpdater inherit the stderr of Chrome and outlive it, and an
      // open pipe would keep this process alive until they exit
      for (const stream of child.stdio) stream?.destroy();
      await removeProfile(profile);
    }
  }

  return { newPage, close };
}

// resolves once reveal.js is ready, the web fonts are loaded, and, in a deck with MathJax, every
// formula is typeset
export const deckSettled = `(async () => {
  if (!window.Reveal?.isReady()) return false;
  await document.fonts.ready;
  await window.MathJax?.startup?.promise;
  // a backdrop drawn from a file of polylines is loaded after the start of the deck
  await Promise.all((window.Beeson?.backdrops ?? []).map((backdrop) => backdrop.ready));
  // a TikZ figure is drawn once its output is loaded, after the start of the deck
  await window.Beeson?.figures?.ready;
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  return true;
})()`;

/** Opens a deck at url in the print view of reveal.js, with ?print-pdf in url, and waits until it can be printed. */
export async function printView(page, url) {
  await page.goto(url);
  // loading-scroll-mode is removed from the viewport after the pdf-ready event of reveal.js. on a
  // slow runner, the pages of the demo deck at a pixel ratio of 2 are laid out in over 15 s
  await page.waitFor(`!!document.querySelector('.pdf-page')
    && !document.querySelector('.reveal-viewport.loading-scroll-mode')`, 120000);
  await page.waitFor(deckSettled);
  // reveal.js clones a slide for each of its steps after the load event, which does not wait for
  // the clones, and a video that has not loaded a frame is printed as a black panel. A clone with
  // preload none or metadata is printed black as well when its server answers Range requests, hence
  // every video is loaded with preload auto. The videos are loaded one after the other, since on a
  // slow machine some of the videos that are loaded at once do not get a frame. A hidden video is not
  // printed, and it may not load a frame at all. A tycho viewer is replaced by its still in
  // src/print.ts, unless it shows an error
  await page.evaluate(`(async () => {
    for (const video of document.querySelectorAll('video')) {
      if (video.preload === 'auto') continue;
      video.preload = 'auto';
      video.load();
      if (!video.getClientRects().length) continue;
      await new Promise((done) => {
        video.addEventListener('loadeddata', done, { once: true });
        video.addEventListener('error', done, { once: true });
        setTimeout(done, 5000);
      });
    }
  })()`);
  await page.waitFor(`[...document.querySelectorAll('video')].every((video) => video.readyState >= 2 || video.error || !video.getClientRects().length)
    && [...document.querySelectorAll('tycho-viewer')].every((viewer) => viewer.shadowRoot?.querySelector('.status.error'))
    && [...document.images].every((image) => image.complete)`, 60000);
  await page.waitFor(deckSettled);
}
