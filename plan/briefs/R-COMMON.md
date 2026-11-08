# Common brief of the deck review

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/COMMON.md` first, for the talk, the plan files, and the rules. You are one of three reviewers of the deck `index.html` in `/Users/claudiovestini/git/talks/bifurcation-tracking`, each with one lens, and an implementer applies the accepted findings after you. The id of the orchestrating session is on the next line, to be copied into your report.
43f4a815-2ba7-4fb6-93d4-d702ed7aaee4

## The deck

The deck was written under `plan/briefs/F-deck.md`, which states the requirements: the slide list, the maths on every step in the style of `plan/thesis-style-guide.md`, the speaker notes as a script with one "Step n:" paragraph per fragment, and the language rules. Read F-deck.md and the first section of the style guide before the deck. The deck has 25 slides and 113 steps. The theme shows the last fragment of a slide alone and then restores every fragment at one more step. This final step of each slide with fragments is not covered by the notes yet.

Read the deck without its embedded data. Ten lines of index.html are over 3000 characters long, and they are the base64 scenes and data of the tycho viewers, hence read the output of `awk 'length <= 3000' index.html` (80 KB) and never the whole file. Find each slide by its comment of the form `<!-- N, title -->`. The screenshot of every slide at its last step is in `check/dark-NN.png` and `check/light-NN.png`, and `slides.pdf` has one page per step (113 pages), of which `pdftoppm -f N -l N -r 60 -png slides.pdf <prefix>` renders one. Do not run `npm run check` or `npm run pdf`, since they rewrite these files while other agents read them.

## Rules

- Stay read-only in the talk folder. Write only your report, at the path given in your brief, and put any script or rendered page under `/private/tmp/claude-501/review-<your lens>/`. Other agents edit the folder at the same time, and the demos under `demos/corrector/` are being rebuilt, hence the notes of slides 10 to 13 may change in what they say about the controls of the demo. Review their text as it is.
- Do not run a git command that changes the state of the checkout, and do not run `cd`.
- You are an Anthropic model, hence you may read every file of the folder, but copy no DyLAN source into your report.

## The report

Write the report as Markdown, in under 2500 words, at the path given in your brief. Open with one sentence of verdict: ready, ready with changes, or not ready. Then list the findings by slide, numbered through the report and ordered within a slide by step. Give each finding a severity (blocker, major, minor, or note), the slide and the step, what is there (quoted), why it hurts, and the change. Write the change as the exact replacement text, so that an implementer can apply it without judgment. A finding on wording gives the replacement sentence in full. Close with a list of what you could not check. Report in chat in under ten lines: the verdict, the number of findings per severity, and what you could not check.
