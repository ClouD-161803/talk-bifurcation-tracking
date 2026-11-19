// Records the surfaces and the plots of a deck for scripts/export-pptx.mjs, in the print view of the
// export, where each step of a slide is a .pdf-page with its own surface or plot at the state of the
// step. The clock of the page is stepped from here, as in scripts/record.mjs, hence each frame is
// drawn at its time whatever it costs. A frame of a surface is composed in the page from the
// picture of its box without it, its canvas, drawn at the size of the video and not at the pixel
// ratio of the page, and a picture of each of its labels, taken once and
// placed and faded as the surface places them. A plot is drawn as SVG and HTML, hence each of its
// frames is a picture of its box taken by Chrome. The frames are encoded with the WebCodecs
// VideoEncoder of Chrome, and the MP4 file is written by scripts/mp4.mjs.
//
// A surface turns once in data-turn seconds, 90 by default, hence the loop of a stage is one whole
// turn, which closes without a jump. A step that changes the stage is recorded as a clip of the
// change, played once, and the loop of the new stage, which starts with the frame after the clip. A
// plot loops over a pass of its frames and its hold. With a fade, the loop is the second pass,
// which starts with the last frame of the first one faded out, as in the deck.
import { mp4 } from './mp4.mjs';
import { CLOCK, FULL_RANGE, refused } from './record.mjs';

// the frames per second, the scale of a frame to the px of its box, and the bits per second. A loop
// of a surface lasts a whole turn, hence its size sets the size of the file. At 24 fps and 450
// kbit/s, a turn of 90 s of a box of 800 by 1080 px is 5.0 MB, and it is recorded in about 7 s. At
// 400 kbit/s the lines of the grid smear, and at 30 fps or twice the scale it is no sharper for
// the same size. The demo deck is then 106 MB, from 73 MB with stills, and is exported in 2.5
// minutes. A plot has thin lines and words, and its loop lasts seconds, e.g. 225 KB for 2.5 s of
// a box of 600 by 800 px
export const SURFACE = { fps: 24, scale: 1, bitrate: 450e3 };
export const PLOT = { fps: 30, scale: 2, bitrate: 4e6 };

// the seconds within which the change of a stage of a surface ends, or the recording fails
const SETTLE = 10;

const STILLS = 'the surfaces and the plots';

const ACCELERATIONS = ['prefer-software', 'no-preference'];

// the part of the recorder in the page, installed once in the print view
const HELPER = `window.__animate ??= (() => {
  const style = document.createElement('style');
  style.textContent = \`
    :root.anim-under .anim-el > canvas, :root.anim-under .anim-el .label { visibility: hidden !important; }
    :root.anim-label * { visibility: hidden !important; }
    :root.anim-label .anim-one, :root.anim-label .anim-one * { visibility: visible !important; }
    :root.anim-label .anim-one { opacity: 1 !important; }
    :root.anim-label, :root.anim-label body, :root.anim-label .reveal-viewport, :root.anim-label .reveal { background: transparent !important; }
  \`;
  document.head.append(style);
  const clock = ${CLOCK};
  ${FULL_RANGE}
  const all = () => [...document.querySelectorAll('.pdf-page :is(.surface, .plot)')];
  const plotOf = (el) => Beeson.plots.find((p) => p.el === el);
  const surfaceOf = (el) => Beeson.surfaces.find((s) => s.el === el);
  const toBase64 = (u) => {
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const fromBase64 = (b64) => createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' }));
  const png = async (canvas) => toBase64(new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()));
  const frame = () => new Promise((done) => (clock.real?.raf ?? requestAnimationFrame)(() => (clock.real?.raf ?? requestAnimationFrame)(() => done(true))));
  let state = null;

  // the fragments of the section of el, in their order
  const fragments = (el) => [...(el.closest('section')?.querySelectorAll('.fragment') ?? [])];

  // the same text for the same look of a surface or a plot at a step
  function key(el) {
    const visible = fragments(el).filter((f) => f.classList.contains('visible'));
    if (el.matches('.surface')) {
      let best = null, index = -Infinity;
      for (const f of visible) {
        if (!f.hasAttribute('data-surface-state')) continue;
        const i = Number(f.dataset.fragmentIndex ?? 0);
        if (i >= index) { best = f; index = i; }
      }
      const { fragmentIndex, ...data } = best?.dataset ?? {};
      return 'surface ' + (el.dataset.shown ?? '') + ' ' + JSON.stringify(data);
    }
    // the markup of a plot drawn still at its step is set by its tab, its parts shown, and its highlights
    const html = el.innerHTML;
    let h = 0;
    for (let i = 0; i < html.length; i++) h = (h * 31 + html.charCodeAt(i)) | 0;
    return 'plot ' + html.length + ' ' + h;
  }

  const encoderFor = (config) => {
    const out = { chunks: [], error: null, decoder: null };
    out.encoder = new VideoEncoder({
      output: (chunk, meta) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        out.chunks.push({ data, key: chunk.type === 'key', ts: chunk.timestamp });
        if (meta?.decoderConfig && !out.decoder) out.decoder = meta.decoderConfig;
      },
      error: (e) => { out.error = String(e); },
    });
    out.encoder.configure(config);
    return out;
  };

  return {
    // for each .pdf-page, the surfaces and the plots shown at its step, with the index of each among
    // those of the document, its index among those of its page, and the key of its look
    list() {
      const every = all();
      return [...document.querySelectorAll('.pdf-page')].map((page) => {
        const own = [...page.querySelectorAll('.surface, .plot')];
        return own.filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('.fragment:not(.visible)'))
          .map((el) => {
            const r = el.getBoundingClientRect(), p = page.getBoundingClientRect();
            return { index: every.indexOf(el), place: own.indexOf(el), key: key(el), x: r.x - p.x, y: r.y - p.y, width: r.width, height: r.height };
          });
      });
    },

    // the hardwareAcceleration at which the encoder takes config, or null
    async encodes(config) {
      if (typeof VideoEncoder !== 'function') return null;
      for (const a of ${JSON.stringify(ACCELERATIONS)}) if ((await VideoEncoder.isConfigSupported({ ...config, hardwareAcceleration: a })).supported) return a;
      return null;
    },

    // scrolls to the element of index i, and returns its box in the document and its kind
    async box(i) {
      const el = all()[i];
      el.scrollIntoView({ block: 'center' });
      await frame();
      const r = el.getBoundingClientRect();
      return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height, surface: el.matches('.surface') };
    },

    // shows the layer under the canvas and the labels of the surface i, or its label n alone, or
    // the page as it was without mode
    show(i, mode, n = -1) {
      const el = all()[i];
      document.documentElement.classList.remove('anim-under', 'anim-label');
      for (const e of document.querySelectorAll('.anim-el, .anim-one')) e.classList.remove('anim-el', 'anim-one');
      if (mode) {
        el.classList.add('anim-el');
        if (n >= 0) el.querySelectorAll('.label')[n].classList.add('anim-one');
        document.documentElement.classList.add('anim-' + mode);
      }
      return frame();
    },

    // the boxes of the labels of the surface i in px of the document, with a margin for their
    // drop shadow
    labels(i) {
      return [...all()[i].querySelectorAll('.label')].map((lab) => {
        const r = lab.getBoundingClientRect();
        return { x: r.x + scrollX - 8, y: r.y + scrollY - 8, width: r.width + 16, height: r.height + 16 };
      });
    },

    // starts the encoder, the clock, and the element i. a surface is first drawn at once at the stage
    // of the step of the element from, when from is given, and its change is started from there
    async begin(i, config, from, under, labels) {
      const el = all()[i];
      const surface = el.matches('.surface') ? surfaceOf(el) : null, plot = surface ? null : plotOf(el);
      if (!surface && !plot) throw new Error('the element is not drawn');
      const canvas = new OffscreenCanvas(config.width, config.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      const box = el.getBoundingClientRect(), k = config.width / box.width;
      let draw = null;
      if (surface) {
        const ground = await fromBase64(under);
        const image = el.querySelector(':scope > canvas');
        const tags = [...el.querySelectorAll('.label')];
        // a label is drawn from its picture, moved by the change of its left and top in px of the
        // slide, which is scaled by s in the page
        const s = box.width / el.offsetWidth;
        const marks = await Promise.all(labels.map(async ({ png: b64, x, y, width, height }, n) => ({
          lab: tags[n], bitmap: await fromBase64(b64), x: x - scrollX - box.x, y: y - scrollY - box.y, width, height,
          left: parseFloat(tags[n].style.left) || 0, top: parseFloat(tags[n].style.top) || 0,
        })));
        draw = () => {
          ctx.globalAlpha = 1;
          ctx.drawImage(ground, 0, 0, config.width, config.height);
          const r = image.getBoundingClientRect();
          ctx.drawImage(image, (r.x - box.x) * k, (r.y - box.y) * k, r.width * k, r.height * k);
          for (const m of marks) {
            const alpha = Number(m.lab.style.opacity || 0);
            if (!(alpha > 0)) continue;
            ctx.globalAlpha = Math.min(1, alpha);
            const dx = ((parseFloat(m.lab.style.left) || 0) - m.left) * s, dy = ((parseFloat(m.lab.style.top) || 0) - m.top) * s;
            ctx.drawImage(m.bitmap, (m.x + dx) * k, (m.y + dy) * k, m.width * k, m.height * k);
          }
        };
      }
      clock.install();
      let turn = 0, period = 0, once = false, offset = 0;
      if (surface) {
        surface.fit(config.width / box.width, devicePixelRatio);
        turn = surface.view().written.turn;
        if (from !== null) {
          const before = fragments(all()[from]).map((f) => f.classList.contains('visible'));
          const own = fragments(el), now = own.map((f) => f.classList.contains('visible'));
          own.forEach((f, n) => f.classList.toggle('visible', !!before[n]));
          surface.sync(false);
          own.forEach((f, n) => f.classList.toggle('visible', now[n]));
          surface.start();
          surface.sync(true);
        } else surface.start();
      } else {
        // a pass over the frames of the tab, then its hold. a plot whose tab is played once by its
        // step holds its last frame after one pass
        const { pass, hold, fade } = plot.timing;
        const top = fragments(el).filter((f) => f.classList.contains('visible') && f.dataset.plotTab)
          .sort((a, b) => Number(a.dataset.fragmentIndex ?? 0) - Number(b.dataset.fragmentIndex ?? 0)).at(-1);
        once = !!top?.hasAttribute('data-plot-once') && top.classList.contains('current-fragment');
        plot.start();
        period = !plot.playing ? 0 : once ? pass : pass + hold;
        // a plot that fades from one pass to the next is recorded over its second pass
        if (!once && fade > 0) offset = 1000 * period;
      }
      state = { surface, plot, canvas, ctx, draw, offset, fps: config.framerate, frame: 0, video: encoderFor(config), config };
      return { turn, period, once };
    },

    // draws the frame at the time k / fps on the clock. returns whether the change of stage of a
    // surface has ended, i.e. the surface is settled and its points are not faded any more
    step(k) {
      const s = state;
      clock.at(s.offset + (k * 1000) / s.fps);
      if (!s.surface) return true;
      s.draw();
      const probe = s.surface.probe();
      const lit = probe.points.map((p) => p.lit);
      const settled = probe.settled && (s.lit ?? lit).every((v, n) => Math.abs(v - lit[n]) < 1e-4);
      s.lit = lit;
      return settled;
    },

    // encodes the canvas, after the picture b64 of a plot is drawn on it, and returns a PNG of the
    // frame with keep
    async encode(b64, keep) {
      const s = state, v = s.video;
      if (b64) {
        const bitmap = await fromBase64(b64);
        s.ctx.drawImage(bitmap, 0, 0, s.canvas.width, s.canvas.height);
        bitmap.close();
      }
      if (v.error) throw new Error(v.error);
      if (v.encoder.state === 'closed') throw new Error('the encoder was closed');
      const k = s.frame++;
      const frame = new VideoFrame(s.canvas, { timestamp: Math.round((k * 1e6) / s.fps), duration: Math.round(1e6 / s.fps) });
      v.encoder.encode(frame, { keyFrame: k === 0 });
      frame.close();
      while (v.encoder.encodeQueueSize > 2) await new Promise((done) => setTimeout(done, 0));
      if (v.error) throw new Error(v.error);
      return keep ? png(s.canvas) : null;
    },

    // ends the video encoded so far, and starts the next one, whose frames are counted from 0
    async finish() {
      const s = state, v = s.video;
      if (v.error) throw new Error(v.error);
      await v.encoder.flush();
      v.encoder.close();
      if (v.error) throw new Error(v.error);
      const d = v.decoder?.description;
      s.done = v;
      s.video = encoderFor(s.config);
      s.frame = 0;
      return {
        count: v.chunks.length,
        ordered: v.chunks.every((c, i) => i === 0 || c.ts > v.chunks[i - 1].ts),
        avcC: d ? toBase64(new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer)) : null,
        color: v.decoder?.colorSpace ?? null,
      };
    },

    // the chunks from index a to b of the video ended last
    take(a, b) {
      const part = state.done.chunks.slice(a, b);
      const bytes = new Uint8Array(part.reduce((n, c) => n + c.data.length, 0));
      let at = 0;
      for (const c of part) { bytes.set(c.data, at); at += c.data.length; }
      return { sizes: part.map((c) => c.data.length), keys: part.map((c) => c.key), b64: toBase64(bytes) };
    },

    // puts the element back as the print view shows it
    end() {
      const s = state;
      for (const v of [s?.video, s?.done]) if (v && v.encoder.state !== 'closed') v.encoder.close();
      // the camera is put back at the angles of the attributes of the surface
      if (s?.surface) { s.surface.fit(); s.surface.stop(); s.surface.sync(false); s.surface.configure(); }
      if (s?.plot) { s.plot.leave(); s.plot.still(); }
      clock.remove();
      state = null;
      return true;
    },
  };
})(), true`;

const config = ({ fps, bitrate }, width, height, hardwareAcceleration) => ({
  // High profile at level 5.2
  codec: 'avc1.640034',
  width,
  height,
  bitrate,
  framerate: fps,
  latencyMode: 'quality',
  hardwareAcceleration,
  avc: { format: 'avc' },
});

// H.264 of 4:2:0 needs an even width and height
const even = (px) => Math.max(2, 2 * Math.round(px / 2));

// ends the video encoded in the page, and returns it with poster, a PNG in base64, and loop
async function video(page, c, poster, loop) {
  const done = await page.evaluate('__animate.finish()');
  if (!done.ordered) throw new Error('the encoder reordered the frames, which the MP4 writer does not support');
  const samples = [];
  for (let a = 0; a < done.count; a += 120) {
    const part = await page.evaluate(`__animate.take(${a}, ${a + 120})`);
    const bytes = Buffer.from(part.b64, 'base64');
    let at = 0;
    part.sizes.forEach((size, i) => { samples.push({ data: bytes.subarray(at, at + size), key: part.keys[i] }); at += size; });
  }
  const data = mp4({ width: c.width, height: c.height, fps: c.framerate, samples, avcC: Buffer.from(done.avcC, 'base64'), color: done.color ?? undefined });
  return { data, poster: Buffer.from(poster, 'base64'), duration: (done.count * 1000) / c.framerate, loop, frames: done.count };
}

/**
 * Lists the surfaces and the plots of the print view of a deck on page, opened as in
 * scripts/export-pptx.mjs. Returns for each .pdf-page a list of { index, place, key, x, y, width,
 * height }: the index of each element among the surfaces and the plots of the document and among
 * those of its page, a text that is the same for the same look at a step, and its box in px of the
 * page.
 */
export async function listAnimations(page) {
  await page.evaluate(HELPER);
  return page.evaluate('__animate.list()');
}

/**
 * Records the surface or the plot of index i among those of the print view on page, as it is shown
 * at its step. With from, the index of a surface at the step before, the change from the stage drawn
 * there is recorded as well. Returns { clip, loop }, each null or { data, poster, duration, loop,
 * frames }: the MP4 and a PNG of its first frame as Buffers, its duration in ms, whether it is
 * looped, and its number of frames. A surface has a clip with from, and a loop when it turns. A
 * plot has a loop when it moves at its step, which is not looped when its step plays it once.
 * Throws with the reason and --still when Chrome does not encode H.264 at the size of the video.
 */
export async function recordAnimation(page, i, from = null) {
  await page.evaluate(HELPER);
  await page.send('Page.bringToFront');
  const { surface, ...box } = await page.evaluate(`__animate.box(${i})`);
  const kind = surface ? SURFACE : PLOT;
  const c0 = config(kind, even(box.width * kind.scale), even(box.height * kind.scale));
  const acceleration = await page.evaluate(`__animate.encodes(${JSON.stringify(c0)})`);
  if (!acceleration) {
    throw refused(`this browser does not encode H.264 (${c0.codec}) at ${c0.width} by ${c0.height} px and ${kind.fps} frames per second`, STILLS);
  }
  const c = { ...c0, hardwareAcceleration: acceleration };
  // the pictures are taken at the pixel ratio of the page, twice the size of the slide in the export
  const shot = async (clip) => (await page.screenshot({ ...clip, scale: 1 })).toString('base64');
  try {
    let under = null;
    const labels = [];
    if (surface) {
      await page.evaluate(`__animate.show(${i}, 'under')`);
      under = await shot(box);
      const boxes = await page.evaluate(`__animate.labels(${i})`);
      await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
      try {
        for (const [n, b] of boxes.entries()) {
          await page.evaluate(`__animate.show(${i}, 'label', ${n})`);
          labels.push({ ...b, png: await shot(b) });
        }
      } finally {
        await page.send('Emulation.setDefaultBackgroundColorOverride', {});
        await page.evaluate(`__animate.show(${i}, '')`);
      }
    }
    const { turn, period, once } = await page.evaluate(`__animate.begin(${i}, ${JSON.stringify(c)}, ${from ?? 'null'}, ${JSON.stringify(under)}, ${JSON.stringify(labels)})`);
    const fps = kind.fps;
    const result = { clip: null, loop: null };
    if (surface) {
      // the clip ends with the frame before the first one at which the change has ended, which is
      // the first frame of the loop
      let k = 0;
      if (from !== null) {
        let poster = null;
        for (; !(await page.evaluate(`__animate.step(${k})`)) || k === 0; k++) {
          if (k > SETTLE * fps) throw new Error(`the change of stage of a surface did not end within ${SETTLE} s`);
          const png = await page.evaluate(`__animate.encode(null, ${k === 0})`);
          if (k === 0) poster = png;
        }
        result.clip = await video(page, c, poster, false);
      }
      const frames = turn > 0 ? Math.round(turn * fps) : 0;
      if (frames > 0) {
        let poster = null;
        for (let n = 0; n < frames; n++) {
          if (n > 0 || from === null) await page.evaluate(`__animate.step(${k + n})`);
          const png = await page.evaluate(`__animate.encode(null, ${n === 0})`);
          if (n === 0) poster = png;
        }
        result.loop = await video(page, c, poster, true);
      }
    } else if (period > 0) {
      const frames = Math.max(1, Math.round(period * fps));
      let poster = null;
      for (let n = 0; n < frames; n++) {
        await page.evaluate(`__animate.step(${n})`);
        const png = await page.evaluate(`__animate.encode(${JSON.stringify(await shot(box))}, ${n === 0})`);
        if (n === 0) poster = png;
      }
      result.loop = await video(page, c, poster, !once);
    }
    return result;
  } catch (error) {
    if (/EncodingError|NotSupportedError/.test(error.message)) throw refused(error.message, STILLS);
    throw error;
  } finally {
    await page.evaluate('window.__animate?.end()').catch(() => {});
  }
}
