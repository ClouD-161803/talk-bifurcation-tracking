# Council: the polyline backdrops of the bifurcation talk and of the slide template

You are one judge of a council of five, each judge from a different provider or seat, and all of you score the same work against the same reference. Read this brief first, then `RUBRIC.md` in the same folder, where the criteria you score on and the shape of your report are given.

## The request

Claudio Vestini gives a talk on Monday, "Tracking bifurcations of periodic-orbit families", to a group of PhD students in astrodynamics. The deck is built on the reveal.js slide template of his research group. Several slides of the deck and of the template's demo deck have a backdrop drawn from polylines, i.e. thin curves, mostly periodic orbits, traced on a canvas while the slide is shown and then held complete. Claudio asked, in his words:

- "some of the polylines in both deck and template are glitchy, have a council review them then improve. e.g. slide 3. in slide 3 also the orbits should be animated sequentially like you have already done elsewhere."
- "on slide 2 of deck the screen looks weirdly cut in half from top to bottom, maybe the starting points for each of the orbits should not just be y=0"
- "slide 18 on the template, around -1 the orange arc doesn't follow the circle nicely but instead is jagged"

After the first round, Claudio made four decisions, which you take as given and do not score against. Score how well they are carried out.

1. Slide 2 of the deck is a pair of frames: the rotating-pulsating frame at the left, without the apoapsis members above e = 0.6, and the barycentric inertial frame at the right. He found every member at once in one frame too messy.
2. The strands are colored by the colormaps of his matplotlib figures, one colormap per frame ramped in e within each family: viridis in the rotating-pulsating frame and plasma in the barycentric inertial frame. Each colormap is clipped short of its yellow end, and its dark end is moved off the background as far as a contrast of 3:1 asks.
3. The strands of the deck are traced in 9 s in place of 12 s. The title transfer keeps its designed 30 s.
4. In his words, "if the polylines are just too heavy, we can also just cut them". Hence the section slides of the deck draw every other member of a family, so that the drawing ends within 9 s at a pace the eye can follow, and slide 2 draws every other member, so that its bands of converging members do not read as moiré.

Before each round, implementers changed the renderer of the template, the data of the backdrops, the timing of the section slides, and the plot of slide 18 of the template. You judge the current state with your own eyes. Look for any glitch that is left: a jagged corner, a visible polygon on a curve, a chord, a jump of a head, a seam where many strands start or end together, a strand cut at an edge, a wrong color, a stutter, a line that looks beaded or dotted while it is traced, or a trace that looks different from its final still. Judge also whether the animation is pleasant to watch while a speaker talks over it.

## The reference

Score against three references that Claudio likes.

- The closing backdrop `tubes` of the template, i.e. slide 22 of the template's demo deck and the closing slide of the talk deck. It is made of hairline tubes of manifold arcs, traced smoothly and then held as a still.
- The title transfer of the talk deck, slide 1. The tubes of a halo orbit are traced in its first 6 s, while one head flies a low-thrust transfer over 30 s.
- The line animations of 3Blue1Brown, in which a curve is drawn smoothly from its start, at a pace the eye can follow, without anything on screen that flickers, steps, or jumps.

A 10 is a backdrop that a viewer of these references would take as made by the same hand, and a 9 is a backdrop without any glitch that a viewer would notice.

## Where the work is

Read only the files listed here, and nothing else in either folder.

The talk deck is a copy prepared for you, `/Users/claudiovestini/git/talks/bifurcation-tracking/index.polylines.judge.html`, in which one slide unrelated to the backdrops is left out. Its slides with polyline backdrops are these.

| Slide | Backdrop | Drawn from |
|---|---|---|
| 1, title | the low-thrust transfer and the tubes of a halo orbit | `brand/transfer.js` |
| 2, figure | every other member of Broucke's families 7, 8, and 11, in the rotating-pulsating frame at the left and in the barycentric inertial frame at the right, traced live | `backdrops/broucke-families.js` |
| 3, section "The models" | every other member of family 7 in the rotating-pulsating frame | the same file |
| 9, section "Families of periodic orbits" | every other member of family 8 in the rotating-pulsating frame | the same file |
| 18, section "Broucke 1969, reproduced" | every other member of family 11 in the rotating-pulsating frame | the same file |
| 22, closing | the named drawing `tubes` | `src/scenes.ts` of the template |

The template's demo deck is `/Users/claudiovestini/.t3/worktrees/slides/polylines/index.html`, on the branch `talk/polylines`. Its slides in scope are slide 1 (the title, with the same transfer), slide 12 (the strands slide, drawn from `demo/broucke-sample.js` with `data-stagger`), slide 18 (the plot of the Floquet multipliers of the planar Lyapunov families about L1 and L2, built by `demo/multipliers.mjs`), and slide 22 (the closing `tubes`).

You may read these files to understand the work: the section "Backdrops" of the template's `README.md`, `src/strands.ts` and the class `Orbits` in `src/orbits.ts` of the template worktree, `demo/multipliers.mjs` there, and `backdrops/export_broucke_families.py` of the talk folder, which writes `backdrops/broucke-families.json` and `.js`. The data files are large, hence read them with a script rather than whole.

## How to inspect it

If you judged an earlier round, your own report of that round is in `round-<n-1>/<judge>/report.md`, and the answer to the findings of all judges is in `RESPONSE-<n-1>.md` of this folder. Read both, check whether each answer holds, and say so in your report. Do not read the reports of other judges.

The evidence tour of each round is in `evidence/round-<n>/` of this folder, with `INDEX.md` as its guide. For each slide in scope and each mode (dark and light), it has a frame every 0.5 s from the moment the slide is shown, a still once the trace has finished, crops at twice the resolution of the places where glitches were found, a contact sheet of the frames, and a text transcript of the trace, i.e. the number of points of each strand drawn at each frame. Every judge is given the same evidence.

You may also capture your own frames with `tools/frames.mjs` of this folder, whose header says how to run it, e.g. `node /Users/claudiovestini/git/talks/bifurcation-tracking/.council/polylines/tools/frames.mjs <deck> <out> dark 3 --zoom 1080,250,520,550`. Write such captures only inside your own folder.

## What you may change

Change nothing outside your own folder, `round-<n>/<judge>/` in this folder, where `<n>` and `<judge>` are given in your task. Do not edit, stage, or commit any file of the talk or the template, and do not run `npm run check`, `npm run pdf`, or any build. Write your full report to `report.md` in your folder, in the shape given in `RUBRIC.md`, and end your reply with the score and the three changes that would raise it most.
