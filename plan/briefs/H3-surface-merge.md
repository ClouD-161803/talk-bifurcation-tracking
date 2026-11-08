# H3: the effective-potential surface, with both parts shown before they merge

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/TEMPLATE-COMMON.md` first. Your checkout is a worktree of the template made by the harness, on a branch of its own. Other children work on the template at the same time, on other slides and other elements, hence keep your changes to `src/surface.ts`, `src/surfaces.ts`, their tests, slide 16 of `index.html`, and the section on surfaces of the README.

## Claudio's words

> effective potential demo is very good. there is room for improvement though. you should have both centrifugal and gravitational up at the same time. then have them merge. my original colormaps are best for each. the lagrange point markers are also currently clipped into the surface. i really like the rotation, the stretching surface idea, and the hill region cut animation. those are excellent and should be kept. also lagrange points glitch out when stepping backwards through the animation. they appear floating in the air on top of the surface. please fix.

## What is in place

- The surface element is `src/surface.ts` (three.js) with the functions of `src/surfaces.ts`, described in the README under Surfaces. It is shown on slide 16 of the demo deck with the stages `wells`, `bowl`, `sum`, `extrema`, and `cut` on the fragments, `data-C="3.39"` on the cut, and the labels of the five libration points inside the element. The brief under which it was built is `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/C1-slides-surface-element.md`.
- The deck of the talk uses the same five stages on its slides 4 and 5, hence keep the five values of `data-surface-stage` working, and where a stage changes its meaning, name the change in the report.
- Claudio's original animations of the effective potential, with the colormaps he wants for each part, are in `/Users/claudiovestini/Library/CloudStorage/GoogleDrive-cvestini@gmail.com/Other computers/Razer Blade 14/Claudio/Princeton/4th Year/MAE 541/Final Project`, under `Code/` and `Figures/`, written with plotly. Find the colormap of the gravitational part and the one of the centrifugal part there, and reproduce them.

## Tasks

1. Show both parts at once before they merge. At the stage `wells` the gravitational part is shown. At the stage `bowl` the centrifugal part is shown beside it or over it, with both visible, each in its own colormap. At the stage `sum` the two are merged into the effective potential by an animation. Keep the rotation, the stretching of the surface, and the animation of the cut as they are. Render the three stages in both modes and look at them.
2. Draw the markers of the libration points on the surface, not clipped into it: offset them along the normal or draw them above the surface with the depth test off, whichever reads better at the saddles.
3. Fix the reverse direction. When the stages are stepped backward, the markers appear in the air above the surface. Make every stage reachable in both directions, with the markers on the surface or hidden according to the stage. Add a test that steps forward to `cut` and back to `wells` and checks the stage and the markers at each step.
4. Run `npm test`, `npm run check`, and `npm run pdf`, look at the PNGs of slide 16 in `check/` in both modes, commit as you go, and report by TEMPLATE-COMMON.md, with the colormaps you found and the stage sequence.
