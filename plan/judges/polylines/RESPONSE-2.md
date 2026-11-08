# Response to round 2

Four judges scored round 2: Codex sol 9/10, Claude Opus on the Enterprise seat 9/10, GLM 9/10, and Gemini Argon 8/10. Claude Opus on Antigravity was not available, since the quota of that seat was used up again. Below, each finding is answered with what was changed for round 3 or why it was rejected. The findings that several judges made are answered once, with the judges named.

## Accepted and changed

1. The ends of the colormaps reach 3:1 only when opaque, and they are drawn at an opacity of 0.87, hence at 2.52 to 2.63:1 (all four judges). Colormap strands are now drawn opaque, so that the color on the slide is the color of Claudio's figures, and the end of each colormap is moved until it reaches 3:1 as drawn.
   Outcome: colormap strands are drawn at an opacity of 1, and the least contrast of each ramp as drawn is 3.01 to 3.06:1 in both modes, checked at 101 points of each ramp by a test. The ranges are [0.29, 0.85] for viridis and [0.35, 0.85] for plasma in dark mode, and [0, 0.57] and [0, 0.62] in light mode. The implementer measured 3.01:1 and 3.04:1 at the worst strand centers of template slide 12.
2. On deck slide 18, the start points of family 11 jump by about 165 px between its two branches, and the direction of the trace is reversed there (Gemini finding 1). The start of each family was chosen so that consecutive members of the sweep start close together and are traced in the same direction, and this was measured on slides 3, 9, and 18.
   Outcome: families 7 and 8 are begun on a ray at 160° and family 11 at 175°. Between consecutive members, the largest gap of the starts and the largest turn of their initial directions are now 22.1 px and 8.0° on slide 3 (52.4 px and 11.2° before), 9.8 px and 6.4° on slide 9 (21.1 px and 5.7°), and 11.5 px and 2.1° on slide 18 (164.7 px and 167.1°).
3. On the right of deck slide 2, the upper half of the drawing runs ahead during the trace, since the starts are spread evenly in true anomaly rather than along the orbit (GLM finding 3). The scattered starts are now spread along the length of each orbit.
   Outcome: the scattered starts are golden-ratio fractions of the length of each orbit, with the members of `thin=1` first in the sequence. Measured from the pixels, the ratio of the ink above the x axis to the ink below is 0.92, 1.04, and 1.02 at 2, 4, and 6 s on the right of slide 2, against 1.39, 1.52, and 1.21 before from the data.
4. The woven bands of deck slide 2, where many members converge, read as moiré (Codex finding 2). Under Claudio's steer to cut heavy strands, both frames of slide 2 now draw every other member, as the section slides do.
   Outcome: slide 2 draws 27 members at the left and 33 at the right, against 56 and 72 in round 2, all traced at once in 9 s.
5. Both frames of deck slide 2 run off the outer edges of the slide, although each would fit whole in its box (Opus finding 2). Each frame was given a window in which its drawing fits whole.
   Outcome: the left frame has the window (1.445, 0) with a half height of 2.88, and the right one (−0.124, 0) with 2.66. Each drawing clears its box by at least 40 px, and the two drawings are 95 px apart across x = 960.
6. Four body dots of two mass ratios are drawn without a label on the left of deck slide 2 and on template slide 12 (Opus finding 3, Gemini finding 4). A backdrop whose chosen records do not agree on the positions of the bodies now draws none of them.
   Outcome: the bodies are drawn only when every chosen record places them at the same positions within 1e-4, hence neither the left of slide 2 nor template slide 12 draws any.
7. On template slide 18, the plot is empty for a moment at the restart of its loop, and a dim segment of the split path is on screen before the split (Codex finding 3, GLM's second nit). The fade out of the old loop now overlaps the fade in of the new one, and the split path is shown only from the split on.
   Outcome: at the restart, a copy of the last frame is faded out while the new loop is faded in, hence data stays on screen throughout. The faint split path on the real axis ends at −1 until the split, at frame 197 of L1 and 190 of L2. Both tabs were checked in captures.

## Rejected

1. Narrow the heading and the caption of deck slide 2 to the left frame, and set a halo behind them (Gemini finding 2). Slide 2 is a figure plate, on which the drawing fills the slide behind the heading and the caption by design. There is no gutter between the two frames: they are one plate. A scrim or a halo behind the text of a figure plate is a change of the theme beyond this brief, and it is listed for Claudio as in round 1.
2. The open ends of the members in flight are lined up on a ray about the secondary on the section slides (Opus finding 4). Opus reads this line as the front of a sweep rather than a seam, and scattered starts left the tips at unrelated places in the live comparison of round 2.
3. The last member of a section slide spends 1.35 to 1.90 s off the slide (Gemini finding 5). Its loop runs off the slide at an outer edge, which the theme allows, and the time off the slide is part of its even pace.
4. Only the tab L1 of template slide 18 was checked by eye (Opus finding 5). GLM measured the times of both tabs, and the profile of L2 matches that of L1 after its axial crossing at 5.65 s.
