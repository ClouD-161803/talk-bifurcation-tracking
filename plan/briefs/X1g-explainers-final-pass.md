# X1g: the final pass on the corrector and continuation slides

You work in the talk folder `/Users/claudiovestini/git/talks/bifurcation-tracking`, on slides 10 to 13 of `index.html` (Differential correction, Multiple shooting and first guesses, From one orbit to a family, Pseudo-arclength continuation) and in `demos/corrector/`. You edit nothing else, you do not stage or commit, you do not run `cd` (use absolute paths or subshells), and you do not start subagents or reviewers.

## Context

X1, the explainers council, ran five rounds of judges on these slides and wrote its answers to round 5 in `.council/explainers/RESPONSE-5.md`. The changes listed there as accepted have not been made yet: e.g. `FOLD_HOLD` in `demos/corrector/build.py` is still 2.0, not 4.5. X1 was waiting for its fourth judge, Kimi, whose run stalled at 11:29Z without a report, hence X1 never made its final pass, and you make it in its place. Read `plan/briefs/X1-explainers-council-2.md` and `plan/briefs/DECK-COPY.md` for the rules of these slides, and the briefs `plan/briefs/X1e-correction-after-council-round-4.md` and `X1f-continuation-after-council-round-4.md` for how the previous implementers rebuilt and proved the scenes. `demos/corrector/README.md` and `STORYBOARD.md` describe the two scenes.

## Work

1. Make every change that `RESPONSE-5.md` lists as accepted, in `demos/corrector/build.py` and in the notes and text of slides 10 to 13.
2. Then apply `plan/briefs/X1-steer-final-pass.md`, the night orchestrator's review for clarity and the minimal set of controls. Where it contradicts an accepted change of `RESPONSE-5.md`, the steer holds, e.g. \(\boldsymbol W\) is dropped from the display of slide 13 rather than defined there (GLM's finding 4), and its weighting goes to the notes.
3. Rebuild the two scenes and the standalone pages `correction.html` and `continuation.html`, and re-embed the four viewers with `tools/deck/embed_scene.py` by the four commands in its docstring, which already carry the `--show` options of the steer.
4. In `RESPONSE-5.md`, replace `KIMI-PENDING` and `KIMI-SECTION-PENDING` with one sentence that Kimi's run stalled without a report and was not counted, and replace `SUMMARY-PENDING` with a short summary of the final pass, including the steer.
5. Update `demos/corrector/STORYBOARD.md` and `README.md` where they describe a control or a behavior you changed.

## Proof

Run `npm run check` and `npm run pdf` in the talk folder. The PDF must print one page per step ("N pages for N steps"), since a slide taller than 1080 px gives extra pages. Render the step pages of slides 10 to 13 from the PDF with `pdftoppm` and look at each, in dark mode and in light mode from `check/`, and fix anything cut, overlapping, or unreadable. Record the scene shots that `demos/corrector/shots.mjs` makes and look at the shots of the fold hold and of the converged orbit of slide 10.

## Report

End with a report under 400 words: each accepted change and each steer point, done or not with the reason, the commands you ran with their key output lines (the page and step counts, "no page errors"), the PNGs you looked at, and anything left. Write in complete sentences, by the writing rules of `/Users/claudiovestini/.claude/CLAUDE.md`.
