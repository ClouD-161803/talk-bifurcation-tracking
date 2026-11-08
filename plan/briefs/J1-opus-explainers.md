# J1: judge the correction and continuation scenes as explainers

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/COMMON.md` and then `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/JUDGE-COMMON.md`, which gives the standard and the shape of your report. Your checkout is the talk folder, `/Users/claudiovestini/git/talks/bifurcation-tracking`, on the branch `main`. Two other agents work in the folder at the same time: G2 edits `index.html`, and S writes screenshots into `demos/corrector/shots/`. Write only your report, at `plan/judges/round-1/opus.md`, and any script you need under `/private/tmp/claude-501/judge-opus/`.

The id of the orchestrating session is on the next line, to be copied into your report.
43f4a815-2ba7-4fb6-93d4-d702ed7aaee4

## The material

- `demos/corrector/STORYBOARD.md`, the storyboard of both scenes, and `demos/corrector/README.md`.
- `demos/corrector/correction.html` and `demos/corrector/continuation.html`, the two pages. Open each in headless Chrome with `launch` from `scripts/chrome.mjs`, as `demos/stability/shots.mjs` does for a deck, set the controls of a shot, and screenshot the clock at the values you need. The keys of the viewer are listed in `/Users/claudiovestini/git/tycho/code/docs/guide/panels.md`. If S has written `demos/corrector/shots/INDEX.md` by the time you need the screenshots, you may use its PNGs instead.
- `demos/corrector/corrector.py` and `demos/corrector/build.py`, the corrector and the builder of the scenes, for a claim you want to check against the computation, and `demos/corrector/CHECKS.md`, E2's check of every orbit against the group's library.
- The slides on which the scenes are played: slides 10 to 13 of `index.html`, between the comments `<!-- 10,` and `<!-- 14,`. Their fragments and notes were written before the scenes existed, hence a mismatch between a slide and the storyboard is a finding.
- The outline of the talk, `plan/outlines.md`, and the brief E2 worked from, `plan/briefs/E2-corrector-and-continuation-scenes.md`, which tell you what was asked.

## What to add to the standard

Beyond the eight questions of the standard, judge two more things. First, whether the maths in the storyboard and on the slides is in the notation of the deck, i.e. the same symbols for the constraint vector, the state transition matrix, the tangent, and the step. Say as well whether each symbol is defined before it is used. Second, whether the speaker's lines are written as the speaker would say them, in sentences of at most 40 words, in the first person, with every term defined at its first use.

## The report

Write `plan/judges/round-1/opus.md` by the shape in the standard. Report in chat in under ten lines: the verdict, the number of findings per severity, and what you could not check.
