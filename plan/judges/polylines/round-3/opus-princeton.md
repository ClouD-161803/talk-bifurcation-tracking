Overall: 10/10

I did not find a glitch on any slide in scope, and each of my three reasons for a 9 in round 2 is fixed. I checked each fix with my own measurements, and I also captured the tab L2 of template slide 18, which I had not checked in round 2. The work left is polish beyond the brief, listed at the end.

All paths below are relative to `.council/polylines/`. Files under `evidence/round-3/` are from the shared tour, and files under `round-3/opus-princeton/` are mine. I wrote `tools/geometry.py` to print the extent of each selection on the slide and the largest gap between a polyline and its curve, `tools/hitch.mjs` to time the long frames at a slide change, and `tools/tabl2.mjs` to capture the tab L2. I reused `fps.mjs` of my round-2 folder and `diffseries.py` of my round-1 folder.

## Criteria

| Criterion | Score | Reason |
|---|---|---|
| 1. Smoothness | 10 | I found the largest gap between a polyline and its curve to be 0.13 px on deck slide 18, the most enlarged drawing at 454 px per unit, and 0.29 px at most anywhere, at a cusp reversed over segments of 0.3 px. |
| 2. The trace | 10 | The last frame is identical to the still on every backdrop, each strand is drawn in one color from the trace to the still, the open ends are solid (`evidence/round-3/deck/crops/s2-dark-f008-tipsleft.png`), and I measured 60 frames per second while deck slides 2, 3, and 18 and template slide 12 are traced. |
| 3. Starts and ends | 10 | Deck slide 2 is no longer cut in half, since its starts are scattered over both frames (`evidence/round-3/deck/s2-dark-f002.png`), and every orbit is closed without a notch (`evidence/round-3/deck/crops/s18-light-still-starts.png`). |
| 4. Order and pace | 10 | The members of deck slides 3, 9, and 18 are swept outward and are complete by 8.5 to 9.0 s, deck slide 2 is changed at an even rate, and on both tabs of template slide 18 the pair is slowed into −1 before it is split. |
| 5. Color and weight | 10 | I computed the least contrast of each ramp as drawn at 3.01 to 3.06:1 in both modes, in agreement with the strand centers of the tour, and the ramps in e are right in both modes. |
| 6. Composition | 9 | Both frames of deck slide 2 are now whole inside their boxes, and body dots are not drawn where their positions disagree, but the heading and the caption of deck slide 2 are still set over the left drawing. |
| 7. Match to the reference | 10 | With the palettes of Claudio's second decision set aside, the hairlines, the sequential trace, and the held still are those of `tubes` and of 3Blue1Brown, and the closing reference is also drawn with hairlines under its words. |

## Round-2 findings

| Finding of round 2 | Fixed | The answer in `RESPONSE-2.md` |
|---|---|---|
| 1. Ends of the colormaps below 3:1 | Yes | Holds. From the 17 stops of `COLORMAPS` in `src/strands.ts`, at 101 points of each ramp drawn opaque, I computed a least contrast of 3.01:1 for viridis in dark mode (#365d8c at 0.29), 3.05:1 in light mode (#20a187 at 0.57), 3.06:1 for plasma in dark mode (#a11c9b at 0.35), and 3.01:1 in light mode (#e56a5d at 0.62). One step of 0.01 further, I computed 2.92 to 2.98:1, hence each end is the last that keeps 3:1. I found these values within 0.03 of the strand centers in `evidence/round-3/INDEX.md`. |
| 2. Both frames of deck slide 2 cut at the outer edges | Yes | Holds. I found the left drawing within x 54 to 906 px and y 40 to 1040 px, and the right one within x 1001 to 1879 px and y 345 to 735 px. Each is at least 40 px inside its box, and the two are 93 px apart rather than the 95 px of the response (`evidence/round-3/deck/crops/s2-dark-still-gap.png`). |
| 3. Four body dots of two mass ratios without a label | Yes | Holds. Neither frame of deck slide 2 nor template slide 12 is drawn with a body. Deck slide 3 is drawn with the Earth and the Moon, and deck slide 9 with two equal bodies. Deck slide 18 is drawn with one body at (1378, 540), since I mapped the other body of μ = 0.5 to x ≈ 924 px, left of the box. |
| 4. Open ends lined up on one ray on the section slides | Not changed, as I recommended | The rejection holds. The members are begun on a ray at 160° or 175°, and the open ends in flight are staggered along the bend (`evidence/round-3/deck/crops/s3-dark-f009-tips.png` and `s9-dark-f009-tips.png`). They are read as the front of a sweep. |
| 5. The tab L2 of template slide 18 not checked | Yes, now checked | Holds. I captured the slide with its three steps shown (`round-3/opus-princeton/crops/l2-dark-c000-c043.png`). The pair is back on the circle at +1 by 6.0 s, slowed from 11.0 s, and met at −1 at 13.0 s. It is split onto the real axis at 14.0 s and held from 14.5 to 18.0 s, and the loop is restarted at 18.5 s with only a faint copy of the old dot in the cross-fade. |

## Findings

1. Nit, deck slide 2, both modes. The heading and the caption are set over the left drawing. In my crops `round-3/opus-princeton/crops/s2-light-still-heading-2x.png` and `s2-light-still-caption-2x.png`, I counted four hairlines across the heading and about six across the first line of the caption. In light mode, the darkest strands are drawn at #440154, i.e. 14.4:1, about as dark as the text. Both are legible, and the strands across the caption are far fewer than in round 2 (`round-2/opus-princeton/crops/s2-light-still-caption-2x.png`). Slide 2 is a figure plate, and I could not find a window that clears the caption without shrinking the drawing by about half. I agree with the rejection of a scrim and recommend no change within the brief.

2. Nit, deck slides 3, 9, and 18, both modes. The outermost member of each section slide runs far off the slide, to x 2247, 2197, and 2241 px. At the end of each sweep, a line is thus traced off the top of the slide and back in at the bottom about 1.5 s later. I counted 3,102 to 3,842 changed pixels per half second at the peak, and 445 to 866 at 8.5 or 9.0 s, before the trace stops. The end of the drawing is therefore a taper rather than a stall, and the cut at the edge of the slide is allowed by the theme. If Claudio wants a crisper end, the members above about e = 0.8 could be left out on slides 3 and 18, so that each sweep ends on a member drawn whole on screen.

3. Nit, deck slides 9 and 18, dark mode. I found a single long frame 18 to 28 ms after the slide change. On a jump from slide 1, I measured 50 ms on slide 9 and 100 ms on slide 18. On a step from the slide before, as in a talk, I measured 33 ms on slide 9 and none on slide 18. I did not find a long frame on slides 2 and 3. The frame is in the transition, before any strand is visible, and I recommend no change.

## The three changes I would make next

My score cannot be raised further. The changes below are the polish I would make next, in order.

1. Leave out the members above about e = 0.8 on deck slides 3 and 18, so that each sweep ends on a member drawn whole on screen.
2. Name the two frames of deck slide 2 in its caption, e.g. "in the rotating-pulsating frame at left and the barycentric inertial frame at right", since a viewer now learns them only from the speaker.
3. Prepare the strands of a backdrop while the slide before it is shown, so that the change to deck slides 9 and 18 is made without a long frame.
