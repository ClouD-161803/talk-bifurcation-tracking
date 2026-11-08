# A1: an axis title hidden where a body label would overlap it

You work in a fresh worktree of the tycho repository, made from `main`, and you edit nothing outside it apart from the output folder `/private/tmp/claude-501/a1/`. Read `AGENTS.md` and `CONTRIBUTING.md` of the checkout first. Run `npm --prefix web ci` and `npm --prefix web run build` before anything else, since the built runtime `src/pytycho/_static/tycho.js` is gitignored.

## The change

In the rotating panel of the manifolds slide variant (`examples/manifolds/build.py --slide dark`), the title of the x axis is drawn over the label of the Moon, because the Moon is on the x axis near the bottom edge of the view. Change the runtime so that an axis title of a plane camera is hidden when the label of a body would overlap it. The body label stays, since it names the disc that the viewer looks at, and the title of the other axis is unaffected.

The labels are collected in `labelItems` of `web/src/runtime/renderer.ts` (around lines 2046 to 2086): the tick numbers and the two titles come from `planeLabels` (around lines 600 to 633), and a body label is added with `add(d.label, d.at, d.size / 2 + 3, false)`. A `PanelLabel` of `web/src/runtime/overlay.ts` has `kind` `'tick'`, `'title'`, or undefined for a body label. The page writes the labels as spans (around line 2123 of the renderer, 13 px for a title), and a video frame writes them with the same sizes in `web/src/runtime/export.ts` (around line 248). The width of a tick number is estimated by `tickWidth`. Estimate the box of a title and of a body label the same way, so that the page and the export agree, and put the test of overlap in a pure function that `labelItems` calls, in the way `planeLabels` is pure and tested in `web/test/fit.test.ts` (lines 243 and 407 to 428).

Write the regression test first, in `web/test/`, run it, and confirm that it fails because the title is still listed. Keep this output for the report. Then write the fix, and run `npm --prefix web test`, `npm --prefix web run typecheck`, `npx prettier --write` from `web/` on each file you touched, `uv run pytest`, and `uvx pre-commit run --all-files`. Add a line under `## [Unreleased]` of `CHANGELOG.md`, and a sentence on the rule in the page of `docs/guide/` that describes the labels of a panel (`html.md` line 47 lists them, and `panels.md` or `bodies.md` is where the rule belongs).

## The clips

Rebuild the two clips of the talk template from the fixed runtime, without vendoring anything: the orchestrator copies the files afterwards. The commands of `CONTRIBUTING.md` (the section on `web/scripts/video.mjs`) are, for the dark mode,

```sh
uv run python examples/manifolds/build.py --slide dark
node web/scripts/video.mjs examples/manifolds/manifolds-slide-dark.html /private/tmp/claude-501/a1/clip-dark-60.mp4 --size 1200x1600 --dpr 2 --fps 60 --theme dark --font <font>
```

and the same with `light` for the light mode. The font is the Latin Modern Roman of the template, copied to `/private/tmp/claude-501/a1/font/latin-modern-roman-400-normal.woff2`. Read `video.mjs` for whether `--font` takes a path or a name, and for the poster it writes. The clips in the template were re-encoded at 30 frames per second with CRF 24, e.g.

```sh
ffmpeg -y -i /private/tmp/claude-501/a1/clip-dark-60.mp4 -r 30 -c:v libx264 -crf 24 -pix_fmt yuv420p -movflags +faststart /private/tmp/claude-501/a1/clip-dark.mp4
```

Leave `clip-dark.mp4`, `clip-light.mp4`, and the two posters `clip-dark.png` and `clip-light.png` in `/private/tmp/claude-501/a1/`. Look at the last frame of each: the title of the x axis must be gone from the rotating panel, the title of the y axis and both titles of the inertial panel must still be there, and the label of the Moon must be readable.

## Commits and the report

The commit hook is paused until 16:31Z today, hence commit in the worktree yourself, by the `commit-sequence` skill: the failing test alone first, then the fix, then the changelog and the docs. No attribution line in any message. Never push, and never touch the main checkout `/Users/claudiovestini/git/tycho/code`.

Write `/private/tmp/claude-501/a1/REPORT.md` with the path of the worktree and its branch, the list of commits, the output of the test before the fix, the counts of each suite, and the sizes of the four files, and repeat the path and the branch in your final message.
