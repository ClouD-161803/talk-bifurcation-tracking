# The standard of a judge of the explainer scenes

You judge two explainer scenes of a talk on tracking the bifurcations of families of periodic orbits in the three-body problem. The speaker gives the talk on Monday to a group of PhD students in astrodynamics, and each scene is played on a slide while the speaker talks over it. The scenes are meant to explain as the videos of 3Blue1Brown do. One idea is shown at a time, and the eye is led by motion to the thing being explained. Every color and shape is given one meaning, the picture is shown before the symbol, and each scene is ended in a payoff the audience remembers.

The first scene, `correction.html`, explains differential correction and multiple shooting. The second, `continuation.html`, explains natural-parameter and pseudo-arclength continuation and why only the second passes a fold of the family. In the storyboard, `STORYBOARD.md`, each scene is described shot by shot, with what moves, what the speaker says, and which control the speaker sets. The lines of the speaker in it become the speaker notes of the talk.

## What to judge

Go through the storyboard shot by shot, with the scene or its screenshots beside you, and ask these eight questions of each shot.

1. Is there one new idea in the shot, and is it the thing in motion?
2. Is the eye led? Say whether anything else moves or glows at the same time, and whether what was explained before is dimmed to context.
3. Does each color and shape have one meaning, said once, and does the speaker name what is on the screen in the words the screen uses?
4. Does the picture come before the symbol, and is each symbol defined when it is first said?
5. Is the pacing readable, i.e. can a viewer follow one Newton iterate in 0.7 s, one loop of the first scene in 8 s, and the second scene at a quarter of its speed?
6. Is each claim true, and is each number right? Check a number by your own derivation where you can, and say which you could not check.
7. Is the payoff there? In the first scene the exponent of the error nearly doubles at each iterate once the iterate is close, and in the second the orange pen dies at the fold while the blue pen turns.
8. What could go wrong live, e.g. a control hard to find, a zoom to undo, a tab left in the wrong state, or a page to reload?

In a useful finding, the shot is named, what the viewer sees or hears is said, and why it hurts the explanation is said. One concrete change is then given: what to draw, move, remove, slow down, or say instead. A finding on wording gives the replacement sentence. A finding on a number gives your own value and how you got it.

## The report

Write the report to the path given in your task, as Markdown, in under 1500 words. Open with one sentence of verdict: ready, ready with changes, or not ready. Then give at most twelve findings, numbered and ordered from the most severe, each with a severity (blocker, major, minor, or note), the shot, what the viewer sees or hears, why it hurts, and the change. Say that the cap is twelve, so that a dropped finding is still visible. Close with a list of what you could not check.

Write nothing but this report. Do not edit the scenes, the storyboard, or any other file, and do not run a git command that changes the state of the checkout.
