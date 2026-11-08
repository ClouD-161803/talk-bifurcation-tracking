# B1: a tycho layer drawn in the driver's context, for the breathing grid

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/COMMON.md` first. You work in a git worktree of tycho that T3 Code prepared for you, on its own branch. Read `AGENTS.md` of the checkout, then `spec/tycho-scene.md` in full, before any edit.

## Why

The frames demo of the talk (slide 6, the ER3BP) shows the same libration points and the same orbit in three panels: the rotating-pulsating frame $(x, y)$, the rotating frame $(\xi, \eta) = \rho(\theta)\,(x, y)$, and the barycentric inertial frame. The point of the demo is that the rotating and the inertial panels show the grid of the pulsating frame breathing (scaling with $\rho(\theta)$) and turning. Today a `grid` layer draws the grid of the display frame only, and a track layer transforms each sample of a track in the context of that sample's own time. A grid line is a static polyline in the pulsating frame, with no time of its own, hence it has to be transformed in the context of the driver's reading, i.e. at the current time of the panel.

## What to build

Add to the scene format the ability to draw a stored polyline, held in one frame, in the display frame at the driver's reading. The brainstorm that led to this brief proposed a track layer with a key, e.g. `"context": "driver"` (default `"own"`), under which every vertex of every member of the layer is transformed in the driver's context (the blended context of the two samples around the reading, as rule L4 defines for a body), rather than in the vertex's own context. This covers the grid lines, a reference ring, and any static drawing, without any geometry generated in the runtime. The alternative is a `grid` layer with a source `frame` whose lines are generated in the runtime. Choose the design that fits the S, V, C, F, and L rules of the spec with the smallest change, and explain the choice in your report. Whatever the design, it must satisfy these points.

1. The spec is amended (the rule, the example, the feature name in section 4, and the version, which goes from 0.2 to 0.3 as a minor addition), `spec/scene.schema.json` is extended, `web/src/scene.gen.ts` is regenerated with `npm --prefix web run gen:types`, and a conformance case is added to `spec/conformance/` with the answer that both evaluators must give.
2. Both evaluators implement it: `web/src/evaluate/` and `src/pytycho/_evaluate.py`. The writer in `src/pytycho/scene.py` accepts the key and checks it by the rules you write.
3. The renderer draws it, under a `plane` camera and an `orbit` camera, and the video export too.
4. Tests in `web/test/` and `tests/` cover it, including a case where the set does not carry the clock channels (such a static set is never read, so rule C5 must allow it when the layer has no reveal and no head).
5. A line under `## [Unreleased]` in `CHANGELOG.md`, and a sentence in the docs where the layers are described.

Prove it with `npm --prefix web test && npm --prefix web run typecheck`, `uv run pytest`, `uvx pre-commit run --all-files`, and a small scene written with pytycho in which a grid of the pulsating frame of a Kepler ellipse is drawn in the inertial frame and visibly breathes. Put this scene in `examples/` only if it earns its place, and otherwise keep it in a scratch folder and describe it in the report.

## Commits

The no-commit hook of this machine is paused tonight. Commit on your branch through the `commit-sequence` skill, in small single-purpose commits, the failing test first where there is a bug fix, and without any attribution line. Do not push, and do not merge into `main`. Give the branch name and the head commit in your report.
