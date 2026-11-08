# H4: the halo family demo of tycho on slide 15

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/TEMPLATE-COMMON.md` first. Your checkout is a worktree of the template made by the harness, on a branch of its own. Other children work on the template at the same time, hence keep your changes of `index.html` to slide 15, and the rest to `demo/` and the vendored runtime.

## Claudio's words

> the tycho slide animations chosen for slide 15 are not very inspiring. why don't we replace those with the halo family demo that is pre built. perhaps with all 3 panels up.

## What is in place

- Slide 15, "Tycho on a slide", embeds a viewer written by `demo/tycho-scene.py` with `pytycho.build_embed`, between the two marker comments, as `<tycho-viewer theme="dark" autoplay class="zone">` with the scene and the data inline. It shows a distant retrograde orbit and an L1 Lyapunov orbit.
- The halo family demo of tycho is `/Users/claudiovestini/git/tycho/code/examples/halo/build.py`. Read `AGENTS.md` of tycho and the docstring of the script, build the page with `uv run --project /Users/claudiovestini/git/tycho/code python /Users/claudiovestini/git/tycho/code/examples/halo/build.py` from the tycho checkout, and open the page to see its panels. The runtime of tycho is vendored in `theme/vendor/tycho/tycho.js` of the template, and a page written by pytycho must be read by a runtime of the same version. Hence compare the version of the vendored runtime with the one pytycho writes. Where they differ, rebuild the runtime in the tycho checkout with `npm --prefix web ci && npm --prefix web run build` and vendor it as `scripts/vendor.mjs` does.

## Tasks

1. Write `demo/tycho-halo.py`, or extend `demo/tycho-scene.py`, so that the halo page is embedded on slide 15 in place of the current viewer. Its three panels are up from the start, i.e. an initial layout of three panels is set in the scene, and the viewer is sized so that the three panels read in the zone. Keep the inline form with the scene and the data in the slide, and report the size of the data of the slide, which must stay under a few megabytes.
2. Keep the text of the slide on embedding, and update the foot and the note for the halo family.
3. Run `npm test`, `npm run check`, and `npm run pdf`, look at the PNGs of slide 15 in `check/` in both modes, commit as you go, and report by TEMPLATE-COMMON.md.
