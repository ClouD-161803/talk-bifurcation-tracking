import { setTimeout as sleep } from 'node:timers/promises';
import { deckSettled, deckUrl } from './chrome.mjs';
import { FULL_RANGE } from './record.mjs';

const FPS = 60;
const PART = 4 * 1024 * 1024;

const STALL = 120000;

function record(viewer, size, fps) {
  const state = { done: 0, total: 0, result: null };
  window.beesonRecording = state;
  let poster = '';
  let frames = 0;
  const options = (hardwareAcceleration) => ({
    size,
    fps,
    kiosk: true,
    keyFrameInterval: Infinity,
    hardwareAcceleration,
    limits: { frames: Infinity, seconds: Infinity },
    onFrame: (canvas, k) => {
      if (k === 0) poster = canvas.toDataURL('image/png');
    },
    onProgress: (done, total) => {
      frames = total;
      Object.assign(state, { done, total });
    },
  });
  (async () => {
    let blob;
    try {
      blob = await viewer.exportVideo(options('prefer-software')).catch((error) => {
        if (!/H\.264 encoder/.test(error?.message)) throw error;
        return viewer.exportVideo(options('no-preference'));
      });
    } catch (error) {
      state.result = { error: String(error?.message ?? error) };
      return;
    }
    state.read = (from, to) => new Promise((done, fail) => {
      const reader = new FileReader();
      reader.onload = () => done(reader.result.slice(reader.result.indexOf(',') + 1));
      reader.onerror = () => fail(reader.error);
      reader.readAsDataURL(blob.slice(from, to));
    });
    state.result = {
      bytes: blob.size,
      poster: poster.slice(poster.indexOf(',') + 1),
      duration: (frames / fps) * 1000,
      loop: viewer.scene?.clock?.end !== 'stop',
    };
  })();
}

async function finished(page, name) {
  let last = -1;
  let since = Date.now();
  for (;;) {
    const { done, total, result } = await page.evaluate(`(({ done, total, result }) => ({ done, total, result }))(window.beesonRecording)`);
    if (result) return result;
    if (done !== last) {
      last = done;
      since = Date.now();
    } else if (Date.now() - since > STALL) {
      throw new Error(`the scene on the slide "${name}" was not recorded: no frame was finished within ${STALL / 1000} s, after ${done} of ${total} frames. Export with --still to show each scene as a still of its first frame`);
    }
    await sleep(50);
  }
}

export async function showFirstFrames(page, recordings) {
  const frames = [...recordings].map(([id, { poster }]) => [id, `data:image/png;base64,${poster.toString('base64')}`]);
  await page.evaluate(`Promise.all(${JSON.stringify(frames)}.flatMap(([id, src]) =>
    [...document.querySelectorAll('.viewer-still[data-still="' + id + '"] > img')].map((image) => {
      image.src = src;
      image.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: fill';
      return image.decode();
    })))`);
}

export async function recordScenes(browser, deck, boxes) {
  const recordings = new Map();
  if (!boxes.size) return recordings;
  const page = await browser.newPage();
  try {
    await page.goto(deckUrl(deck));
    await page.waitFor(deckSettled);
    await page.evaluate(FULL_RANGE);
    for (const [id, { width, height, name }] of boxes) {
      const viewer = `document.querySelector('tycho-viewer[data-still="${id}"]')`;
      await page.evaluate(`(() => {
        const { h, v } = Reveal.getIndices(${viewer}.closest('.slides section'));
        Reveal.slide(h, v);
      })()`);
      await page.waitFor(`!!(${viewer}.state || ${viewer}.shadowRoot?.querySelector('.status.error'))`, 60000);
      const size = { width: 2 * Math.round(width), height: 2 * Math.round(height), pixelRatio: 2 };
      await page.evaluate(`(${record})(${viewer}, ${JSON.stringify(size)}, ${FPS})`);
      const result = await finished(page, name);
      if (result.error) {
        throw new Error(`the scene on the slide "${name}" was not recorded: ${result.error}. Export with --still to show each scene as a still of its first frame`);
      }
      const parts = [];
      for (let from = 0; from < result.bytes; from += PART) {
        parts.push(Buffer.from(await page.evaluate(`window.beesonRecording.read(${from}, ${from + PART})`), 'base64'));
      }
      recordings.set(id, { data: Buffer.concat(parts), poster: Buffer.from(result.poster, 'base64'), duration: result.duration, loop: result.loop });
    }
    if (page.errors.length) throw new Error(`the page of the recordings has errors:\n${page.errors.join('\n')}`);
  } finally {
    await page.close();
  }
  return recordings;
}
