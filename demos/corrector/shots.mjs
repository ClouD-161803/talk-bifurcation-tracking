// Screenshots of the correction and continuation scenes, taken with headless Chrome at 730 by 880 at a
// device scale of 2, i.e. at the size of the lean viewers of slides 11 to 14, with the chrome hidden as
// on the slides. One PNG is taken per shot of STORYBOARD.md and per value of the clock, into shots/.
// A line is printed for each PNG with its controls, its frame, and the caption of the page, and the
// PNGs are listed with these captions in shots/INDEX.md.
//
//   node demos/corrector/shots.mjs                 both scenes
//   node demos/corrector/shots.mjs continuation    one scene, correction or continuation
//
// A PNG is named <scene>-<shot>-<value>.png, where the value is the clock value with two decimals.
// The shot is its number in the storyboard, and a letter is added to it when several controls are
// set in turn in the shot, e.g. 5a, 5b, and 5c for the three runs of shot 5 of the correction scene.
//
// Every tab and toggle is set by a click on its button or its checkbox, as a viewer sets it. The
// clock is set by an input event on the scrubber of the transport, by which it is paused as by a
// drag of the scrubber. After each click the state of the viewer is compared with the setting, and after
// each seek the frame counter of the transport with the frame, and the run is stopped at the first
// mismatch.

import { readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deckUrl, launch } from '../../scripts/chrome.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'shots');
const runs = JSON.parse(readFileSync(join(here, 'runs.json'), 'utf8'));

// the start, the middle, and the end of iterate n are taken at the fractions 0.30, 0.65, and 0.90 of
// it. iterate 0 spans the clock from -2 to 1, and iterate n >= 1 from n to n + 1. in each iterate the
// arcs are drawn growing up to the fraction 0.45, the defects and the point of the convergence curve
// are drawn by 0.6, and the nodes are moved to iterate n + 1 from 0.7. the same times are set in
// ZERO, GROW, DEFECT_END, POINT, and SLIDE of build.py. with one segment, iterate 0 is instead played as a
// slower iterate from GUESS, and iterate n >= 1 LEAD earlier, as set in GUESS, PACE0, and LEAD of build.py
const PHASES = [0.3, 0.65, 0.9];
const GUESS = -2.25;
const PACE0 = [0, 0.9, 1.2, 2.1, 2.6];
const LEAD = 1 - (GUESS + PACE0[4]);
// the clock offset of the fraction f of iterate 0 with S = 1, interpolated in PACE0 at the ends of the phases
const pace0 = (f) => {
  const ends = [0, 0.45, 0.6, 0.7, 1];
  const j = Math.max(1, ends.findIndex((e) => e >= f));
  return PACE0[j - 1] + ((f - ends[j - 1]) / (ends[j] - ends[j - 1])) * (PACE0[j] - PACE0[j - 1]);
};
const at = (n, f, S) => (S === '1' ? (n === 0 ? GUESS + pace0(f) : n + f - LEAD) : n === 0 ? -2 + 3 * f : n + f);
// with more than one segment, iterate 0 is staged, and it is taken while its first segment grows, while
// the others grow, when every defect is drawn, and while the nodes move. the same times are set in FIRST,
// REST, and STAGED_SLIDE of build.py
const STAGED = [-1.1, -0.5, 0.05, 0.6];

// the shots of the storyboard, each with the controls set before it, in the order the speaker sets
// them. a shot without settings is the opening state of the page. shots 1 and 3a are also taken at the
// first frame of the loop, on which slides 11 and 12 are loaded
const SCENES = {
  correction: [
    { shot: '1', set: [], first: true },
    { shot: '2', set: [['targeting', 'full']] },
    // shot 3 opens with the ghosts and the other segment counts off, as slide 12 is loaded, and the
    // other segment counts are switched on at the race
    { shot: '3a', set: [['S', '16'], ['guess', 'farther'], ['ghosts', false]], first: true },
    { shot: '3b', set: [['others', true]] },
    // shot 4 compares one segment with eight on family 11 over the full period
    { shot: '4a', set: [['case', 'family11'], ['guess', 'near'], ['S', '1']] },
    { shot: '4b', set: [['S', '8']] },
    // shot 5 is played from the state of shot 3, where the run from the periapsis fails, and it is
    // converged from the closer guess, then from the apoapsis
    { shot: '5a', set: [['case', 'lyapunov'], ['S', '16'], ['guess', 'farther'], ['system', 'peri']] },
    { shot: '5b', set: [['guess', 'near']] },
    { shot: '5c', set: [['system', 'apo']] },
    { shot: '6a', set: [['system', 'cr3bp'], ['S', '8'], ['guess', 'far']] },
    { shot: '6b', set: [['guess', 'far_ls']] },
    // the middle of iterate 9 is added to shot 6c, the last step before the cross at iterate 10
    { shot: '6c', set: [['S', '1']], also: [9.65 - LEAD] },
    { shot: '7a', set: [['S', '16'], ['ghosts', true], ['defects', false]] },
    { shot: '7b', set: [['defects', true], ['solution', true]] },
  ],
  // each shot of the continuation scene is taken at the start of the loop, at which its slide is paused,
  // and at the middles of eight equal parts of the loop, and shot 3 at the middles of sixteen, so that the
  // blue pen is seen at the fold in the close-up. a red dot is shown only
  // until the next member of its pen is drawn, hence shot 1 is also taken at 9.5, while the dot of a failed
  // half step is drawn in the close-up. shot 3 is also taken at 12.8, during a failed attempt of the blue
  // pen at the fold, with its tangent, its constraint line, and its red dot, at 17.65, in the middle of the
  // hold of the blue pen at the fold from 15.4 to 19.9, which is set by FOLD_HOLD and HOLD_AT of build.py,
  // and at 20.6, after the turn. shot 4 is material for questions
  continuation: [
    { shot: '1', set: [], also: [9.5] },
    { shot: '2', set: [['family', 'family11']] },
    { shot: '3', set: [['pens', 'both']], parts: 16, also: [12.8, 17.65, 20.6] },
    { shot: '4a', set: [['step', 'small']] },
    { shot: '4b', set: [['step', 'large']] },
  ],
};

const which = process.argv[2];
if (which !== undefined && !(which in SCENES)) throw new Error(`unknown scene ${which}, expected one of ${Object.keys(SCENES)}`);
mkdirSync(out, { recursive: true });

const browser = await launch();
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

// the viewer, its shadow root, and a promise of two animation frames, after which a change is drawn
const prelude = `const v = document.querySelector('tycho-viewer');
const root = v.shadowRoot;
const drawn = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));`;

try {
  for (const name of which ? [which] : Object.keys(SCENES)) {
    const scene = JSON.parse(readFileSync(join(here, `${name}.tys`), 'utf8'));
    const { steps, range } = scene.clock;
    const valueAt = (i) => range[0] + (i * (range[1] - range[0])) / steps;
    const frameOf = (value) => Math.round(((value - range[0]) / (range[1] - range[0])) * steps);
    for (const file of readdirSync(out).filter((f) => f.startsWith(`${name}-`) && f.endsWith('.png'))) rmSync(join(out, file));

    const page = await browser.newPage({ width: 730, height: 880, scale: 2 });
    await page.goto(deckUrl(join(here, `${name}.html`)));
    await page.waitFor(`(() => { ${prelude} return v?.state != null && !!root.querySelector('input.scrub'); })()`, 60000);
    await page.evaluate(
      `(async () => { ${prelude} await document.fonts.ready; v.pause(); root.querySelector('.root').classList.add('lean'); await drawn(); })()`,
    );

    // the value of a variable in the state of the viewer, or its default when it is not set in the state
    const current = async (id) =>
      page
        .evaluate(`(() => { ${prelude} const s = v.state.variables ?? {}; return ${JSON.stringify(id)} in s ? s[${JSON.stringify(id)}] : null; })()`)
        .then((value) => value ?? scene.variables[id].default);

    async function set(id, value) {
      const def = scene.variables[id];
      const control = scene.controls.find((c) => c.variable === id);
      if (def.kind === 'choice') {
        const label = (def.labels ?? def.values)[def.values.indexOf(value)];
        await page.evaluate(`(() => { ${prelude}
          const seg = root.querySelector(${JSON.stringify(`.seg[aria-label="${control.label}"]`)});
          [...seg.querySelectorAll('button')].find((b) => b.textContent === ${JSON.stringify(label)}).click();
        })()`);
      } else {
        await page.evaluate(`(() => { ${prelude}
          const field = [...root.querySelectorAll('label.field')].find((f) => f.querySelector('.k')?.textContent === ${JSON.stringify(control.label)});
          const box = field.querySelector('input[type=checkbox]');
          if (box.checked !== ${value}) box.click();
        })()`);
      }
      const now = await current(id);
      if (now !== value) throw new Error(`${name}: ${id} is ${now} after the click, expected ${value}`);
    }

    async function seek(i) {
      const text = await page.evaluate(`(async () => { ${prelude}
        const scrub = root.querySelector('input.scrub');
        scrub.value = '${i}';
        scrub.dispatchEvent(new Event('input', { bubbles: true }));
        await drawn();
        return v.playing ? 'playing' : root.querySelector('.frame').textContent;
      })()`);
      if (text !== `${i} / ${steps}`) throw new Error(`${name}: the transport shows ${text} after a seek to frame ${i}`);
    }

    for (const { shot, set: settings, parts = 8, also = [], first = false } of SCENES[name]) {
      for (const [id, value] of settings) await set(id, value);

      let frames;
      if (name === 'correction') {
        const now = {};
        for (const id of ['case', 'system', 'targeting', 'S', 'guess']) now[id] = await current(id);
        const run = runs.corrections.find(
          (r) => r.case === now.case && r.system === now.system && r.targeting === now.targeting && String(r.S) === now.S && r.guess === now.guess,
        );
        const last = run.norms.length - 1;
        const iterates = [...new Set([0, 1, last])];
        const times = (n) => (n > 0 || now.S === '1' ? PHASES.map((f) => at(n, f, now.S)) : STAGED);
        frames = [...(first ? [0] : []), ...iterates.flatMap((n) => times(n).map(frameOf)), ...also.map(frameOf), steps - 1].sort((a, b) => a - b);
      } else {
        frames = [0, ...Array.from({ length: parts }, (_, j) => Math.round(((j + 0.5) * steps) / parts)), ...also.map(frameOf), steps - 1].sort((a, b) => a - b);
      }

      const controls = [];
      for (const id of Object.keys(scene.variables)) if (scene.variables[id].scope !== 'panel') controls.push(`${id}=${await current(id)}`);
      for (const i of frames) {
        await seek(i);
        await wait(100);
        const file = `${name}-${shot}-${valueAt(i).toFixed(2)}.png`;
        writeFileSync(join(out, file), await page.screenshot());
        const caption = await page.evaluate(`(() => { ${prelude} return root.querySelector('.stats').textContent; })()`);
        console.log(`${file}\tshot ${shot}\t${controls.join(' ')}\tframe ${i}\t${caption}`);
      }
    }
    if (page.errors.length) {
      console.error(page.errors.join('\n'));
      process.exitCode = 1;
    }
    await page.close();
  }
} finally {
  await browser.close();
}
