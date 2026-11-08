# J2: judge the correction and continuation scenes as explainers

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/JUDGE-COMMON.md` first, which gives the standard and the shape of your report. You work in the folder `/Users/claudiovestini/git/talks/bifurcation-tracking`. Read only the files listed below, write only your report at the path given in your task, and put any script you need under `/private/tmp/claude-501/judge-<your name>/`. Other agents edit other files of the folder at the same time, hence do not touch anything else, and do not run a git command that changes the state of the checkout.

## The material

- `demos/corrector/STORYBOARD.md`, the storyboard of both scenes, in which each scene is described shot by shot, with what moves, what the speaker says, and which control the speaker sets.
- `demos/corrector/shots/INDEX.md` and the PNGs of the same folder, one per shot and clock value, taken from the two pages by another agent.
- `demos/corrector/correction.html` and `demos/corrector/continuation.html`, the two pages, which you may open in a browser if you have one, or in headless Chrome with the puppeteer of `node_modules/` of the folder, at 1920 by 1080. A page is opened paused, the space key plays it, and the tabs and toggles above the panels set the case. Judge from the PNGs when you cannot open a page.

The maths of both scenes is in the storyboard, under "Conventions of both scenes" and at the start of each scene. The equations of motion are those of the planar circular and elliptic restricted three-body problems in the rotating frame, which in the elliptic problem pulsates with the distance of the primaries and takes the true anomaly as its independent variable. Check a number by your own derivation where you can.

## The report

Write the report by the shape in the standard, at the path given in your task. Report in chat in under ten lines: the verdict, the number of findings per severity, and what you could not check.
