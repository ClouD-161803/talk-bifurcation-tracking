# X1: the council on the correction and continuation scenes, in its own thread

You orchestrate, in this thread, the next council on the two explainer scenes of the talk, the differential corrector of slides 10 and 11 and the continuation of slides 12 and 13, both built by `demos/corrector/build.py` of the talk folder `/Users/claudiovestini/git/talks/bifurcation-tracking`. Read `plan/briefs/COMMON.md` first, then the storyboard `demos/corrector/STORYBOARD.md`, the README of the same folder, and the briefs `plan/briefs/E2d-explainers-after-council-round-1.md` and `plan/briefs/E2e-explainers-after-judge-round-2.md`, which record the decisions of the last two rounds and the reports they answered (the council reports under `.council/explainers/round-1/`, the Opus report `plan/judges/round-2/opus.md`, and the brief, the rubric, and the eleven questions in `.council/explainers/BRIEF.md` and `RUBRIC.md`). Use the `council` skill for the rounds, with a cap of three rounds, and the rules below where they differ from it.

## What Claudio asked

Claudio's request, verbatim: "on differential corrector and continuation also have a council review", "for dc and cont, include an opus 5.5 enterprise reviewer on top of the other 4", and "i am not sure I understand what is going on with the red and white lines in that demo". His earlier rule, question 11 of the rubric, stands: make sure there is not too much going on and the viewer is not overwhelmed. Add a question to the rubric for the red and the white: can a viewer tell, from the screen and from the lines of the notes, what every colored element is, i.e. the red dots and defects, the white arcs and sticks, the gray ghosts and reference, the orange and the blue pens, and is each introduced in the notes at the fragment where it first appears? A finding on this question is answered by a cut, by an introduction in the notes at the first appearance, or by a readout, in that order of preference.

## The judges

Convene the four judges of the skill, retry Antigravity, whose quota was exhausted earlier today, and report who was unavailable without substituting. Add the fifth judge Claudio asked for, Claude Opus 5.5 on the Enterprise seat, `providerInstanceId` `claude-princeton`, model `claude-opus-5-5`, options `{"effort": "xhigh"}`. Every judge may see the deck, the scenes, the storyboard, the README of the scenes, the shots under `demos/corrector/shots/`, and the pages of the scenes, which are material made for an audience. No judge reads `demos/corrector/check_dylan.py`, `CHECKS.md`, `runs.json`, `data/`, or slide 21 of the deck, which hold DyLAN text, and the judges of Antigravity, Codex, and GLM see nothing else of DyLAN. GLM gets text only, i.e. the transcript `shots/INDEX.md` in place of the PNGs. Keep the council folder under `.council/explainers/` of the talk folder, in the rounds numbered after the two that are there, and copy the reports to `plan/judges/explainers/` at the end.

## The rounds

Between rounds, triage every finding on its merits, keep the scope of the two scenes and slides 10 to 13, and have the accepted findings implemented by Opus implementers on the personal Claude seat, `providerInstanceId` `claudeAgent`, model `claude-opus-5-5`, options `{"effort": "xhigh"}`, and on the Enterprise seat `claude-princeton` once the personal seat is out. The numerics of both scenes were verified twice and recounted by a judge, hence a change of the method needs a reason in your response. After each change, the implementer rebuilds both pages with the command of the README of the scenes (about 170 s), reruns `check_dylan.py` with the command of the README, which must exit 0, updates `CHECKS.md` and `runs.json` where numbers changed, embeds the four scenes again with the commands in the docstring of `tools/deck/embed_scene.py`, reruns `demos/corrector/shots.mjs` and rewrites `shots/INDEX.md`, and verifies the four slides live with a copy of `/private/tmp/claude-501/e2d/slides-probe.mjs` in both modes. During your run no other agent writes the deck, hence your implementers edit `index.html` in place, on slides 10 to 13 only, and you run `npm run check` in the talk folder at the end of each round, which must report no page errors.

## Rules

Do not stage or commit anything, and do not run `cd`. Any text you write, in the storyboard, the notes, or the responses, follows the writing rules of the global instructions and the thesis style of `plan/thesis-style-guide.md`, with the notes a script of one "Step n:" paragraph per fragment. End with a hand-over for the orchestrating thread: the table of scores per round, the findings fixed and the findings rejected with their reasons, the exact replacement text of the notes you changed, the line of `check_dylan.py`, the count of shots, and what is left.

## The state after E2e, and two changes of the runtime since

E2e, the implementer of the brief `plan/briefs/E2e-explainers-after-judge-round-2.md`, reported as follows, and the scenes, the storyboard, the shots, and slides 10 to 13 are in the state it describes.

> All 15 decisions are in place, apart from the parts that the TyCHO runtime blocks (listed under Open below). Nothing is staged or committed, and `check_dylan.py` exits 0.
>
> 1. Defects (O1, O7): each defect is drawn as the gap in position plus a red bar between the tips of the two velocity sticks. Defects grow from n+0.45 to n+0.6, the point is drawn at n+0.6, and the nodes move from n+0.7 to n+1. For S > 1, iterate 0 is staged at −2 to −1.05 and −0.95 to −0.1, and its nodes slide from 0.1 to 1.
> 2. Fold close-up (O2): the close-up is centered on the fold tip (e 0.4510–0.4568, ẏ₀ 1.1394–1.1428), and the shots show a smooth turn in its middle.
> 3. Dark viewers (O3): I added `--keep-theme`, and the probe confirms that the four viewers stay dark in light mode.
> 4. Slide 11 (O4, O5): it loads with the ghosts and the other segment counts off. Key 0 replaces every scrubber drag, and the storyboard shots follow the notes as 3, 4, 5.
> 5. Other decisions: one colorbar of n remains (O6), and slide 13 has `data-tone="violet"` (O8). I applied O9 to O11, G4, the cosmetics of G12, and the panel names.
> 6. Captions (O12): each norm is held until its point is drawn, and a failed run gets the label "run failed at n = K" in the convergence panel.
>
> `check_dylan.py`: "The largest e of family 11 is 0.45386491 in runs.json, and the fold is at e = 0.45386506 in the stability data." CHECKS.md needed no change. Shots: 193 (140 correction, 53 continuation). I wrote INDEX.md, and prose-lint is clean on the storyboard.
>
> Open (decisions I made, and limits of the runtime):
>
> 1. A clicked tab takes key 0 without rewinding, so every rewind is "click the panel, then press 0". The runtime fix is in tycho `useKey`.
> 2. A caption cannot print text on a condition. The failed-run text is therefore a panel label, and α reads 0 for a failed run, not blank. The caption of iterate 0 shows from the start of the loop.
> 3. The colorbar ticks read 0.00 and 10.0, because the format is fixed in the runtime.
> 4. Arcs are cut at the fitted box (1/1.1 of the panel), because the fit adds a 10% margin.
> 5. I added white sticks at the ends that are not nodes, so that the bar between the stick tips does not float.
> 6. The 𝓛₁ label is hidden for family 11 in the correction scene.
> 7. The failure label sits at FAIL_Y = 2.2 and from n = 1. Shot 7 sets S back to 16 and keeps the line search.
> 8. Slides 16, 17, and 19, plus one caption later in the deck, still write 0.45387. These are outside my scope.

The open points 1 and 3 are settled in the runtime since, in `theme/vendor/tycho/tycho.js` of the talk: a key pressed while a tab, a switch, or a button of the viewer has the focus acts on the viewer unless the control takes the key itself, hence `0` rewinds the loop right after a click on a tab, and the ends of a colorbar over integers are written as integers, hence the colorbar of $n$ reads 0 and 10. Before round 1, have an implementer replace every "I click the orbit panel and press 0" and "I click the diagram and press 0" of the notes of slides 11 to 13 and of the Control column of the storyboard by "I press 0", in the same sentence, and rerun `shots.mjs` so that the shots show the integer ticks. The open point 8 is done: the fold is written 0.453865 on every slide. The open points 2 and 4 to 7 stand as E2e left them, and a judge who objects to one of them is answered on the merits.
