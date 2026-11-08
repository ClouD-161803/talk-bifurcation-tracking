# X1f: the continuation scene and slides 12 and 13 after council round 4

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/COMMON.md` first, then the README and the storyboard `STORYBOARD.md` of `demos/corrector/`, and then the three reports of round 4 that this brief answers, `.council/explainers/round-4/codex/report.md`, `.council/explainers/round-4/opus-enterprise/report.md`, and `.council/explainers/round-4/glm/report.md`. You work in the talk folder, `/Users/claudiovestini/git/talks/bifurcation-tracking`, on its branch `main`. Do not stage or commit, do not run `cd`, and run every build and script in the foreground.

The judges of round 4 found the picture clear, and they found the payoff of slide 13 out of step with the words. The tangent of the blue pen points straight down at the fold at about 21.4 on the clock, for about 2 s of a loop of 32 s, while the speaker names this vertical tangent at Steps 4 and 5, after Step 3 has been spoken in full. The rule of this brief is to give the speaker a still picture to talk over.

## Working beside another implementer

Another implementer, X1e, revises the correction scene at the same time, in `build_correction` of `build.py`, in slides 10 and 11 of `index.html`, and in the sections of the storyboard and of `shots/INDEX.md` on the correction scene. You edit only the following.

- In `build.py`, the function `build_continuation` and the helpers and constants that only it uses. Leave `build_correction`, `main`, and the computation of the runs alone, since the numerics stay.
- In `index.html`, the notes of slides 12 and 13 alone, read with `awk 'length <= 3000' index.html` since ten lines of the deck are the base64 of the viewers, and found by the comments `<!-- 12,` and `<!-- 13,`.
- In `STORYBOARD.md`, the section on scene 2. In `shots/INDEX.md`, the section on the continuation scene. In `shots.mjs`, the entries of the continuation scene.

The Edit tool refuses a file changed since you read it, and you then read it again and redo the edit. When a build fails inside `build_correction`, the other implementer is in the middle of an edit, hence wait three minutes and run the build again, and do not touch its code. Do not run `embed_scene.py`, `npm run check`, or the probe of the slides, which I run after both of you report.

## The decisions

1. The hold at the fold (Opus Enterprise finding 3). With the blue pen on family 11, at every step size and on both tabs of "pens" where it is drawn, hold the blue pen for about 2 units of the clock at the member whose tangent has the smallest $e$ component, with its violet tangent, its constraint line, and its caption shown. Hold the end of the loop longer as well, so that the last member at $e = 0.398$ is held for about 3.5 units in place of 1.5. Take the time of both holds from the part of the run before the pen enters the close-up box, keep the timing inside the box as it is, and keep the range of the clock, so that a loop still lasts 32 s at the speed 0.25. In the report, give the clock values of the hold at the fold and of the end of the blue pen on slide 13.
2. The stop of the orange record (Opus Enterprise finding 6). On the tab "both", draw the large stop dot of the orange record dim, at about the brightness of the dim orange dots of the record, so that the small red dots of the failed attempts of the blue pen are the only bright red near the fold. On the tab "natural parameter", keep the stop dot bright red.
3. The tangent (Opus Enterprise finding 7). Draw the violet tangent opaque and above the blue predictor, so that it reads `#c94fe6` where the two overlap.
4. The notes of slides 12 and 13. Replace the paragraphs named below by these texts, word for word, and leave the other paragraphs as they are. Keep the spoken steps of each slide under 235 words, without the paragraph of the loaded state.

Step 2 and Step 3 of slide 12 (GLM finding 2, Opus Enterprise finding 8):

> Step 2: In natural-parameter continuation I step p by Δp and correct X from the last member of the family.

> Step 3: On the 𝓛₁ Lyapunov family, in the Jacobi constant C, it works. I plot the launch position x₀, where the orbit crosses the axis, against C, over the gray family curve, and I press play. With the orange pen I step C sideways and correct x₀ straight down. A red dot is a failed step, which I halve. The close-up at the top right is the faint white box, enlarged. Below, the newest orbit is orange and the earlier ones gray.

The paragraph of the loaded state of slide 13 gets one sentence after "It is returned to this state each time I arrive at the slide.":

> At Step 3 I pause the demo while the blue pen is held at the fold, and if I miss the hold, I drag the slider of the clock back to it.

Step 3 and Step 6 of slide 13:

> Step 3: I press play, then predict along the violet tangent and correct along the faint white constraint line across it. The orange pen stopped here, at the fold, on the slide before. With the blue pen I shorten the step at the turn and get round it. When the violet tangent points straight down, I click pause.

> Step 6: I press play, and I continue toward smaller e, down to e = 0.398. Hence in arclength I pass the fold. A fold is one kind of bifurcation, and to find the others I need the stability of each member.

Check that the tangent of the held member points straight down in the close-up, i.e. within a few degrees of vertical, and tell me the angle if it does not.

5. Rejected, with no change: hiding the close-up on the Lyapunov family (Codex finding 1), since the red dot of a failed step is seen only in the close-up, the text size and the chips of the viewer (Opus Enterprise finding 2), which are set in the TyCHO runtime, the caption during a failed attempt (GLM finding 5), and the label of $\mathcal{L}_1$ among the smallest orbits (GLM finding 7), since the family shrinks onto $\mathcal{L}_1$.

## The storyboard

Update the description of the timeline of the blue pen, the colors of the record of slide 13, shot 3, the Control column, and the speaker's lines of scene 2 to the decisions above, so that the speaker's lines of shots 1 to 3 match the notes. Write by the writing rules of the global instructions and the reference `/Users/claudiovestini/.claude/skills/writing/references/notes.md`, and run `/Users/claudiovestini/git/dotfiles/bin/prose-lint --surface instruction` on the storyboard and fix every hit in your section.

## The build and the checks

Build with `uv run --project /Users/claudiovestini/git/tycho/code python /Users/claudiovestini/git/talks/bifurcation-tracking/demos/corrector/build.py --jobs 8`, which takes about 5 min while the other implementer builds too. Rerun `check_dylan.py` with the command of the README, which must exit 0. Update the clock values of the continuation shots in `shots.mjs` where the new timeline moves the moments at the fold, add a shot in the middle of the hold at the fold of shot 3, rerun `node demos/corrector/shots.mjs continuation` with the talk folder as the working directory, which deletes and retakes the PNGs of the continuation scene alone, and update the tables and the sentences of the continuation section of `shots/INDEX.md`. The tables were generated by `/private/tmp/claude-501/e2e/index_tables.py`. Look at the PNGs of shot 3 at the fold and at the end yourself.

## The report

Report in under twenty lines: what you changed per decision, the clock values of the holds, the angle of the held tangent, the counts of words of the spoken steps of slides 12 and 13, the last line of `check_dylan.py`, the count of PNGs of the continuation scene, what you saw at the fold, and any decision you made that this brief left open.
