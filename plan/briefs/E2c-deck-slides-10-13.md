# E2c: the deck changes left by E2b on slides 10 to 13

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/COMMON.md` first. Your checkout is the talk folder, `/Users/claudiovestini/git/talks/bifurcation-tracking`, on the branch `main`. Other agents work in the folder at the same time, hence edit only `index.html` between the comments `<!-- 10,` and `<!-- 14,`, i.e. slides 10 to 13, and the four viewer blocks that `tools/deck/embed_scene.py` rewrites there. Do not touch the title slide, any other slide, `theme/`, or `demos/`. Stage nothing and commit nothing. Put any script of yours under `/private/tmp/claude-501/e2c/`.

The id of the orchestrating session is on the next line, to be copied into your report.
43f4a815-2ba7-4fb6-93d4-d702ed7aaee4

## What E2b did

Under `plan/briefs/E2b-corrector-round-1-fixes.md`, the agent E2b carried out the twenty-six decisions of judge round 1 in `demos/corrector/`, and rebuilt the pages `demos/corrector/correction.html` and `demos/corrector/continuation.html`. Its report in chat said the following, which you need for the deck.

- The continuation scene has a new choice `pens`, with the values `natural` (the default, labeled "natural parameter") and `both` (labeled "both"). Both pens share a halving floor of 2⁻¹⁴. A close-up panel shows e from 0.45256 to 0.45406 and x₀ from −0.17354 to −0.17287 on family 11, and C from 2.9727 to 3.0102 on the Lyapunov family. At the fold, the orange pen halves 14 times at every step size, and the blue pen halves 10, 12, and 13 times at the small, medium, and large steps.
- The weights of the continuation norm were kept. On the Lyapunov family they are diag(1/0.148², 0.25/0.51², 0, (3.5/0.2309)²) on (x₀, ẏ₀, T/2, C), and on family 11 they are diag(1/0.1027², 0.25/0.313², (3.5/0.4539)²) on (x₀, ẏ₀, e).
- The correction scene has a new guess `farther`, labeled "δ = 0.05", which shot 3 uses with S = 16. Iterate 0 spans the clock from −2 to 1. The playback speeds are 0.5 and 0.25. A new toggle `others`, labeled "other segment counts", is off by default. Arcs are drawn in one flat color in the CR3BP.
- The storyboard `demos/corrector/STORYBOARD.md`, the README, and `demos/corrector/CHECKS.md` were rewritten. The title of the scene is "Differential correction", the libration point is labeled 𝓛₁, and e is rounded to 0 at the seed.
- The shots are in `demos/corrector/shots/`, 174 PNGs indexed in `shots/INDEX.md`, one row per PNG. In shot 6, S = 2 converges where S = 4 fails, and iterate 2 has the period −59.7, hence its arc is propagated backward, against its velocity stick.
- The DyLAN check `check_dylan.py` exits 0 and every gap is below 1e-10.

## The twelve changes, in E2b's words

E2b left these to the deck, numbered as in its report. Carry out all twelve, and then the re-embed described below.

1. On slide 13, write the condition τₖᵀW(Y − Yₖ) = Δs, with a where clause that states the weights above.
2. Set the embed values. Slide 10: case=lyapunov, system=cr3bp, targeting=half, S=1, guess=near, others=false. Slide 11: targeting=full, S=1, guess=near, others=false, or the shot-3 values S=16, guess=farther, others=true. Slide 12: family=lyapunov, step=medium, pens=natural. Slide 13: family=family11, step=medium, pens=both. Re-embed all four viewers.
3. Reset the stored viewer state on each slide change.
4. Define δX, Δtᵢ, τₑ, and n on slides 10 to 13.
5. Fix the clipped last sentence of slide 13.
6. In the slide-13 notes, remove the claim that a large step jumps past the fold, and the stale zoom and F-key note.
7. On slide 11, reword the line about more segments: in shot 6, S = 2 converges where S = 4 fails.
8. In the slide-12 notes, change the fold value e = 0.45313 to 0.453864, and say the blue pen is not drawn by default.
9. In the TODO tab names, the S tabs are now "1" to "16", and the guess tabs gain "δ = 0.05".
10. The deck panel's aspect is about 0.9, while the weights assume 3.5.
11. Put the speeds 0.5 and 0.25 into the notes.
12. Addition: in the shot-6 notes, say that iterate 2 has period −59.7, so its arc is propagated backward, against its velocity stick.

On item 2, choose for slide 11 the values that the storyboard plays on that slide, and say in your report which you chose and why. On item 3, the deck already calls `reset()` of every `tycho-viewer` of a slide on `ready` and `slidechanged`, near the end of `index.html`. Find out what `reset()` of the viewer restores, by reading `/Users/claudiovestini/git/tycho/code/web/src/runtime/` and by trying the deck in headless Chrome with `launch` from `scripts/chrome.mjs`, and make the four viewers come back to their embedded values when their slide is shown again. On item 10, change neither the weights nor the scenes. Measure the aspect of the diagram panel as the deck shows it, and put the numbers in your report as an open point for the orchestrator. On item 9, the TODO is the placeholder list in the notes of the slide, which names the tabs the presenter can choose.

## The re-embed

The four commands are in the docstring of `tools/deck/embed_scene.py`, with the box of 730 by 880 pixels at the right of the text. Keep the box, and change only the `--set` values to those of item 2. Run them from the talk folder with `uv run --project /Users/claudiovestini/git/tycho/code python`, as the docstring shows. After the re-embed, the viewer blocks differ from the committed ones in their data, which is expected.

## The rules of the deck

- Every step of a slide has maths in the style of `plan/thesis-style-guide.md`, in the notation already used on the deck. Read the maths of slides 8 to 13 before you write, and keep one symbol per thing: the constraint vector, the state transition matrix, the tangent, the weights, and the step are named there. Define every symbol before it is used, in a where clause or in the sentence that introduces it.
- The notes of a slide are the script the presenter speaks, one paragraph per fragment, each opening with "Step N:" where N is the fragment index. Write them in the first person, in sentences of at most 40 words, with every term defined at its first use.
- A new element on a step redirects the attention of the audience, as the grill record states.
- Every line of text follows the writing rules of the global instructions, which you have.

## The check

Run `npm run check` and `npm run pdf` from the talk folder, and read what the check prints for slides 10 to 13. Then look at the four slides in the PDF, in the dark mode and in the light mode, for a formula that is cut, a label that overlaps, or a viewer that does not fit its box. Render a page with `pdftoppm -f N -l N -r 60 -png slides.pdf /private/tmp/claude-501/e2c/page`.

## The report

Report in chat, in under twenty lines: what you changed for each of the twelve items, the values you chose on item 2, what `reset()` restores and what you changed on item 3, the numbers of item 10, what the check printed for the four slides, and anything you left undone with its reason. Copy the orchestrator id above into the report.
