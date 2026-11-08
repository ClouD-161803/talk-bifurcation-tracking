# X1g: the correction scene and slide 10 after council round 5

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/COMMON.md` first, then the README and the storyboard `STORYBOARD.md` of `demos/corrector/`, and then the reports of round 5 that this brief answers, `.council/explainers/round-5/gemini-flash/report.md`, `.council/explainers/round-5/deepseek/report.md`, and `.council/explainers/round-5/glm/report.md`, with my answers in `.council/explainers/RESPONSE-5.md`. You work in the talk folder, `/Users/claudiovestini/git/talks/bifurcation-tracking`, on its branch `main`. Do not stage or commit, do not run `cd`, and run every build and script in the foreground.

The judges of round 5 found the correction scene clear, and two of them found too much motion on slide 10 around its payoff. The two sticks of the V are seen for about 0.3 s per iterate, and a comet with a yellow head is flown around the converged orbit while I point at the convergence panel. The rule of this brief is that each mark lives as long as the arc it belongs to, and that the converged orbit is held still.

## Working beside another implementer

Another implementer, X1h, revises the continuation scene at the same time, in `build_continuation` of `build.py`, in slides 12 and 13 of `index.html`, and in the sections of the storyboard and of `shots/INDEX.md` on the continuation scene. You edit only the following.

- In `build.py`, the function `build_correction` and the helpers and constants that only it uses. Leave `build_continuation`, `main`, and the computation of the runs alone, since the numerics stay.
- In `index.html`, the notes of slide 10 alone, read with `awk 'length <= 3000' index.html` since ten lines of the deck are the base64 of the viewers, and found by the comment `<!-- 10,`.
- In `STORYBOARD.md`, the section on scene 1, but not the table of colors and the paragraph on the clock and the speed in the section on the conventions of both scenes, which I edit after you report. In `shots/INDEX.md`, the section on the correction scene. In `shots.mjs`, the entries of the correction scene.

The Edit tool refuses a file changed since you read it, and you then read it again and redo the edit. When a build fails inside `build_continuation`, the other implementer is in the middle of an edit, hence wait three minutes and run the build again, and do not touch its code. Do not run `embed_scene.py`, `npm run check`, or the probe of the slides, which I run after both of you report.

## The decisions

1. The sticks of the V (Gemini Flash finding 2). With $S = 1$, keep each stick at the end of an arc, and its mirror image under the half period, for as long as its arc and its red gap are drawn, i.e. until the arc is replaced by its ghost at $n + 1$, and from 0.1 to 1 for iterate 0. Keep them as well with the last arcs of a failed run. On the converged iterate, keep every stick, the one at the node included, to the end of the loop, since the node is no longer moved. Under the half period they are then drawn as one vertical stick at the crossing, which Step 5 of slide 10 names. Remove the stick at the node at $n + 0.7$, and at 0.1 for iterate 0, as now, since the node is moved after it.
2. The converged orbit (Gemini Flash finding 3, GLM finding 5). Draw the converged orbit still, in teal with its glow, in every case, as it is now drawn while the switch "other segment counts" is on. Remove the comet and the yellow head from the scene, and tell me whether yellow is still drawn anywhere in either scene.
3. The point of iterate 0 (Gemini Flash finding 8). With $S > 1$, draw the point of iterate 0 in the convergence panel from the first frame of the loop, as with $S = 1$, so that the panel and the caption agree on the frame at which slide 11 is loaded.
4. The notes of slide 10 (DeepSeek finding 10). Replace Step 5 by the text below, word for word, and leave the other paragraphs as they are. Keep the spoken steps of slide 10 under 300 words, without the paragraph of the loaded state.

> Step 5: In the demo I fix x₀ on the axis and fly half a period, hence F is y and ẋ at T/2, two equations in ẏ₀ and T. My first guess is the converged orbit, scaled by 0.1%, so ε = 0.001. The white dot is the node, with its launch velocity as a white stick. The arc below the axis is the mirror image of the arc above, and the two sticks at the axis are their velocities. On a periodic orbit their V is one vertical stick. The red gap between the two arcs is the miss, which I call a defect, and the red dot is its target. I press play. I close the defect in seven iterates, keeping each earlier arc as a gray ghost. On the teal curve at right, the exponent of ‖F‖ nearly doubles at each iterate from the third to the sixth.

5. Rejected, with no change: iterate 1 played over two units of the clock (DeepSeek finding 9), the iterate and α cut from the caption (DeepSeek finding 4), the tolerance line moved (Gemini Flash finding 9), the crosses of the race in shot 6 (Gemini Flash finding 10), and the size of the text of the viewer (Gemini Flash finding 5, DeepSeek finding 4), which is set in the TyCHO runtime.

## The storyboard

Update the phases of an iterate, the description of iterate 0, the paragraph on the converged orbit, and shots 1 to 3 of scene 1 to the decisions above, so that the speaker's lines of shot 1 match the notes. Write by the writing rules of the global instructions and the reference `/Users/claudiovestini/.claude/skills/writing/references/notes.md`, and run `/Users/claudiovestini/git/dotfiles/bin/prose-lint --surface instruction` on the storyboard and fix every hit in your section.

## The build and the checks

Build with `uv run --project /Users/claudiovestini/git/tycho/code python /Users/claudiovestini/git/talks/bifurcation-tracking/demos/corrector/build.py --jobs 8`, which takes about 5 min while the other implementer builds too. Rerun `check_dylan.py` with the command of the README, which must exit 0. Add to `shots.mjs` a shot of shot 1 at the end of the loop, where the converged orbit is held with its vertical stick, rerun `node demos/corrector/shots.mjs correction` with the talk folder as the working directory, which deletes and retakes the PNGs of the correction scene alone, and update the tables and the sentences of the correction section of `shots/INDEX.md`. The tables were generated by `/private/tmp/claude-501/e2e/index_tables.py`. Look yourself at the first frame of shot 1, at a frame of shot 1 between $n + 0.7$ and $n + 1$ of iterate 2, at its last frame, at the first frame of shot 3, and at `correction-3b-11.47.png`.

## The report

Report in under twenty lines: what you changed per decision, whether yellow is still drawn, the count of words of the spoken steps of slide 10, the last line of `check_dylan.py`, the count of PNGs of the correction scene, what you saw in the PNGs, and any decision you made that this brief left open.
