# T3: the manifolds demo of tycho, improved, and a video of it for slide 17 of the template

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/TEMPLATE-COMMON.md` first, for the orchestrator, the rules, and the report, although your checkout is a worktree of tycho rather than of the template. You are a sibling thread of the orchestrator, you talk to Claudio directly, and you start with the `grill-me` skill on the decisions below before you build anything. Report to the orchestrator with `t3_thread_send` when your work is committed.

## Claudio's words

> the video on slide 17 is very uninspiring. let's have a better video there, also the background colour of the video should match the background colour of the slide. perhaps we could improve the manifolds tycho demo in a separate thread, then export a video of that. what needs improvement is removal of manifold dots, stretching out of the z axis so everything does not just look planar, and that thread in general should start on grill-me to flag anything else.

He added, on another point, that in a transfer the manifolds are animated first and the spacecraft second, and that the dot at the tip of an orbit stays off for a manifold and on for a spacecraft.

## What is in place

- The manifolds demo of tycho is `examples/manifolds/` of `/Users/claudiovestini/git/tycho/code`, with `compute.py` and `build.py`, which write the page with pytycho. Read `AGENTS.md` of tycho, the README of the example, and the guide pages of `docs/` on panels, cameras, and video export. The runtime has a free-aspect plane camera, with the two axes scaled separately, which is one way to stretch z, and the footer of a viewer has an Export video button.
- On slide 17 of the demo deck of the template, `demo/clip-dark.mp4` and `demo/clip-light.mp4` are shown with their posters, one per mode. They are drawn by `demo/clip.py` of the template: a distant retrograde orbit about the Moon, in six seconds. The background colors of the two modes are the variables at the top of `theme/beeson.css` of the template.
- Your checkout is a worktree of tycho on the branch `t3/manifolds-video`, based on the local `main`.

## The decisions to grill

Settle the facts yourself and put the decisions to Claudio, one question each.

- Which orbit and which manifolds.
- The stretch of z, and whether it is a camera aspect or a scale of the data.
- The removal of the dots (the heads) on the manifolds.
- The order of the animation: the manifolds first, then a spacecraft, if one is shown.
- The camera motion.
- The duration and the loop.
- The two backgrounds.
- The resolution and the frame rate.
- Whether slide 17 should instead embed the page as a live kiosk viewer, with the video kept for the PDF and PowerPoint.

## Deliverables

1. The improved example committed on `t3/manifolds-video` of tycho, with its page rebuilt, and any runtime change it needed made test first by the rules of tycho's `AGENTS.md`.
2. Two videos at 1920 by 1080, one per mode, each with the background color of its mode in the deck, and a poster PNG for each. Write them to a folder named in your report, so that the orchestrator places them on slide 17 of the template. Say how they were exported, so that they can be exported again after a change.
3. The report to the orchestrator: the branch and its commits, the folder of the videos, the commands run with their last lines, and the decisions taken in the interview.
