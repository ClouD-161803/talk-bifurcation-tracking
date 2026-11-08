# H1: six fixes of the demo deck and the runtime of the template

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/TEMPLATE-COMMON.md` first. Your checkout is a worktree of the template made by the harness, on a branch of its own. Three other children work on the template at the same time, on slide 10 (the transfer), slide 15 (the tycho viewer), and slide 16 (the surface). Three sibling threads work on the title slide, the fonts, and the video of slide 17. Do not touch these slides or `src/surface.ts`, and keep your changes of `index.html` to the slides named below, so that the branches can be merged.

## Claudio's words, one point per task

> 2. the orange dot heads at the tip of the orbits should be switched off by default. but keep the code. the dots should stay off for manifolds, but on for spacecraft.

> 4. also on slide 3, the last bullet point appears and all bullet points are highlighted straight away. instead, it should redirect attention to it first, then highlight the others in a second step.

> 5. on slide 7 the quasi periodic orbit animations is too fast. slow it down a little

> 6. I hate the paper figure of slide 9. find a better one. why is there so much whitespace on the left hand side? and again lagrange points as standard Ls

> 8. the backdrop in slide 12 could benefit from some more lines per family with different shades of the same colour per family. also it might be cool if you delay the start of the points sequentially so they don't all start at the same time

> 12. currently, switching from dark to light mode or viceversa stops any animations. it shouldn't

## What is in place, per task

- Task 2. The head of a live orbit is drawn by `src/orbits.ts` and the scenes of `src/scenes.ts`. Make the head off by default for a scene and for a file of polylines, and keep the code. Give a scene or an element a way to turn it on, so that on slide 10 the head can be shown on the spacecraft alone. Say in the README how the head is turned on. The child who redesigns slide 10 is told that you add this switch.
- Task 4. On slide 3, when the last fragment is shown, `data-complete` is set on the section and every fragment is restored to full opacity, as is said in the note of the slide. Instead, the last fragment is to be shown bright with the earlier ones dimmed, as any other fragment, and all of them are restored at one more step. Make this the behavior of every slide with fragments, in `src/steps.ts` or `src/main.ts`, keep the PDF at one page per step, and update the note of slide 3 and the section on steps of the README. With this change one step per slide with fragments is added to every deck built on the template, hence say so in the report.
- Task 5. Slide 7, "Figures and math", carries a live backdrop with a quasi-periodic orbit. Slow its animation down a little, by the attribute of the scene if one exists, else by a speed of the scene in `src/scenes.ts`.
- Task 6. Slide 9, "A white figure, framed as paper", shows `demo/figure-paper.png`, drawn by `demo/figures.py`. Draw a better figure, of something other than an L1 Lyapunov orbit, which is shown too often in the deck. Fit the axes to the content, so that the blank margin at the left is gone, and write every libration point in `\mathcal`. Keep the paper style of the slide, and regenerate the dark and light figures of slide 8 only if they share the code.
- Task 8. Slide 12, "A backdrop from a file of polylines", draws `demo/broucke-sample.js` through `src/strands.ts` with `data-strands-color="family"`. Draw more lines per family, each in a shade of the color of its family, and start the heads one after another, with a delay between them, rather than all at once. Add the attributes this needs to the README, and keep the ones in use working, since the talk deck uses `data-strands-select`, `data-strands-color`, `data-strands-ramp`, `data-live`, and `data-heads`. Keep the file small, e.g. by more members of the three families in the sample rather than a larger export.
- Task 12. Switching the mode with the switcher of `src/switcher.ts` stops the animations of the current slide. After a switch, every live backdrop, scene, surface, and video of the slide keeps playing, or is restarted where it cannot continue. Add a Chrome test for it.

## Closing

Run `npm test`, `npm run check`, and `npm run pdf`, look at the PNGs of slides 3, 7, 9, and 12 in `check/` in both modes, commit as you go, and report by TEMPLATE-COMMON.md, with the new attributes listed.
