# Response to round 5

I answer each finding of round 5 below, with what I changed or why I rejected it. From round 5 on, the council is made of GLM, Kimi, DeepSeek, and Gemini Flash. In round 5 I received the reports of Gemini Flash (8/10), DeepSeek (8/10), GLM (9/10). Kimi did not report, since its run timed out after about four hours, and I recorded it as unavailable. Round 5 is the last round under the cap of three, hence I made the changes below without convening a sixth round.

The three judges agree that each shot carries one idea and that the numbers hold. What is left is mostly at the fold of slide 13, where the hold was too short to pause on by hand, and where two reds and a white line had to be told apart. I lengthened the hold, cut the stop dot of the orange record on the tab "both", and drew the constraint line in violet with the tangent that defines it. On slide 10, I cut the comet and the yellow head of the converged orbit, and I kept the V of the sticks with its arc. The size of the text of the viewer is still set in the TyCHO runtime, and I left it as a decision for Claudio.

In the final pass I also applied the steer of the night orchestrator, and where the steer differs from an answer below, I followed the steer. I now show on each slide only the controls I speak to. These are the tabs of the targeting on slide 10, the toggle "other segment counts" on slide 11, the tabs of the family on slide 12, and the transport alone on slide 13. In the notes I name the page of the demo that I open in a tab for questions. On slide 10, I cut "of least norm" and the definition of δX from the slide. In Step 5 I now say that the orbit is a Lyapunov orbit, a planar periodic orbit about 𝓛₁ of the CR3BP. I retitled slide 11 "Multiple shooting" and cut its fragments on first guesses, keeping one sentence on them in the notes. On slide 12 I named the Lyapunov family, and I replaced the value of e at the fold and the display of the determinant by words. On slide 13, I cut W from the display, wrote the step on the fold as τₑ = 0 under the violet highlight, and cut the last fragment. I also kept the stick at the node of the last iterate of a run with one segment, and I drew the box of the close-up in dashes.

## Gemini Flash

1. The hold at the fold is too short to pause by hand (major). Accepted. The blue pen is now held at the fold for 4.5 units of the clock in place of 2, i.e. about 5.2 s at the speed 0.25, and the time is taken from the part of the run before the pen enters the close-up. The loop still lasts 32 s. I did not add an automatic pause, since a TyCHO viewer cannot be paused at a given clock value.
2. The white sticks flash on and off (major). Accepted in part. The two sticks at the end of the arc are now kept with their arc and its red gap until the arc is replaced by its ghost at $n + 1$, and on the converged iterate to the end of the loop, where they are one vertical stick. I did not remove the sticks, since their V is what Step 5 of slide 10 explains, and on a periodic orbit it closes to the one stick that Step 5 names.
3. The comet and the yellow head on the converged orbit of slide 10 (major). Accepted. The converged orbit of the correction scene is now drawn still, in teal with its glow, in every case, as it was during the race of slide 11. Yellow is thus no longer drawn in the scene.
4. The still orbit panel of slide 13 (major). Rejected. The orbit panel is held still while the blue pen is in the close-up, so that the only motion on the screen is in the close-up. A larger close-up on slide 13 alone would need a second layout of the scene.
5. The tab rows and the text size of the viewer (major). Not changed. The tab rows and the size of the text are set in the TyCHO runtime, outside the scenes and the slides, and I list the change as a decision for Claudio, as in round 4.
6. The live switch to family 11 on slide 12 (minor). Rejected. The stop of the orange pen at the fold is the payoff of slide 12, and I speak Steps 4 and 5 over the 25 s of the run.
7. The box of the close-up on family 11 (minor). Accepted. The box is now drawn at a size of at least 12 px on the screen, centered on the close-up, hence on family 11 it is seen as a small square at the fold. DeepSeek asks for the same in its finding 5.
8. The caption of slide 11 at load (minor). Accepted, with a different change. With more than one segment, the point of iterate 0 is now drawn in the convergence panel from the first frame, as with one segment, so that the panel and the caption agree at load.
9. The converged point on the tolerance line (minor). Rejected again. The run is stopped at the first iterate below the tolerance, hence its last point is expected just below the line, and the caption reads −11.1. A line drawn lower would misstate the tolerance.
10. The crosses of $S = 1$ and $S = 2$ in shot 6 (note). No change, since shot 6 is material for questions.
11. The label $\mathcal{L}_1$ among the smallest orbits (note). Accepted, with finding 7 of GLM. The label is now drawn outside the envelope of the family and joined to the point $\mathcal{L}_1$ by a thin gray line.

## DeepSeek

1. The faint white constraint line (major). Accepted. The constraint line is now drawn in a faint violet, since it is defined by the violet tangent, and white is left to the nodes, the sticks, and the box of the close-up. Step 3 of slide 13 now says that the new member is looked for on this line.
2. Two reds at the fold (major). Accepted, by the cut you propose. On the tab "both", the stop dot of the orange record is no longer drawn, and Step 2 of slide 13 says that the record ends at the fold.
3. The hold at the fold (major). Accepted, with finding 1 of Gemini Flash.
4. The size of the caption and the labels (major). Not changed. The size of the text is set in the TyCHO runtime, and I list it as a decision for Claudio. I kept the iterate and α in the caption, since the failure at $n = 2$ is read in shot 2 and the halving of α in shot 6. A viewer 880 px wide would cover the text column of the slide.
5. The pen leaves the diagram for the close-up (major). Accepted. The box of the close-up is drawn at a size of at least 12 px, as in finding 7 of Gemini Flash, and Step 3 of slide 13 now says that at the fold I watch the close-up, since a step is shorter than a pixel in the diagram.
6. The held tangent is 6° from vertical (minor). Accepted, in other words. Step 4 of slide 13 now says that here the tangent points almost straight down, and that at the fold itself its $e$ component is zero.
7. The red dot of a failed step is seen for about 1 s (minor). Accepted, for both pens. The red dot of a failed attempt is now kept until the next member of its pen is drawn, hence a run of halvings is seen as a row of red dots.
8. The halvings in the caption read 0 (minor). Accepted. The count was that of the current attempt, which is a full step again after each success. The caption now reads the halvings of the step of the newest member, and the count is raised during a run of failed attempts.
9. Iterate 1 is short (minor). Rejected. Since round 4, I name the marks of iterate 0 over a still before I press play, and iterate 1 repeats them.
10. The first guess of slide 10 (minor). Accepted. Step 5 of slide 10 now says that my first guess is the converged orbit, scaled by 0.1%, as Step 1 of slide 11 says for 5%.
11. "Pen" is not defined (minor). Accepted, with your sentence in Step 3 of slide 12.
12. The speed in the storyboard and the README (note). Accepted. Both now say that the deck sets the speed of the viewer from its slide, and that the speed menu is used only for a page opened alone.

## GLM

I accept your reading of the round-4 findings, and I answer the label of $\mathcal{L}_1$ under finding 7 below.

1. The hold at the fold (minor). Accepted, with a longer hold than you ask, 4.5 units of the clock in place of 3.5, as in finding 1 of Gemini Flash.
2. "At the large red dot" is spoken before the dot is drawn (minor). Accepted, with your sentence in the paragraph of the loaded state of slide 12.
3. The caption names neither pen (note). Accepted, with your half sentence in the paragraph of the loaded state of slide 12.
4. The weight matrix $\boldsymbol{W}$ is not defined on slide 13 (note). Accepted, by the cut that the night orchestrator asks for in the steer for the final pass. I left the matrix out of the display of slide 13, and in the notes I say that I weight only $\dot{y}_0$ and $e$ in the distance, each by its range over family 11.
5. The yellow head on the converged orbit (note). Accepted, by the cut, as in finding 3 of Gemini Flash. The converged orbit is drawn still, in teal with its glow.
6. The converged point on the tolerance line (note). No change, as you advise.
7. The label $\mathcal{L}_1$ among the smallest orbits (note). Accepted, since you and Gemini Flash both raise it. The label is now drawn outside the envelope of the family and joined to the point $\mathcal{L}_1$ by a thin gray line.
8. The question shots (note). No change, since all three shots are material for questions.

## Kimi

Kimi did not report. Its run was ended by a timeout of the provider after about four hours. In its transcript I found that it had reproduced the iterates of slide 10, from −0.234 at iterate 0 to −12.4 at iterate 7, and that it had not reached a finding. I recorded Kimi as unavailable and did not replace it.
