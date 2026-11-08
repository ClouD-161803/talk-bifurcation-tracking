# C1: a three.js surface element for the slide template, with the effective potential as its demo

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/COMMON.md` first. You work in a git worktree of the template repository `slides` that T3 Code prepared for you, on its own branch. Read `AGENTS.md` and `README.md` of the checkout, `src/main.ts`, `src/steps.ts`, `src/scenes.ts`, and the demo deck `index.html`, before any edit. The template is MIT and public, hence nothing in it may derive from DyLAN code, and the physics here is textbook.

## Why

Slides 4 and 5 of the talk build the circular restricted three-body problem (CR3BP) from its effective potential. The audience watches a surface being assembled in steps while the maths appears beside it: the gravitational wells $U_g = -(1-\mu)/\rho_1 - \mu/\rho_2$, then the centrifugal bowl $U_c = -(x^2 + y^2)/2$, then their sum $\tilde{U} = U_g + U_c$, then the five extrema, the libration points $\mathcal{L}_1$ to $\mathcal{L}_5$ (three saddles and two maxima), then the cut of the surface at the height $-C/2$, whose intersection is the zero-velocity curve, so that Hill's region (the allowed region, where $-2\tilde{U} \ge C$) is seen. The mass ratio of the demo is $\mu = 0.05$, so that the saddles are visible at the scale of a slide, and the primaries are at $(-\mu, 0)$ and $(1 - \mu, 0)$.

## What to build

A generic element of the template, in the spirit of the backdrops: a `div` with a class and data attributes, drawn by code in `src/` that is compiled into `theme/beeson.js`, with three.js vendored under `theme/vendor/three/` with its license by `scripts/vendor.mjs` (the policy is that nothing is fetched at show time). The element draws a surface $z = f(x, y)$ over a rectangle from a named function (the demo registers `effective-potential` with `data-mu`), under a slowly turning orbit camera that a drag can turn, colored by height with the theme's custom properties so that both modes look right. Each stage of the surface is tied to a step of the slide: a fragment of the same slide carries an attribute (e.g. `data-surface-stage="sum"`), and the surface changes its stage when reveal.js shows or hides that fragment, with a short animated transition between stages (the wells morphing into the sum, the extrema markers rising, the cutting plane sliding to $-C/2$). The stages of the demo are `wells`, `bowl`, `sum`, `extrema`, and `cut`, and the cut stage takes `data-C` for the Jacobi constant and draws the curve of intersection on the surface. The wells go to $-\infty$ at the primaries, hence clamp the height at a floor and say so in a comment.

The element must survive the three exports of the template: `npm run check` (screenshots in both modes, no console errors), `npm run pdf` (a still of the last stage, or of the current one with `?still`), and `npm run pptx` (a still per step). Under `?still`, draw the final stage at once without the turning.

Deliver these.

1. The element in `src/surface.ts` (or a name you justify), wired in `src/main.ts`, with the five libration points computed in the code for any $\mu$ (Newton's method on $\partial_x \tilde{U} = 0$ on the axis for the collinear points, and the two triangular points at $(1/2 - \mu, \pm\sqrt{3}/2)$).
2. A test under `node --test` in `test/`, for the build and for the maths (the libration points at $\mu = 0.05$ against known values, the symmetry of $\tilde{U}$, and the zero-velocity curve at a known $C$ passing through $\mathcal{L}_1$ when $C = -2\tilde{U}(\mathcal{L}_1)$).
3. A demo slide in `index.html`, with the five stages as fragments and the maths beside the surface, written by the style guide `plan/thesis-style-guide.md` of the talk folder (a lead-in sentence, then the display, then the interpreting sentence), a row in the table of `README.md`, and a sentence in the vocabulary of `AGENTS.md`.
4. `npm run build`, `npm run typecheck`, `npm test`, and `npm run check` all green, and `npm run pdf` producing the page.

## Commits

The no-commit hook of this machine is paused tonight. Commit on your branch through the `commit-sequence` skill, in small single-purpose commits and without any attribution line. Do not push, and do not merge into `main`. Another agent works on the branch `editor` of this repository in `/Users/claudiovestini/.t3/worktrees/slides/editor`, and you leave it alone. Give the branch name and the head commit in your report.
