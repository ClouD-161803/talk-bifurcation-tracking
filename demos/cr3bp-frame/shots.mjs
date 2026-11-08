// Renders the preview deck of the CR3BP diagram, demos/cr3bp-frame/preview.html, with headless
// Chrome into demos/cr3bp-frame/shots/, in both modes:
//
//   still-<mode>-<step>.png    each step under ?still, as in npm run check
//   live-<mode>-<step>.png     each step 2.5 s after it is shown, with the animations
//   back-<mode>-<step>.png     each step 2.5 s after the step above it is hidden
//   pdf-<mode>.pdf             the print view, one page per step, as in npm run pdf
//   turn-<mode>.mp4            the turn into the rotating frame at 30 frames per second, stepped
//   turn-<mode>-strip.png      every sixth frame of the same turn, i.e. one frame per 0.2 s,
//                              from the first frame to 2.8 s, in rows from the top left
//
// The turn starts with the two masses at 150 degrees, and its frames are taken with the animation loop of the diagram stopped and its clock
// advanced by 1/30 s before each frame, hence the video shows the motion at its true speed whatever
// the time a screenshot takes. ffmpeg is needed for the video and the strip.
//
//   node demos/cr3bp-frame/shots.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deckSettled, deckUrl, launch, printView } from '../../scripts/chrome.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'shots');
const deck = join(here, 'preview.html');
const MODES = ['dark', 'light'];
const STEPS = 4;
const FPS = 30;
// the angle of the two masses at the start of the turn, in rad, near the longest turn of the view,
// in which the masses swing back from 150 degrees to the horizontal axis
const TURN_FROM = (150 * Math.PI) / 180;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
mkdirSync(out, { recursive: true });

const zoneClip = `(() => {
  const r = document.querySelector('.cr3bp-frame').getBoundingClientRect();
  return { x: r.x - 40, y: r.y - 20, width: r.width + 80, height: r.height + 40, scale: 1 };
})()`;

const browser = await launch();
const errors = [];
try {
  for (const mode of MODES) {
    const still = await browser.newPage();
    await still.goto(deckUrl(deck, `theme=${mode}&still`));
    await still.waitFor(deckSettled);
    for (let s = 0; s < STEPS; s++) {
      if (s) await still.evaluate('Reveal.next()');
      await sleep(600);
      writeFileSync(join(out, `still-${mode}-${s}.png`), await still.screenshot());
    }
    errors.push(...still.errors.map((e) => `still ${mode}: ${e}`));
    await still.close();

    const live = await browser.newPage({ motion: true });
    await live.goto(deckUrl(deck, `theme=${mode}`));
    await live.waitFor(deckSettled);
    for (let s = 0; s < STEPS; s++) {
      if (s) await live.evaluate('Reveal.next()');
      await sleep(2500);
      writeFileSync(join(out, `live-${mode}-${s}.png`), await live.screenshot());
    }
    for (let s = STEPS - 2; s >= 0; s--) {
      await live.evaluate('Reveal.prev()');
      await sleep(2500);
      writeFileSync(join(out, `back-${mode}-${s}.png`), await live.screenshot());
    }
    errors.push(...live.errors.map((e) => `live ${mode}: ${e}`));
    await live.close();

    // the turn: the step units is shown, the loop is stopped, and the step rotating is shown with the
    // clock of the diagram advanced by hand
    const turn = await browser.newPage({ motion: true });
    await turn.goto(deckUrl(deck, `theme=${mode}`));
    await turn.waitFor(deckSettled);
    await turn.evaluate('Reveal.next()');
    await sleep(3200);
    await turn.evaluate(`window.d = Cr3bpFrame.diagram(document.querySelector('.cr3bp-frame')); d.stop(); d.phi = ${TURN_FROM}; Reveal.next(); true`);
    const clip = await turn.evaluate(zoneClip);
    const frames = mkdtempSync(join(tmpdir(), 'cr3bp-turn-'));
    for (let f = 0; f < 3 * FPS; f++) {
      if (f) await turn.evaluate(`d.tick(${1 / FPS}); true`);
      writeFileSync(join(frames, `f${String(f).padStart(3, '0')}.png`), await turn.screenshot(clip));
    }
    errors.push(...turn.errors.map((e) => `turn ${mode}: ${e}`));
    await turn.close();
    const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
    ff(['-framerate', String(FPS), '-i', join(frames, 'f%03d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', join(out, `turn-${mode}.mp4`)]);
    ff(['-framerate', String(FPS), '-i', join(frames, 'f%03d.png'), '-vf', `select='not(mod(n\\,6))',scale=iw/2:-1,tile=5x3:padding=4`, '-frames:v', '1', join(out, `turn-${mode}-strip.png`)]);
    rmSync(frames, { recursive: true, force: true });

    const print = await browser.newPage();
    await printView(print, deckUrl(deck, `print-pdf&still&theme=${mode}`));
    writeFileSync(join(out, `pdf-${mode}.pdf`), await print.pdf());
    errors.push(...print.errors.map((e) => `print ${mode}: ${e}`));
    await print.close();
  }
} finally {
  await browser.close();
}
for (const e of errors) console.error(e);
console.log(`shots written to ${out}, ${errors.length} page errors`);
process.exit(errors.length ? 1 : 0);
