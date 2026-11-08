# Round 5, judge deepseek

Overall: 8/10

Ready with changes. Both scenes now show one idea per shot and end on a true payoff, but the faint white line that carries the whole argument of slide 13 is named and never defined, and the fold, the frame the talk turns on, asks the presenter to hit pause inside a 2.3 s window.

I checked the numbers of slide 10 with `corrector.py` (`check_numbers.py` here). The run gives log₁₀‖F‖ = −0.234, −0.995, −1.681, −1.709, −3.179, −5.715, −10.674 and −12.362 at n = 0 to 7, which reproduces the caption of `shots/INDEX.md` to four digits, and the largest eigenvalue of the full-period monodromy matrix is 109.3. Thus both spoken claims of slide 10 hold, the hundredfold amplification and the doubling of the exponent, with the ratios 1.86, 1.80 and 1.87. The premise of slide 12 holds too, since at a fold in e the tangent has no e component.

Below are twelve findings, which is the cap of the rubric, so a finding I dropped is still visible as absent.

## Findings

1. Major, slide 13, shots 3 and 4. The viewer sees a thin pale line crossing the violet tangent at the predicted point, and hears "correct along the faint white constraint line across it". White already means the nodes and the sticks of slides 10 and 11 and the outline of the close-up box, and gray, the dim orange record and this line are three thin pale strokes on one dark ground. This line is the one new idea of the slide and nothing says it is perpendicular to the tangent. Evidence: Step 3 of the notes; `STORYBOARD.md` 80 calls it the normal through the predicted point and the notes never do; `build.py` 1466 draws it white at an opacity of 0.4. Change: say "The faint white line is the line across the tangent, on which I look for the new member," and draw it in violet at an opacity of 0.4, so that the tangent and its normal read as one object.

2. Major, slide 13, the loaded frame and Step 2. From the first frame the diagram holds the dim orange record ending in a larger dim red dot, and at the fold that dot sits beside the bright red dot of a failed blue attempt (`shots/INDEX.md`, `continuation-3-15.31`). No line names the larger dot, since Step 2 names only "the dim orange dots". At the frame the talk is built around, red means both "this pen is dead" and "this step failed, so halve it", which is the confusion Claudio reported in his own words. Change, a cut: do not draw the stop dot on the tab "both", so the record ends where the orange pen stopped, and add to Step 2 "The orange dots stop at the fold, where the orange pen died."

3. Major, slide 13, Step 3. The hold runs from 17.90 to 19.90 of the clock, i.e. 2.3 s at speed 0.25, since 27.76 units are played in 32 s. The notes ask for a click on pause inside those 2.3 s while he speaks, and the recovery is a drag of the slider to within 4% of the bar (`build.py` 134, notes of slide 13). A late click costs a rewind in front of the room at the payoff of the scene. Change: `FOLD_HOLD` from 2.0 to 4.5, i.e. 5.2 s, with the time taken from the attempts before the pen enters the close-up.

4. Major, slides 10 to 13. The caption of the viewer is about 13 px and the labels of the race cap at 10 px (`build.py`, `LABEL_HEIGHT`), inside a viewer 730 by 880 px on a slide of 1920 by 1080 whose body text is 48 px. The numbers carry the payoff of scene 1, which the notes point at on screen, and the mechanism of scene 2, the halving count. The audience reads neither, so the payoff arrives only in speech. Change, a cut: reduce the caption of scene 1 to the one readout log₁₀‖F‖, since no line of slides 10 and 11 names the iterate or α, and draw it at 24 px or more. If the runtime fixes the size, widen the viewer from 730 to 880 px.

5. Major, slide 13, clock 9.6 to 22.4. Inside the close-up each step is shorter than a pixel in the diagram, so the marks are drawn in the close-up alone and the diagram is held still. The pen thus appears to stop in the diagram and continues in a panel nothing has pointed at since slide 12, and the box that should link them is under 2 px wide on family 11 and unseen (`shots/INDEX.md` 287). Change: add to Step 3 "In the diagram a step is now shorter than a pixel, so I watch the close-up at the top right," and draw the box at a minimum of 10 by 10 px, dashed.

6. Minor, slide 13, Step 4. The hold is at the member whose tangent is closest to vertical, 6.2° at the medium step (`build.py` 1254 to 1286, `STORYBOARD.md` 76), so the frame shown while he says "At the fold the e component of the tangent is zero" carries a visibly tilted tangent. Change: "At the member nearest the fold the tangent is 6 degrees from vertical, and at the fold itself the e component is zero."

7. Minor, slide 12, shots 1 and 2. The red dot of a failed step is on screen from its failure until the next attempt starts, about 1 s at speed 0.25 in the diagram and 0.4 s in the close-up (`shots/INDEX.md` 288). The notes say "A red dot is a failed step, which I halve", and the dot is gone before the eye arrives, though the halving is the mechanism of the slide. Change: keep each failed dot of the natural pen until that pen's next member, about 2.5 to 4.5 s.

8. Minor, slide 12, shot 1. The members at 11.85, 15.35, 18.80, 22.30 and 25.75 stand at 2.9915, 2.9790, 2.9665, 2.9540 and 2.9415, steps of 0.0125 against the tab step of 0.025, and the caption reads "halvings of its step: 0" at every one. The count is taken from the first step of the pen rather than the tab step (`build.py` 1365), so a viewer who hears "which I halve" reads zero. My own value is 1. Change: take that reference from `NATURAL_STEPS` and tick the count on the attempt that is halved.

9. Minor, slide 10, iterate 1. One unit of the clock is 1.16 s at speed 0.5, and the four phases of an iterate take 0.45, 0.15, 0.0 and 0.30 of it. The iterate that teaches how to read the panel is over before the eye finds the red gap. Change: give iterate 1 two units, 2.3 s, taken from the 3.8 units during which the converged orbit glows at the end.

10. Minor, slide 10, Step 5. The first guess is the converged orbit scaled by 0.1%, which only the tab says. A viewer may think the demo found the orbit from nothing. Change: open Step 5 with "My first guess is the orbit I already have, scaled by 0.1%."

11. Minor, slide 12, Step 3. "With the orange pen I step C sideways" is the first use of "pen", and no line says what a pen is. Change: "With the orange pen, the dot that walks along the family, I step C sideways".

12. Note, slides 10 to 13. The slides carry `data-viewer-speed` and a script at the end of the extract sets it, while the Control column of `STORYBOARD.md` and the README still tell him to set the speed in the menu. Nothing breaks, but a presenter who follows the Control column may set the wrong speed on slide 10. Change: delete the speed from the Control column and from the README.

## The three changes that would raise the score most

1. Make the white line an object: say it is the line across the tangent on which the new member is looked for, and draw it in violet.
2. Leave one red at the fold: cut the dim stop dot of the orange record on the tab "both".
3. Make the fold still: lengthen the hold to 4.5 units, a 5 s window instead of 2.3 s.

## What I could not check

- The fold at e = 0.453865 and ẏ0 = 1.1411, the 5000-fold amplification of family 11, the period of −59.7 and the 14 halvings, since the seed of family 11 lies outside my evidence.
- The tilts of the held tangent, and the clock values of the hold at the small and the large step.
- What the PNGs show, since I judged from the transcript of `shots/INDEX.md` alone, as my task asks.
- Whether the TyCHO runtime lets a scene set the size of a caption or a label.
