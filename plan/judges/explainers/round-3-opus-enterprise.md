Overall: 6/10

Ready with changes: the mathematics and the numbers hold, but both of Claudio's requests are still open, since the red and white lines are never introduced and slides 11 and 13 show more at once than a viewer can follow.

## Findings

The cap is twelve findings, and I list ten, ordered by severity.

1. Blocker, correction shots 1, 2, 3, 4a, and 6c (Q11, Q12). At iterate 0 of shot 1 the viewer sees two white sticks in a V at the end of the arc and a red bar between their tips, floating below the x-axis apart from the red gap at the end of the arc. Shot 2 shows two parallel red lines, shots 4a and 6c a red and white quadrilateral at every node, and shot 3 has 32 white sticks while its defects are too short to see. The notes mention only "the red mark" and never a white stick, which is the confusion that Claudio reported. Change: cut the red bar between the stick tips in every shot, and draw the sticks only when S = 1. Then add to slide 10, Step 5: "The white stick at the end of the arc is its velocity where it meets the axis, and the other stick is its mirror image. On a periodic orbit the two are one vertical stick, and the red gap is the miss, which I call a defect."

2. Major, continuation shot 3, slide 13 (Q7, Q11, Q12). Both pens are animated together in the close-up at about 0.5 s per attempt, and about 25 red dots persist by 27.46 s. The orange stop marker is lost among them, and the halvings of the blue pen are too small to see, which dilutes the payoff. In the notes the speaker asks the viewer to count what cannot be read: "the orange pen is stopped after 14 halvings" and "you see the blue pen halve its step up to 9 times". Change: draw the run of the orange pen as a finished, dimmed record with one large stop marker at e = 0.4539, animate the blue pen alone, and let each red dot fade by the next attempt. Replace the last three sentences of Step 3 with "The orange pen stopped here, at the fold. The blue pen shortens its step at the turn, gets round, and continues toward smaller e, down to e = 0.398."

3. Major, slide 11 and correction shots 4 and 5 (Q1, Q11). The notes of slide 11 run to 573 words, about 4.4 min at 130 words per minute, over about ten clicks. In that time the speaker introduces multiple shooting, a race of 1 to 16 segments, the ER3BP with a pulsation color, a line search, and family 11 with a negative period of −59.7 that is "not a sure cure". In shot 5b, crosses at n = 2, 5, and 10 are shown and not named. Change: move shot 4 (family 11 and the negative period) to a backup slide for questions, drop the apoapsis run, and turn off the other segment counts before shot 5.

4. Major, correction shots 1 to 5 and slide 11, Step 3 (Q3, Q11). The iterate n is colored by a plasma colormap on the ghosts, the convergence curve, and a colorbar, although n is already given by the abscissa of the convergence panel and the ghosts are already faint. In the INDEX of the shots it is recorded that the plasma shades cannot be told apart. A viridis colormap of the pulsation factor is used for one shot only. Change: cut both colormaps. Draw the ghosts in gray, which is defined as context in the storyboard, and the ER3BP arcs in teal, then delete both colorbars and the sentences that explain them.

5. Major, continuation shots 1 and 2 (Q12). The Newton iterates of the orange pen are drawn as tall orange spikes, up to ẏ0 = 1.03 at e = 0.05 and over the full height of the close-up near e = 0.4532. They are not mentioned in the notes, and a viewer reads a spike as part of the family. Change: draw each corrector path as one straight segment from the predictor to the member. This segment is vertical for the orange pen and lies on the constraint line for the blue pen, hence the geometry of the slides is kept without the overshoot.

6. Minor, slide 10 against correction shot 1 (Q6, Q9). On slide 10 the speaker says that DXF = [Φ − I, f] has one more column than rows and that the step is of least norm. In the demo, x0 is fixed on the axis, and with half-period targeting y and ẋ at T/2 are solved for ẏ0 and T/2, a square 2 by 2 system. Over a full period, 4 rows are solved for 3 unknowns in least squares (`Targeting.node0_free` and `_evaluate` in `corrector.py`). Change: add to Step 5, "In the demo I fix x on the axis and fly half a period, so F is only y and ẋ there, two equations in ẏ0 and T."

7. Minor, correction shot 5 (Q12). The race curves are gray and not labeled, like the tolerance line, and the S = 16 point lies on that line. Hence "two segments converge where four fail" cannot be read from the panel. Change: cut the sentence, or else label each curve with its S.

8. Minor, continuation shot 1, slide 12 (Q3, Q6). The red dots on the Lyapunov family at C = 2.979, 2.967, 2.954, 2.942, and 2.929 mark failed attempts, which the orange pen retries at half the step and passes. On slide 13 red means that a pen died, hence one color carries two meanings. I also could not tell whether these dots mark a diverged corrector or a member rejected under `MAX_JUMP = 0.5` in `build.py`. Change: make every failed attempt a short flash, as in finding 2, and keep a persistent red marker only for a stopped pen.

9. Minor, slides 10 to 13 (Q10, Q11). None of the 112 sentences of the notes runs over 40 words, but the four slides run to 1967 words, about 15 min spoken. Setup paragraphs that are not spoken sit between steps, e.g. between Steps 5 and 6 of slide 10. Change: move them to the top of the notes of each slide, and replace the passive "You see it closed in seven iterates" with "I close it in seven iterates".

10. Note, slides 10 and 13 against both scenes (Q3, Q9). The tangent τ_j is highlighted in violet on slide 13 but drawn in white in the demo, and the column f is highlighted in orange on slide 10, two slides before orange becomes the natural-parameter pen. Change: draw the current tangent in violet in the demo, and give the highlight of f on slide 10 `data-tone="violet"`.

## Numbers I checked

- I solved the L1 Lyapunov orbit of period 2π at μ = 0.012155 with my own SciPy script, `check_lyapunov.py` in this folder. It starts at x0 = 0.668849 with ẏ0 = 0.708263 at C = 2.923074, which matches `C_END` in `build.py`. Its closest approach to the center of the Moon is 0.020662 DU, i.e. 7942 km with a DU of 384400 km, so "about 8000 km" holds. Its largest Floquet multiplier is 109.3, so "about a hundredfold per revolution" holds as well.
- I also checked the pulsation factors at e = 0.3, the ratios of ‖F‖ in shot 2, the exponent ratios 1.83 and 1.86, the gap of 1.1 × 10⁻⁵ between the two fold values, the 13 Lyapunov members with five red dots, and the iteration counts of S = 8 and S = 16. Every value agrees with the notes and the stills.

## The three changes that would raise the score most

1. Cut the red bar between the velocity sticks everywhere and the sticks when S > 1, and introduce the white V and the red gap in slide 10, Step 5 (finding 1).
2. On slide 13, animate only the blue pen over a dimmed, finished orange record with one stop marker, and let failed attempts flash rather than persist (findings 2 and 8).
3. Thin slide 11 by moving family 11 and the negative period to a backup slide, and cut the plasma and viridis colormaps (findings 3 and 4).

## What I could not check

- I judged from the stills, not from live playback, so the feel of the timing is inferred.
- I could not tell diverged correctors from rejections under `MAX_JUMP` without running `build.py`.
- I did not verify the fold at e = 0.453865 or the agreement with DyLAN, because the seed in `data/`, `CHECKS.md`, and `check_dylan.py` were outside what I could read.
- I could not check the legibility of the thin lines on a projector.
