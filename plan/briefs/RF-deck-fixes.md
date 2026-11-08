# RF: the fixes of the deck review

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/COMMON.md` first, then `plan/briefs/F-deck.md`, under which the deck was written, and the first section of `plan/thesis-style-guide.md`. You apply the accepted findings of three read-only reviews of the deck `index.html` in `/Users/claudiovestini/git/talks/bifurcation-tracking`, whose reports are in `plan/judges/deck/`. The id of the orchestrating session is on the next line.
43f4a815-2ba7-4fb6-93d4-d702ed7aaee4

## The deck

Ten lines of index.html are over 3000 characters long, and they are the base64 scenes and data of the tycho viewers. Read the output of `awk 'length <= 3000' index.html` (80 KB) and never the whole file, and edit the file with targeted replacements that leave these lines untouched. Find each slide by its comment of the form `<!-- N, title -->`. The theme shows the last fragment of a slide alone and then restores every fragment at one more step, hence each slide with fragments ends in a restore step.

## What to apply

In each report the findings are listed by slide, with the exact replacement text. Apply every finding of a report unless it is listed below as rejected or changed, and keep to the replacement text of the report, apart from the edits below. Where two reports change the same sentence, merge the two changes, and where they conflict, follow the decision below. Read the whole report before editing, since a later finding may refine an earlier one.

### R1, `plan/judges/deck/r1-language.md`

Apply all 33 findings, with these notes.

- Finding 21: do not write "region 6, EH⁺" into the notes of slide 15 unseen. Open the readout of the stability demo on slide 15 at its step 4, on the PDF page or the check PNG, and write the region and the label shown there.
- Finding 28: make the caption changes in `tools/deck/build_sections.py`, rerun the script by the command in its docstring, and check the captions of slide 20 in index.html for the new text. Write the fold as 0.45387 in the script, as on the rest of the deck, since the fold is at e = 0.45386506.
- Finding 30: the file `data/pydylan_calls_dylan.py` is copied onto slide 21 by `tools/deck/build_sections.py` as well, hence change the two comments in the file before the rerun of finding 28.
- Finding 23: the replacement is long for the column of slide 16. After the edit, render the page of this step and shorten the line if it wraps past three lines or overflows.

### R2, `plan/judges/deck/r2-maths.md`

Apply all 27 findings, with these merges and notes.

- Finding 2 is covered by R1's finding 5, whose text you write.
- Finding 4 is covered by R1's finding 9, whose text you write.
- Finding 8: the re-embedding of the scenes is done under the section on the demos below.
- Finding 9 is covered by R1's finding 16, whose text you write.
- Finding 10 and R1's finding 14 change the same line of slide 11. Write "In the ER3BP, the period is fixed at \(2\pi K\), and with \(S = 1\),".
- Finding 12: take the last \(e\) of the orange pen from `demos/corrector/runs.json` as it is when you edit, since the demo is rebuilt with a lower floor on the step, and write this value in the notes of slide 12.
- Finding 17 and R1's finding 20 change the same line of slide 15. Write "with the indices \(k_1\) and \(k_2\) of the two pairs, and the stability coefficients \(a_1 = -(k_1 + k_2)\) and \(a_2 = 2 + k_1 k_2\)."
- Finding 18 and R1's finding 22 change the same line of slide 16. Write "With the period fixed at \(2\pi K\), the Jacobian of the corrector is \(\boldsymbol M - \boldsymbol I\), and".
- Finding 20 is a note without a change.
- Finding 23 and R1's finding 11 change the same sentence of the notes of slide 19. Write "With a pseudo-arclength loop of my own, on DyLAN's propagator, I continue the family around the fold. The continuation built into DyLAN still stops just short of the fold, at e = 0.45386."
- With finding 15 a step is added to slide 13, hence renumber the "Step n" paragraphs of its notes after the split.

### R3, `plan/judges/deck/r3-attention-and-script.md`

Apply all 23 findings, with these notes.

- Finding 1: add the key listener as given, after the reset script at the end of index.html. Then test it in headless Chrome with `launch` from `scripts/chrome.mjs`, as the tests of `test/` do: open the deck, go to slide 7, click inside the viewer, send PageDown, and check with `Reveal.getIndices()` that the deck moved to slide 8. Send ArrowRight after a click on the viewer as well, and check with the same call that the deck stayed on slide 7. Report the two results. Put the script of this check under `/private/tmp/claude-501/rf-deck/`, not in the talk folder.
- Finding 10 and R2's finding 3 change the same comment above slide 7. Write R3's text, after a check of the command for slide 7 in the docstring of `tools/deck/embed_scene.py`: write the clock only as the command sets it.
- Finding 14: the speed menu is mentioned in the notes of slides 12 and 13 because the scenes are played at 0.25×. The demos are being rebuilt, and the orchestrator reviews these lines again after the rebuild, hence make the move given in the finding.
- Finding 16: before writing that the tab 7A shows family 7 in region 1, render the step in Chrome, or trust the readout of the plot in the check PNG of slide 15, and write what is shown.
- Finding 17: the line \(k = 2\) is named in the sentence of step 5 of slide 15, hence keep the two lines in view. Replace `data-plot-show="plus minus 7P 7A 8P 8A"` with `data-plot-show="plus minus" data-plot-tab="11P"`, and move the four family tabs to step 4 by finding 16. Make the cut of the notes given in finding 17.
- Finding 22: write the fourteen closing lines, in the vocabulary of R1: "first guess" for "seed", "fixed" for "pinned", "continue" for "follow" and "trace", and "period-doubling" for "flip". On slide 13 the closing line is "Step 6:" after the split of R2's finding 15. Write every closing line in the first person, as spoken by the speaker.
- Finding 23: make every cut in the list of the finding, and no other cut. The passages remain in the report and in the history of the file, and Claudio restores any of them.

## The demos

The scenes of slides 7 and 10 to 13 are embedded between the marker comments `<!-- tycho-viewer start, ... -->` and `<!-- tycho-viewer end, ... -->` by `tools/deck/embed_scene.py`. Do not edit these blocks and do not run the script, since the demos under `demos/corrector/` are being rebuilt by another agent and the orchestrator re-embeds them afterward. The notes of slides 10 to 13 are yours to edit.

## Verification

Run `npm run check` in the talk folder and fix every problem it reports, then `npm run pdf`. Look at the page of every step you changed on slides 13, 15, 16, and 17 in `slides.pdf`. A page is rendered by `pdftoppm -f N -l N -r 60 -png slides.pdf <prefix>`, and found by its text with `pdftotext -f N -l N slides.pdf -`. Look as well at `check/dark-NN.png` and `check/light-NN.png` of slides 4 to 8 and 10 to 17. On each, look for a line that overflows the column and for a display cut at the edge. Do not run `git commit`, and do not run `cd`.

## The report

Report in under twenty-five lines. Give the findings you applied, by report and number, and the ones you could not apply, with the reason. Give the two results of the key check, the last lines of `npm run check` and `npm run pdf`, the pages you looked at, and any decision you made that the briefs left open.
