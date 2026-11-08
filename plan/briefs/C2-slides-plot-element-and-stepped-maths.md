# C2: an animated 2D plot element and a stepped-maths convention for the slide template

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/COMMON.md` first. You work in a git worktree of the template repository `slides` that T3 Code prepared for you, on its own branch. Read `AGENTS.md` and `README.md` of the checkout, `src/main.ts`, `src/steps.ts`, `src/orbits.ts`, `theme/beeson.css`, and the demo deck `index.html`, before any edit. The template is MIT and public, hence nothing in it may derive from DyLAN code.

## Part 1: the plot element

Slides 11 to 13 of the talk teach the stability of a periodic orbit with one synchronized animation: on the left the four Floquet multipliers $\lambda$ of a planar orbit on the unit circle of the complex plane, on the right the point $(a_1, a_2)$ in Broucke's stability diagram, where the multipliers solve $\lambda^4 + a_1\lambda^3 + a_2\lambda^2 + a_1\lambda + 1 = 0$ and the three curves $a_2 = a_1^2/4 + 2$, $a_2 = -2a_1 - 2$, and $a_2 = 2a_1 - 2$ cut the plane into seven regions. As the family parameter runs (a play button and a scrubber), the multipliers move on and off the circle and the point crosses the curves, with the region names shown and the crossings of $k = \pm 2$ marked, where $k = \lambda + 1/\lambda$. Tabs switch between families. The talk's instance of this plot is driven by data computed elsewhere, hence the element is generic and data-driven.

Build an in-slide element, a `div` with a class and a data attribute that names an inline JSON block (a `script type="application/json"` next to it) or a JSON file next to the deck, drawn as SVG by code in `src/` compiled into `theme/beeson.js`. The JSON declares one or more panels (each with axes, ranges, ticks, titles, static curves, static labels, and shaded regions), a shared parameter with its range and the frames of the animation, tabs (named datasets), and the animated marks (points, polylines, and labels whose positions are given per frame), in a format you document in the README. The element has play, pause, and a scrubber, loops, starts when its slide is shown, and stops when it is left. Fragments of the same slide carrying an attribute (e.g. `data-plot-show="diagram"`) reveal named panels or marks in steps, so that the circle can appear first, the diagram second, and the crossings third. The colors come from the theme's custom properties, and both modes look right.

The demo slide of the template shows the multipliers of the $\mathcal{L}_1$ Lyapunov family of the engine in `src/orbits.ts` (the engine already has a Newton corrector and a family continuation at $\mu = 0.01215$): compute the monodromy matrix of each member by integrating the variational equations, or by finite differences of the flow, in a script that writes the JSON, and show the two multipliers leaving the circle along the family. Keep the engine's accuracy modest, since the demo is a picture. The element must survive `npm run check`, `npm run pdf`, and `npm run pptx` (a still per step).

## Part 2: the stepped-maths convention

The maths of the talk is revealed as described in `plan/thesis-style-guide.md` of the talk folder: a lead-in sentence as one fragment, the whole display as the next, the interpreting sentence as the next, and a highlight fragment in which a symbol already shown changes color, with the display that the current sentence explains kept at full opacity while the earlier fragments are dimmed to 45 percent by the template. Define the convention in the template: a MathJax `\class{hl}{...}` on the symbol, a fragment with `data-highlight` naming the class, a CSS rule that colors the named class once that fragment is current (orange for motion, violet for structure, as the theme's palette already means), and a `data-keep` attribute (or a name you justify) on the display that holds it at full opacity through the sentence that explains it. Implement it in `src/steps.ts` and `theme/beeson.css`, test it under `node --test` in `test/` next to the existing steps test, document it in `AGENTS.md` under "Writing a slide" and in `README.md`, and show it on one demo slide.

## Deliverables

1. `src/plot.ts` (or a name you justify) wired in `src/main.ts`, the JSON format documented in `README.md`, a row in the README table, and a sentence in the vocabulary of `AGENTS.md`.
2. The stepped-maths convention in code, CSS, docs, and a demo slide.
3. Tests under `node --test` for the plot's parsing and frame interpolation and for the stepped maths.
4. `npm run build`, `npm run typecheck`, `npm test`, and `npm run check` green, and `npm run pdf` producing the page.

## Commits

The no-commit hook of this machine is paused tonight. Commit on your branch through the `commit-sequence` skill, in small single-purpose commits and without any attribution line. Do not push, and do not merge into `main`. Another agent works on the branch `editor` of this repository in `/Users/claudiovestini/.t3/worktrees/slides/editor`, and you leave it alone. Give the branch name and the head commit in your report.
