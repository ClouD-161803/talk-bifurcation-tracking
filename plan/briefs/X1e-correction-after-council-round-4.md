# X1e: the correction scene and slides 10 and 11 after council round 4

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/COMMON.md` first, then the README and the storyboard `STORYBOARD.md` of `demos/corrector/`, and then the three reports of round 4 that this brief answers, `.council/explainers/round-4/codex/report.md`, `.council/explainers/round-4/opus-enterprise/report.md`, and `.council/explainers/round-4/glm/report.md`. You work in the talk folder, `/Users/claudiovestini/git/talks/bifurcation-tracking`, on its branch `main`. Do not stage or commit, do not run `cd`, and run every build and script in the foreground.

The judges of round 4 found the picture clear, and they found the words out of step with it. Slide 10 is loaded on an empty orbit panel, since the loop starts before the first arc is drawn, and the speaker then names the white sticks, the V, and the red gap, which are on the screen for about a second of each 16 s loop. On slide 11 the notes say "white nodes" over gray dots and "red gaps" over red rings. The rule of this brief is to give the speaker a still picture to talk over, and to make the words name what the screen shows.

## Working beside another implementer

Another implementer, X1f, revises the continuation scene at the same time, in `build_continuation` of `build.py`, in slides 12 and 13 of `index.html`, and in the sections of the storyboard and of `shots/INDEX.md` on the continuation scene. You edit only the following.

- In `build.py`, the function `build_correction` and the helpers and constants that only it uses. Leave `build_continuation`, `main`, and the computation of the runs alone, since the numerics stay.
- In `index.html`, the notes of slides 10 and 11 alone, read with `awk 'length <= 3000' index.html` since ten lines of the deck are the base64 of the viewers, and found by the comments `<!-- 10,` and `<!-- 11,`.
- In `STORYBOARD.md`, the section on scene 1. In `shots/INDEX.md`, the section on the correction scene. In `shots.mjs`, the entries of the correction scene.

The Edit tool refuses a file changed since you read it, and you then read it again and redo the edit. When a build fails inside `build_continuation`, the other implementer is in the middle of an edit, hence wait three minutes and run the build again, and do not touch its code. Do not run `embed_scene.py`, `npm run check`, or the probe of the slides, which I run after both of you report.

## The decisions

1. The first guess of one segment (Opus Enterprise finding 1, GLM findings 1 and 4). With $S = 1$, draw iterate 0 complete from the first frame of the loop, at the clock value $-2.3$: the arc and its mirror image, the launch stick at the node, the two sticks at the axis, the red gap, its red disc at the target, and the point of iterate 0 in the convergence panel. Hold this picture until the Newton step of iterate 0, and keep the later phases as they are, i.e. the sticks are removed at 0.1 and the node is moved from 0.1 to 1. Iterate 0 is then no longer drawn growing with one segment. The rule holds for every case with $S = 1$, over the half and the full period. The slide is thus loaded paused on the first guess, and the speaker names its marks over this still before pressing play.
2. The nodes at load (Opus Enterprise finding 4). With $S > 1$, draw all the nodes white from the first frame of the loop until the arc of the first segment starts to grow at $-2$. Then dim the other nodes as now. Slide 11 is thus loaded on sixteen white nodes.
3. The label of the current run (Codex finding 3). While the switch "other segment counts" is ticked, label the teal curve of the current $S$ at its last point with its value, e.g. "S = 16", in teal, by the placement rule of the gray labels. Keep the curves of $S = 2$ and $S = 4$, since the notes name their failures and shots 4 and 6 read them. Confirm in `correction-3b-11.47.png` that the five labels are read and do not overlap.
4. The notes of slides 10 and 11. Replace the paragraphs named below by these texts, word for word, and leave the other paragraphs as they are. Keep the spoken steps of each slide under 290 words, without the paragraph of the loaded state.

The paragraph of the loaded state of slide 10:

> The demo is loaded paused on the tabs "𝓛₁ Lyapunov", "CR3BP", "half period", "1" under "segments S", and "ε = 0.001" under "first guess". The switches "ghosts" and "defects" are ticked, and "solution" and "other segment counts" are not. The first guess is drawn from the start, with its arc, its two sticks at the axis, and its red gap, and I speak Steps 1 to 5 over this still. The speed is 0.5×, at which one loop is played in 16 s. The demo is returned to this state each time I arrive at the slide. A click on a tab does not restart the clock. To rewind, I press 0.

Step 5 of slide 10:

> Step 5: In the demo I fix x₀ on the axis and fly half a period, hence F is y and ẋ at T/2, two equations in ẏ₀ and T. The white dot is the node, with its launch velocity as a white stick. The arc below the axis is the mirror image of the arc above, and the two sticks at the axis are their velocities. On a periodic orbit their V is one vertical stick. The red gap between the two arcs is the miss, which I call a defect, and the red dot is its target. I press play. I close the defect in seven iterates, keeping each earlier arc as a gray ghost. On the teal curve at right, the exponent of ‖F‖ nearly doubles at each iterate from the third to the sixth.

The paragraph of the loaded state of slide 11 gets one sentence after "It is returned to this state each time I arrive at the slide.":

> One loop lasts 16 s, hence I speak Steps 0 to 2 over two or three loops, and I tick "other segment counts" once the run of sixteen segments has converged.

Step 0, Step 1, and Step 5 of slide 11:

> Step 0: An error at the start of a long arc is amplified along it, fast on an unstable orbit. Hence I cut the arc into S segments, here sixteen, at the white nodes. I press play. Here is one segment, with a red ring at the next node for its miss, then the other fifteen.

> Step 1: I require each segment to end on the next node, and the last on the first. The red rings are the defects Fᵢ. My guess is the converged orbit, scaled by 5%, so ε = 0.05.

> Step 5: In practice I build a first guess from the flow linearized at 𝓛₁, or from Richardson's third-order expansion for a halo orbit.

Check that "the converged orbit, scaled by 5%" describes the guess of `build.py` and the storyboard, and tell me if it does not.

5. Rejected, with no change: four representative defects in place of sixteen (Codex finding 2), the pause on the converged frame (Opus Enterprise finding 1), the contrast with slide 10 in Step 0 of slide 11 (Opus Enterprise finding 4), α shown only under the line search (Opus Enterprise finding 5), and the converged point on the tolerance line (GLM finding 3).

## The storyboard

Update the description of iterate 0, the phases, shots 1 to 3, and the speaker's lines of scene 1 to the decisions above, so that the speaker's lines of shots 1 and 3 match the notes. Write by the writing rules of the global instructions and the reference `/Users/claudiovestini/.claude/skills/writing/references/notes.md`, and run `/Users/claudiovestini/git/dotfiles/bin/prose-lint --surface instruction` on the storyboard and fix every hit in your section.

## The build and the checks

Build with `uv run --project /Users/claudiovestini/git/tycho/code python /Users/claudiovestini/git/talks/bifurcation-tracking/demos/corrector/build.py --jobs 8`, which takes about 5 min while the other implementer builds too. Rerun `check_dylan.py` with the command of the README, which must exit 0. Add to `shots.mjs` a shot of each of the scenes of slides 10 and 11 at the first frame of the loop, rerun `node demos/corrector/shots.mjs correction` with the talk folder as the working directory, which deletes and retakes the PNGs of the correction scene alone, and update the tables and the sentences of the correction section of `shots/INDEX.md`. The tables were generated by `/private/tmp/claude-501/e2e/index_tables.py`. Look at the first frames, at `correction-1--1.09.png`, at the first frame of shot 2, and at `correction-3b-11.47.png` yourself.

## The report

Report in under twenty lines: what you changed per decision, the counts of words of the spoken steps of slides 10 and 11, the last line of `check_dylan.py`, the count of PNGs of the correction scene, what you saw in the PNGs, and any decision you made that this brief left open.
