# J1, round 2: judge the correction and continuation scenes as explainers

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/COMMON.md` and then `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/JUDGE-COMMON.md`, which gives the standard and the shape of your report. Your checkout is the talk folder, `/Users/claudiovestini/git/talks/bifurcation-tracking`, on the branch `main`. Other agents may work in the folder at the same time. Write only your report, at `plan/judges/round-2/opus.md`, and any script you need under `/private/tmp/claude-501/judge-opus-2/`.

The id of the orchestrating session is on the next line, to be copied into your report.
43f4a815-2ba7-4fb6-93d4-d702ed7aaee4

## The material

- `demos/corrector/STORYBOARD.md`, the storyboard of both scenes, and `demos/corrector/README.md`.
- `demos/corrector/correction.html` and `demos/corrector/continuation.html`, the two pages. Open each in headless Chrome with `launch` from `scripts/chrome.mjs`, as `demos/stability/shots.mjs` does for a deck, set the controls of a shot, and screenshot the clock at the values you need. The keys of the viewer are listed in `/Users/claudiovestini/git/tycho/code/docs/guide/panels.md`. If S has written `demos/corrector/shots/INDEX.md` by the time you need the screenshots, you may use its PNGs instead.
- `demos/corrector/corrector.py` and `demos/corrector/build.py`, the corrector and the builder of the scenes, for a claim you want to check against the computation, and `demos/corrector/CHECKS.md`, E2's check of every orbit against the group's library.
- The slides on which the scenes are played: slides 10 to 13 of `index.html`, between the comments `<!-- 10,` and `<!-- 14,`. The scenes are now embedded on them, hence judge the scenes inside the deck as well, in both modes, and a mismatch between a slide and the storyboard is a finding.
- The outline of the talk, `plan/outlines.md`, and the brief E2 worked from, `plan/briefs/E2-corrector-and-continuation-scenes.md`, which tell you what was asked.

## What to add to the standard

Beyond the eight questions of the standard, judge two more things. First, whether the maths in the storyboard and on the slides is in the notation of the deck, i.e. the same symbols for the constraint vector, the state transition matrix, the tangent, and the step. Say as well whether each symbol is defined before it is used. Second, whether the speaker's lines are written as the speaker would say them, in sentences of at most 40 words, in the first person, with every term defined at its first use. Third, whether there is too much going on: at the busiest moment of each shot, count the things that move and the things that are visible, i.e. panels, arcs, sticks, crosses, ghosts of earlier iterates, labels, readouts, and controls. Claudio asked for this in these words: make sure there is not too much going on and the viewer is not overwhelmed. Name each shot that overwhelms, and say what to remove, hold still, dim, or move to a later shot, since a cut is preferred to an addition.

## Round 1

This is round 2. The reports of round 1 are `plan/judges/round-1/opus.md`, `opus-j1.md`, and `codex.md`, and the shooter's defects are listed at the end of the index of round 1, which was rewritten. The fixes were made under `plan/briefs/E2b-corrector-round-1-fixes.md`, whose twenty-six decisions name what was changed. Judge the scenes afresh first, with your own eyes, and only then read the reports of round 1 and the decisions. End your report with a short section that says which findings of round 1 remain, by their numbers, and which decisions were not carried out as written.

## The report

Write `plan/judges/round-2/opus.md` by the shape in the standard. Report in chat in under ten lines: the verdict, the number of findings per severity, and what you could not check.
