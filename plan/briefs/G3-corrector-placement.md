# G3: the correction and continuation demos on slides 10 to 13 of the deck

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/COMMON.md` first. You work in the talk folder, `/Users/claudiovestini/git/talks/bifurcation-tracking`, on its branch `main`, and you edit `index.html` and the tools under `tools/deck/` only. Nobody else edits the deck while you work. Do not stage or commit.

## What is in place

- Slides 10 to 13 of `index.html` start at the comments `<!-- 10,`, `<!-- 11,`, `<!-- 12,`, and `<!-- 13,` (lines 246, 276, 300, and 326). On each slide there is a placeholder `<div class="ph">` (lines 263, 287, 314, and 341) with the name of the demo and the path of its page. The rules of `.ph` are at lines 24 and 25 of the head.
- The two demos are in `demos/corrector/`: `correction.tys` with `correction.tyd` (the page `correction.html`, 6.4 MB) and `continuation.tys` with `continuation.tyd` (the page `continuation.html`, 1.5 MB), built by `build.py`. In `STORYBOARD.md` of the same folder the shots of each scene are tabulated, with a Control column that names what the speaker clicks, and the conventions of both scenes are listed at the top. Scene 1 has the tabs case, system, targeting, S, and guess and the toggles ghosts, defects, and solution. Scene 2 has the tabs family and step size.
- The viewer is worked by hand during the talk. The notes of slides 10 to 13 already say at which step Claudio clicks which tab, and a fragment cannot set a variable of a viewer. Hence each slide needs only the right initial state and the controls.
- The embed script is `tools/deck/embed_scene.py`. Read its docstring. The viewer is written between two marker comments of the deck. With `--controls` the tabs, sliders, switches, and transport are shown, and the viewer starts paused. With `--set VARIABLE=VALUE` the initial value of a variable is set. With `--style` the viewer is placed in slide pixels, and without it the viewer takes the zone of the slide layout. Slide 7 (the frames scene, with `--controls`) and slide 19 (the Broucke page, kiosk, with `--style`) are the two uses so far. The names and the values of the variables are in the scene documents.
- The stability demo was placed on slides 14 to 17 by another child with the plot element, in the same deck.
- The fold of family 11 is at e = 0.45386506 (`demos/corrector/CHECKS.md`). Slide 17 writes it as 0.45387, rounded. Slides 12 and 13 still write 0.45386 (lines 337 and 364), as the storyboard does.

## Tasks

1. Embed the correction scene on slides 10 and 11, in place of the placeholder of each, with `embed_scene.py --controls`, between marker comments labeled "the correction scene, slide 10" and "the correction scene, slide 11". Set the initial state of each slide with `--set` to the state its first step needs, read from the notes of the slide and the shots of the storyboard. Keep the per-slide inline form, although the data is then inlined twice.
2. Embed the continuation scene on slides 12 and 13 in the same way, with the labels "the continuation scene, slide 12" and "the continuation scene, slide 13".
3. Look at the result: with the controls, the viewer must fit the zone beside the text column, with its panels readable. Scene 1 is an orbit panel over a convergence panel, and scene 2 is a diagram over two orbit panels. Where the zone is too small, place the viewer with `--style` in slide pixels, as slide 19 does.
4. Resolve the two `TODO(claudio)` lines at 272 and 349 with the names of the tabs, as shown in the viewer. Rewrite the notes of slides 10 to 13 as one "Step N:" paragraph per step. Name at each step the tab, the toggle, or the control Claudio works, with its label as shown in the viewer.
5. Write the fold as e = 0.45387 on slides 12 and 13 and in their notes.
6. Remove the four placeholders, and the two `.ph` rules of the head once the deck does not contain `.ph` any more.
7. Add to the docstring of `embed_scene.py` the four commands that write these embeds, so that they can be rerun after the pages are rebuilt, which is planned.
8. Run `npm run check`, which must end with "no page errors", and `npm run pdf`. Look at the PNGs of slides 10 to 13 in both modes and confirm that each viewer shows its initial state with its controls and that the text does not run under the zone. Do not run `npm test`.

Report in under twenty lines: the four commands, the initial state of each slide, the size of `index.html` before and after, the last lines of the check and of the PDF, and what you could not do.
