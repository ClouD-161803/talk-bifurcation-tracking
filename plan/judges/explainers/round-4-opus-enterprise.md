Overall: 7/10

Verdict: ready with changes. I find all ten of my findings of round 3 fixed, and each shot now carries one idea, but on slides 10 and 13 the spoken words and the picture are out of step, and the text inside the viewer is too small for a room.

## My findings of round 3

None of my ten findings was rejected in RESPONSE-3, and I judged each again on the current shots and slides.

| Round 3 | Status now |
|---|---|
| 1, red bar between the velocity sticks | Fixed, with the sticks drawn only with S = 1. |
| 2, both pens animated together | Fixed. The blue pen is played alone over the dim orange record. |
| 3, slide 11 overloaded | Fixed. Family 11, the negative period, and the line search are in shots for questions. |
| 4, plasma and viridis colormaps | Fixed. I did not find a colormap on either page. |
| 5, tall orange spikes | Fixed. The corrections are drawn straight down. |
| 6, least norm against x₀ fixed | Fixed in slide 10, Step 5. |
| 7, unlabeled race curves | Fixed. Each curve is labeled with its S. |
| 8, one red for two meanings | Fixed. A small red dot is a failed attempt, and a large one is the stop. |
| 9, notes of 1967 words | Fixed, at 943 spoken words, about 7.3 min. |
| 10, tangent white in the demo | Fixed. The tangent is violet in both. |

I accept the rejection of Codex's finding 6 in RESPONSE-3, since the viewer learns on the close-up of slide 12 how to read the close-up of the fold on slide 13.

## Findings

The cap is twelve, and I give nine.

1. Major, slide 10 and correction shot 1 (Q4, Q5, Q12). The slide is loaded with an empty orbit panel, since the clock starts at −2, and the panel is still empty through Steps 0 to 4. In Step 5 the speaker says 125 words about the white node, the white stick, the V, and the red gap. On screen the V is held for about 0.9 s at iterate 0 and 0.3 s later, because the sticks are removed at n + 0.7. The speaker thus names parts that are gone before the sentence ends. I checked this in STORYBOARD.md and the still correction-1-0.69. Change: open the page paused at −0.06, where the arc, the V, and the red gap are drawn, and say the sentences on them over this still before pressing play. Keep the sticks until n + 1 when S = 1. Pause on the converged frame at 7.65 and read "minus 1.7, minus 3.2, minus 5.7, minus 10.7".

2. Major, all shots (Q8, Q11). I measured the labels, the readouts, and the caption at 9 px of ink height on the 1920 by 1080 slide, i.e. a type size of about 13 px, against the smallest size of the deck of 22 px. The tab rows, the caption, and the transport are about 27% of the 880 px height of the viewer, and the chips are copies of their panel titles. From the back of a room I expect the payoff numbers to be unreadable. Change: hide the tab rows until the pointer is over them, cut the repeated chips, give the freed height to the panels, and set all viewer text at 22 px or more.

3. Major, slide 13 and continuation shot 3 (Q5, Q7). The tangent is drawn straight down at 21.4 on the clock, and the end is held from 26.0 to 27.5, about 1.7 s at speed 0.25. Steps 4 and 5, on the zero e component of the tangent, come after Step 3 is spoken in full, when the loop has restarted and the blue pen is back near e = 0. The payoff picture, a vertical tangent at the fold, is thus not on screen while the speaker names it. Change: click fragment 4 when the tangent points straight down, near 21.4, and hold the end for 4 s or more, or play the loop once.

4. Major, slide 11 and correction shot 3a (Q3, Q7). In Step 0 the speaker says "at the white nodes", but at load I sampled all sixteen nodes at gray (92, 92, 92). The notes call the defects "red gaps", while they are drawn as red rings around the nodes. The contrast with shot 2, where one arc over the full period missed by most of the orbit, is not said, although it is the reason for the slide. Change: replace the last two sentences of Step 0 with "On the last slide one arc over the full period missed by most of the orbit, from a guess off by a tenth of a percent. Here the guess is off by five percent, and each of the sixteen short arcs misses its next node by less than its red ring." Write "gray nodes", or draw the nodes white.

5. Minor, slides 10 and 11 (Q4). On the main line I read "step fraction α = 1" in the caption, and the speaker names α only in shot 6, which is for questions. An unnamed symbol is a distraction from the readout of ‖F‖. Change: show α only under the line search.

6. Minor, slide 13 and continuation shot 3 (Q12). From 17.95 to 19.69 the small red dot of a failed blue attempt is drawn about 10 px from the large red dot of the orange stop. Two reds of two meanings are thus side by side while the viewer counts halvings. Change: on the tab "both", draw the orange stop as a larger dim orange dot with a ring.

7. Note, slide 13 (Q3). The violet tangent is drawn over the blue predictor, and at 16.20 I sampled their blend as a lavender (144, 112, 224) against the magenta (192, 64, 224) of other frames. Change: draw the predictor as one violet segment of the length of the step, and drop the blue predictor line.

8. Note, slide 12 (Q9). The bold x₀ of slide 10 is the initial state, and the italic x₀ of slide 12 is one of its components, and the speaker says "x nought" for both. Change in Step 3: "I plot the launch position x₀, where the orbit crosses the axis, against C, over the gray family curve, and I press play."

9. Note, slide 11 (Q3). In Step 1 the speaker scales "the guess" by 5%, and in Step 5 introduces "a first guess" as the linearized flow or Richardson's expansion, while the tabs labeled "first guess" select ε. Change in Step 5: "To build the guess that I scale, I take the flow linearized at 𝓛₁, or Richardson's third-order expansion for a halo orbit."

## Numbers I checked

I wrote a planar ER3BP at μ = 0.5 with its variational equations, in `check_fold.py` and `refine_fold.py` in my folder, integrated with DOP853 at a relative tolerance of 10⁻¹¹. I targeted y = ẋ = 0 at the true anomaly π and continued the family in pseudo-arclength.

| Quantity | Storyboard | Mine |
|---|---|---|
| Circular member, ẏ₀ | 0.828 | 0.828327, at x₀ = −0.070848 |
| Fold, e | 0.453865 | 0.4538651 |
| Fold, ẏ₀ | 1.1411 | 1.141055 |
| Second branch at e = 0.398, ẏ₀ | 1.0844 | 1.084440 |
| Orange stop, short of the fold | about 10⁻⁵ | 1.1 × 10⁻⁵ |

From the captions of correction-1 I computed the ratios of successive exponents of ‖F‖ from iterate 3 to 6 as 1.86, 1.80, and 1.87, which supports "nearly doubles". I also confirmed the growth of ‖F‖ from 0.95 to 1.9 in shot 2, the race (S = 1, 2, and 4 fail at n = 1, 2, and 4, and S = 8 converges in nine), and the 14 and 9 halvings. My round-3 checks of the Lyapunov orbit still hold.

## The three changes that would raise the score most

1. Put the speech in step with the picture. Open slide 10 paused on the frame with the V, pause on the converged frame, and click fragment 4 of slide 13 when the tangent points straight down (findings 1 and 3).
2. Hide the tab rows, cut the repeated chips, and set the viewer text at 22 px or more (finding 2).
3. On slide 11 say "red rings" and "gray nodes", and say the contrast with the failed full-period arc of slide 10 (finding 4).

## What I could not check

1. The timing of live playback, since I judged from stills and from the phases of the storyboard.
2. Whether the embed can open at a given clock value, hold the end, or play once.
3. The legibility of the viewer text on the projector.
4. Whether reveal.js takes the key 0 or the space bar before the viewer does.
5. The agreement with DyLAN, since I did not read `CHECKS.md`.
6. The stop at 0.453854 under the rules of the orange pen, since I continued in pseudo-arclength only.
