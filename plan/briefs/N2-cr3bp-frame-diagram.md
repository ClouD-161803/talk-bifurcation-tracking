# N2: an animated diagram of the CR3BP and its rotating frame

You work in the talk folder `/Users/claudiovestini/git/talks/bifurcation-tracking`, only in a new folder `demos/cr3bp-frame/`. Do not edit `index.html`, `theme/`, `src/`, or any other file of the folder, since other agents are editing them. I, the orchestrator, paste your slide into `index.html` myself.

## Goal

The deck introduces the frames of the elliptic problem (ER3BP) carefully, on slide 7 with a tycho scene of the inertial, rotating, and pulsating frames, but it never introduces the circular problem (CR3BP) itself. The audience is PhD students who are smart but not at home in dynamical systems. A new slide goes before the slide "Motion in the rotating frame" (slide 4). It is modeled on Figure 1 of Claudio's MAE 541 term paper, which shows the synodic frame with the primary $m_1$ at $(-\mu, 0)$, the secondary $m_2$ at $(1-\mu, 0)$, the third body $m$, and the distances $\rho_1$ and $\rho_2$ from the two masses to it. A render of this figure is at `/private/tmp/claude-501/-Users-claudiovestini-git-tycho-code/6cc2a788-5682-402a-b9d6-ed2383272ab8/scratchpad/review/mae-p5-05.png`. Your slide does what the paper could not, i.e. it moves.

## The slide

The text column at the left is final apart from small fixes. Build the diagram in the zone at the right, as the other content slides of the deck place a zone (see slides 4 and 5 of `index.html`, read-only).

```html
<section>
  <h2>The circular restricted three-body problem</h2>
  <p>The primary and the secondary circle their barycenter, and a third body, too light to move them, flies among them.</p>
  <p class="fragment" data-fragment-index="1" data-cr3bp-stage="units">We take their separation as the unit of length, and the time unit such that they turn once in \(2\pi\).</p>
  <p class="fragment" data-fragment-index="2" data-cr3bp-stage="rotating">In the frame that turns with them, both are at rest,</p>
  <div class="fragment" data-fragment-index="2">
    <div class="math">\[m_1 \text{ at } (-\mu, 0), \qquad m_2 \text{ at } (1 - \mu, 0), \qquad \mu = \frac{m_2}{m_1 + m_2},\]</div>
    <p class="small">where the mass ratio \(\mu\) is the only parameter of the problem.</p>
  </div>
  <p class="fragment" data-fragment-index="3" data-cr3bp-stage="body">The third body feels both, at the distances \(\rho_1\) and \(\rho_2\).</p>
  <!-- the diagram -->
</section>
```

The diagram has four stages, one per step, and it is animated smoothly within each stage and between stages.

1. Step 0, inertial. The inertial axes $X$ and $Y$ through the barycenter, and the primary and the secondary turning counterclockwise on their circles about it, with faint circles as their paths. One turn takes about 10 s. Draw it at a mass ratio of about 0.2, so that the circle of the primary is visible, since the diagram is schematic.
2. Step 1, units. A bracket or a double arrow labeled 1 between the two masses, turning with them, and the angle $t$ from the $X$ axis to the line of the two masses, drawn as an arc.
3. Step 2, rotating. The view turns with the two masses over about 1.5 s, eased, until they are at rest on a horizontal axis. The $x$ and $y$ axes of the rotating frame appear fixed on the slide, the inertial axes $X$ and $Y$ keep turning backward and are dimmed to about 30%, and the labels $(-\mu, 0)$ and $(1-\mu, 0)$ appear under the two masses, as in the paper's figure. The labels $m_1$ and $m_2$ are on the masses from step 0.
4. Step 3, body. The third body $m$, a small dot above the axis between the two masses, with the segments $\rho_1$ and $\rho_2$ to the two masses, labeled. It may drift slowly on a small loop if this reads better than a still dot, and the segments follow it.

Stepping back through the fragments must reverse each stage. The animation runs only while the slide is shown. In the PDF export (`npm run pdf`, one page per step), each page shows a still of its stage, with the masses at a fixed angle of about 30° in steps 0 and 1.

## Look

Match the deck. Read `theme/beeson.css` for the color tokens, and `demos/frames/build.py` for the colors and sizes of the primary and the secondary in the frames scene of slide 7, so that the two slides speak one visual language. Use the theme's colors in both dark and light modes (press `d` in the deck to flip, and the theme sets `data-theme` on the root), set labels in MathJax or in the deck's fonts, never in a default sans-serif, and keep lines thin and quiet, as in the surface of slide 4. The math labels follow the notation registry, `/Users/claudiovestini/.claude/skills/writing/references/notation.md`.

Build it as inline SVG driven by a small script, i.e. `demos/cr3bp-frame/cr3bp-frame.js`, which the deck loads with one `<script src>` after `theme/beeson.js`, and which finds its diagram by a class or a data attribute and listens to the `fragmentshown`, `fragmenthidden`, `slidechanged`, and `ready` events of reveal.js, and to the print view of the template (read `src/print.ts` and how the surface element of `src/surface.ts` reacts to `data-surface-stage`, read-only). Put the slide's markup with the diagram into `demos/cr3bp-frame/slide.html`, ready to paste.

## Proof

Make a small preview deck `demos/cr3bp-frame/preview.html` that loads the theme of the talk folder with this slide alone, and render it in both modes at every step with headless Chrome. The check script `scripts/check.mjs` and the PDF script `scripts/export-pdf.mjs` show how the deck is driven. Look at every PNG, and fix anything cut, overlapping, or unreadable. Record a short MP4 or a strip of frames of the transition into the rotating stage, so that its smoothness can be judged. Put the PNGs in `demos/cr3bp-frame/shots/`.

## Report

End with the files written, the shots, how the script hooks into reveal.js and the print view, and anything you could not make work. Do not commit, and do not start subagents.
