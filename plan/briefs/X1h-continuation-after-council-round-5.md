# X1h: the continuation scene and slides 12 and 13 after council round 5

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/COMMON.md` first, then the README and the storyboard `STORYBOARD.md` of `demos/corrector/`, and then the reports of round 5 that this brief answers, `.council/explainers/round-5/gemini-flash/report.md`, `.council/explainers/round-5/deepseek/report.md`, and `.council/explainers/round-5/glm/report.md`, with my answers in `.council/explainers/RESPONSE-5.md`. You work in the talk folder, `/Users/claudiovestini/git/talks/bifurcation-tracking`, on its branch `main`. Do not stage or commit, do not run `cd`, and run every build and script in the foreground.

The judges of round 5 found the continuation scene clear, and all three found the fold of slide 13 hard to present. The blue pen is held there for about 2.3 s, in which I must click pause while I speak. At the fold, the dim red stop dot of the orange record lies beside the bright red dot of a failed blue attempt, and the faint white constraint line is a third pale stroke that the notes name and do not define. The rule of this brief is to give the speaker a longer still, and to leave one meaning per mark at the fold.

## Working beside another implementer

Another implementer, X1g, revises the correction scene at the same time, in `build_correction` of `build.py`, in slide 10 of `index.html`, and in the sections of the storyboard and of `shots/INDEX.md` on the correction scene. You edit only the following.

- In `build.py`, the function `build_continuation` and the helpers and constants that only it uses. Leave `build_correction`, `main`, and the computation of the runs alone, since the numerics stay.
- In `index.html`, the notes of slides 12 and 13 alone, read with `awk 'length <= 3000' index.html` since ten lines of the deck are the base64 of the viewers, and found by the comments `<!-- 12,` and `<!-- 13,`. I edit the small text under the display of slide 13 myself.
- In `STORYBOARD.md`, the section on scene 2, but not the table of colors and the paragraph on the clock and the speed in the section on the conventions of both scenes, which I edit after you report. In `shots/INDEX.md`, the section on the continuation scene. In `shots.mjs`, the entries of the continuation scene.

The Edit tool refuses a file changed since you read it, and you then read it again and redo the edit. When a build fails inside `build_correction`, the other implementer is in the middle of an edit, hence wait three minutes and run the build again, and do not touch its code. Do not run `embed_scene.py`, `npm run check`, or the probe of the slides, which I run after both of you report.

## The decisions

1. The hold at the fold (Gemini Flash finding 1, DeepSeek finding 3, GLM finding 1). Set `FOLD_HOLD` to 4.5 units of the clock in place of 2, i.e. about 5.2 s at the speed 0.25, at every step size. Keep taking the time from the part of the run before the pen enters the close-up, keep the timing inside the close-up and the hold at the end as they are, and keep the range of the clock, so that a loop still lasts 32 s. In the report, give the clock values of the hold at the fold and of the last member of the blue pen at each step size.
2. The constraint line (DeepSeek finding 1). Draw the constraint line of the blue pen in the violet of the tangent, `#c94fe6`, at an opacity low enough that it reads as fainter than the tangent, and under the tangent. Check in the PNGs that it is still seen over the gray family curve.
3. The stop of the orange record (DeepSeek finding 2). On the tab "both", do not draw the stop dot of the orange record, so that the record ends at its last member, at the fold. On the tab "natural parameter", keep the large bright red stop dot.
4. The red dots of failed attempts (DeepSeek finding 7). For both pens, keep the red dot of a failed attempt until the next member of its pen is drawn, i.e. at `MEMBER_AT` of the next attempt that converges, or to the end of the loop when the pen is stopped. A run of halvings is thus seen as a row of red dots. Keep drawing each dot only in a panel whose box contains it. Tell me how the row looks at the fold, on family 11 with the natural pen and with the blue pen.
5. The halvings in the caption (DeepSeek finding 8). Read out the halvings of the step of the newest member, and raise the count during a run of failed attempts. At the start of an attempt, set the count to the halvings of its step if this is more than the count shown, and at each member, set it to the halvings of the step that found the member. Thus on the Lyapunov family the count reads 1 at each member found with a half step, and on family 11 it rises to 14 at the stop of the orange pen.
6. The box of the close-up (Gemini Flash finding 7, DeepSeek finding 5). Draw the box of the close-up in the diagram at a size of at least 12 CSS px on each side in a viewer of 730 by 880 px, centered on the close-up, on both families. Draw it dashed if a TyCHO track can be drawn dashed, and otherwise solid, in its faint white. Keep the rule that the marks inside the range of the close-up are drawn in the close-up alone, with the true range of the close-up.
7. The label $\mathcal{L}_1$ (GLM finding 7, Gemini Flash finding 11). In the orbit panel of the Lyapunov family, draw the label $\mathcal{L}_1$ outside the envelope of the members, in an empty part of the panel, and join it to the point $\mathcal{L}_1$ by a thin gray line.
8. The notes of slides 12 and 13. Replace the paragraphs named below by these texts, word for word, and leave the other paragraphs as they are. Keep the spoken steps of each slide under 255 words, without the paragraph of the loaded state.

The paragraph of the loaded state of slide 12 (GLM findings 2 and 3):

> The demo is loaded paused on the tabs "𝓛₁ Lyapunov family, in C", "medium step", and "natural parameter" under "pens", at the speed 0.25×, at which one loop is played in 32 s. The caption names the moving pen, here the orange one. It is returned to this state each time I arrive at the slide. I spread Steps 4 and 5 over the whole loop, and I land the words "at the large red dot" on the stop of the pen, in the last seconds of the loop.

Step 3 of slide 12 (DeepSeek finding 11):

> Step 3: On the 𝓛₁ Lyapunov family, in the Jacobi constant C, it works. I plot the launch position x₀, where the orbit crosses the axis, against C, over the gray family curve, and I press play. With the orange pen, a dot that traces the family, I step C sideways and correct x₀ straight down. A red dot is a failed step, which I halve. The close-up at the top right is the faint white box, enlarged. Below, the newest orbit is orange and the earlier ones gray.

In the paragraph of the loaded state of slide 13, replace the sentence "At Step 3 I pause the demo while the blue pen is held at the fold, and if I miss the hold, I drag the slider of the clock back to it." by:

> At Step 3 I pause the demo while the blue pen is held at the fold, for about 5 s, and if I miss the hold, I drag the slider of the clock back to it.

Steps 2, 3, and 4 of slide 13 (DeepSeek findings 1, 2, 5, and 6):

> Step 2: With the blue pen I predict along the tangent and correct normal to it. The dim orange dots are the record of the orange pen of the slide before, which ends at the fold, where the pen stopped.

> Step 3: I press play, then predict along the violet tangent and correct along the faint violet line across it, on which I look for the new member. At the fold a step is shorter than a pixel in the diagram, hence I watch the close-up at the top right. With the blue pen I shorten the step at the turn and get round it. When the violet tangent points almost straight down, I click pause.

> Step 4: Here the tangent points almost straight down, and at the fold itself its e component is zero.

9. Rejected, with no change: a larger close-up or a dimmed orbit panel on slide 13 (Gemini Flash finding 4), the live switch to family 11 on slide 12 (Gemini Flash finding 6), and the size of the text of the viewer (Gemini Flash finding 5, DeepSeek finding 4), which is set in the TyCHO runtime.

## The storyboard

Update the description of the panels, of the pens and their records, of the timeline of the blue pen, of the phases of an attempt, shots 1 to 3, the Control column, and the speaker's lines of scene 2 to the decisions above, so that the speaker's lines of shots 1 to 3 match the notes. Write by the writing rules of the global instructions and the reference `/Users/claudiovestini/.claude/skills/writing/references/notes.md`, and run `/Users/claudiovestini/git/dotfiles/bin/prose-lint --surface instruction` on the storyboard and fix every hit in your section.

## The build and the checks

Build with `uv run --project /Users/claudiovestini/git/tycho/code python /Users/claudiovestini/git/talks/bifurcation-tracking/demos/corrector/build.py --jobs 8`, which takes about 5 min while the other implementer builds too. Rerun `check_dylan.py` with the command of the README, which must exit 0. Update the clock values of the continuation shots in `shots.mjs` where the new timeline moves the moments at the fold, keep a shot in the middle of the hold at the fold of shot 3, rerun `node demos/corrector/shots.mjs continuation` with the talk folder as the working directory, which deletes and retakes the PNGs of the continuation scene alone, and update the tables and the sentences of the continuation section of `shots/INDEX.md`. The tables were generated by `/private/tmp/claude-501/e2e/index_tables.py`. Look yourself at the PNGs of shot 2 at the stop, of shot 3 at the fold and at the end, and of shot 1 at its last frame.

## The report

Report in under twenty lines: what you changed per decision, the clock values of the holds, the counts of words of the spoken steps of slides 12 and 13, the last line of `check_dylan.py`, the count of PNGs of the continuation scene, what you saw at the fold and at the label $\mathcal{L}_1$, and any decision you made that this brief left open.
