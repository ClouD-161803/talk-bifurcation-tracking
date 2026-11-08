# S: screenshots of the correction and continuation scenes, shot by shot

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/COMMON.md` first. Your checkout is the talk folder, `/Users/claudiovestini/git/talks/bifurcation-tracking`, on the branch `main`. Write only `demos/corrector/shots.mjs` and the folder `demos/corrector/shots/`. Another agent, G2, edits `index.html` at the same time, and a judge reads `demos/corrector/`. Do not touch any other file, and never run `git add`, `git commit`, `git stash`, or `git checkout`, since the orchestrator stages everything at the end.

The id of the orchestrating session is on the next line, to be copied into your report.
43f4a815-2ba7-4fb6-93d4-d702ed7aaee4

## What is in place

- E2 built two TyCHO pages in `demos/corrector/`: `correction.html` (6.4 MB) and `continuation.html` (1.5 MB). In `STORYBOARD.md` of the same folder E2 describes each scene shot by shot, with the control set before each shot (a tab, a toggle, a zoom) and what moves as the clock runs. Read the storyboard in full before you start.
- Each page is a viewer element with tabs, toggles, and a transport, documented in `/Users/claudiovestini/git/tycho/code/docs/api/javascript.md` and `/Users/claudiovestini/git/tycho/code/docs/guide/panels.md`, whose section on keys gives the keys to play, step, seek, and reset the views. The element is in `/Users/claudiovestini/git/tycho/code/web/src/runtime/element.ts`, with the getters `state` and `playing`, and the store in `state.ts` of the same folder. The clock of both scenes is a value clock, and one loop lasts 8 s at speed 1.
- E3's script `demos/stability/shots.mjs` shows how a page is opened in headless Chrome and screenshotted with `launch` from `scripts/chrome.mjs`. E3's pages were reveal decks, whereas these two pages are standalone, hence the deck helpers do not apply.

## Tasks

1. Write `demos/corrector/shots.mjs`, which opens each page in headless Chrome at 1920 by 1080, sets the controls of each shot of the storyboard, pauses the clock, seeks it to each value of a list, and saves one PNG per value. Name a PNG `shots/correction-<shot>-<value>.png` or `shots/continuation-<shot>-<value>.png`, where the shot is its number in the storyboard and the value is the clock value with two decimals. Set a control by clicking it as a viewer would, or through the store of the element when a click is not reliable, and say in the script which you chose.
2. For the first scene, take the clock at the start, the middle, and the end of the first iterate, of the second, and of the last, and at the end of the loop. The growing arcs, the defects, the ghost, the converged orbit, and the convergence curve are then each seen once. For the second scene, take eight values spread evenly over the loop and the end of the loop. Where a shot of the storyboard sets several controls in turn, e.g. shot 4 with the two systems, take the set for each setting.
3. Write `shots/INDEX.md`, with one line per PNG giving the shot, the controls set, the clock value, and what is seen in one sentence, so that the storyboard can be followed from the PNGs by a reader without the pages.
4. Look at every PNG. Where a PNG shows an empty panel, a control not set, or a clock not at its value, fix the script and take the PNG again. Where a PNG shows something wrong in the scene itself, e.g. a label under a curve, a readout cut off, or a defect drawn away from its arc, write it down for the report. Do not fix the scene, since the scene is judged by others.

Write the comments of the script and the index by the writing rules of COMMON.md.

## Report

Report in under twenty lines: the number of PNGs per scene, how the controls and the clock are set, what you saw wrong in the scenes, and what you could not do.
