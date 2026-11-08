# B2: a plane camera with a free aspect ratio in tycho

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/COMMON.md` first. You work in a git worktree of tycho that T3 Code prepared for you, on its own branch. Read `AGENTS.md` of the checkout, then `spec/tycho-scene.md` in full, before any edit.

## Why

Two demos of the talk draw diagrams rather than orbits in a tycho panel: a convergence plot of the Newton iteration (the iteration count against $\log_{10}\|\boldsymbol{F}\|$) and a continuation diagram (the eccentricity $e \in [0, 0.5]$ against a coordinate $x_0 \in [-1.2, -0.8]$ of the initial state). Each is written as track sets in a "plot" frame. Under the `plane` camera of today, the two axes share one scale, hence such a diagram fills a thin strip of its panel and wastes the rest.

## What to build

Add a key to the `plane` camera, `"aspect": "equal"` (the default, today's behavior) or `"free"`, under which the fit of section 2.7 (the paragraph "When a panel's view, frame, or sets change, a reader fits the panel's camera ...") scales $x$ and $y$ separately so that the drawn tracks fill the panel in both directions, with a small margin. Under `free`, the `axes` and `grid` layers tick and number each axis on its own scale, the pan and the zoom of the viewer act per axis in the natural way (a wheel zoom scales both, a drag pans both), and the video export uses the same fit. Bodies, heads, and widths stay in CSS pixels.

1. Amend the spec (the camera paragraph of section 2.7, the feature name in section 4 if one is needed under rule S1, and the version, from 0.2 to 0.3 as a minor addition; if another branch of tonight already takes 0.3, say so in the report and still use 0.3, since both land in one release). Extend `spec/scene.schema.json`, and regenerate `web/src/scene.gen.ts` with `npm --prefix web run gen:types`. The evaluator is unaffected, since the camera is drawing only, hence no conformance case is needed, but state this in the spec where the drawing-only properties are listed.
2. The writer in `src/pytycho/scene.py` accepts the key on a plane camera.
3. The renderer in `web/src/runtime/` implements the fit, the ticks, the interaction, and the export.
4. Tests in `web/test/` cover the fit (a 10 by 1 extent fills a square panel in both directions under `free` and not under `equal`) and the ticks.
5. A line under `## [Unreleased]` in `CHANGELOG.md`, and a sentence in the docs.

Prove it with `npm --prefix web test && npm --prefix web run typecheck`, `uv run pytest`, `uvx pre-commit run --all-files`, and a small pytycho scene with a wide and flat set of tracks, rendered in a browser screenshot (the `check` tooling of the repo, or the headless browser of the vitest suite), which you describe in the report.

## Commits

The no-commit hook of this machine is paused tonight. Commit on your branch through the `commit-sequence` skill, in small single-purpose commits and without any attribution line. Do not push, and do not merge into `main`. Give the branch name and the head commit in your report.
