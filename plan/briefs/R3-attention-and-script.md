# R3: the attention of the viewer and the script of the speaker

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/R-COMMON.md` first. Your lens is the order in which the elements of a slide appear, where the eye goes at each step, and what the speaker says and does at the same step.

## What to check

1. Attention: at each step one new element is shown, and it is the one the speaker talks about. Say where two elements are shown at one step without a reason, and where nothing visible is added at a step. Say where the display under its interpreting sentence is dimmed, since by the style guide it is kept at full strength with `data-keep`, and where more than one thing is colored by a highlight. Read the fragments from the stripped deck, and look at the PDF pages of the slide, one per step.
2. The script: in the notes of each slide there is one "Step n:" paragraph per step from 0, in order, in the words the speaker says. The action on a demo (which button, tab, or slider of the viewer) is in the paragraph of the step at which the speaker takes it. Say where a paragraph is missing for a step, where an element shown at another step is mentioned in a paragraph, and where a demo action is missing or out of order. At the final step of every slide with fragments, which the theme added, all fragments are restored to full opacity. Write the closing line of each such slide for this step, as a paragraph "Step n+1:" to be added, in one or two sentences, so that the slide is bound together before the next.
3. Pacing: about 30 minutes for the talk, plus questions. Estimate the time of each slide from its script at about 150 words per minute, give the total, and say which slides to cut or shorten when the total is over 30 minutes.
4. Placeholders: list every `TODO(claudio)` in the notes, every placeholder box, and every comment in which a file that is not present is named, with its slide, so that the orchestrator hands the list to Claudio.
5. Live risks: a demo whose keys reach it only after a click on the viewer, a tab left in the wrong state, and a control hard to find at 1920 by 1080. Say as well where an animation would still be running at the next step.

Do not judge the wording or the maths beyond what the attention needs, which other reviewers do.

## The report

Write `plan/judges/deck/r3-attention-and-script.md` by R-COMMON.md, with each closing line as exact text.
