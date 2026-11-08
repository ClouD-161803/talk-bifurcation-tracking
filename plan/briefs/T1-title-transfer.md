# T1: the low-thrust transfer of the group logo on every title slide, and the line widths of the DyLAN transfer demos (DYLAN-580)

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/TEMPLATE-COMMON.md` first. You are a sibling thread of the orchestrator, you talk to Claudio directly, and you start with the `grill-me` skill on the decisions below before you build anything. Report to the orchestrator with `t3_thread_send` when your work is committed.

## Claudio's words

> ribbon on the title slide just does not look that good. i do like the wide ribbon. but see if we can instead replace the title slide ribbon with the low thrust transfer of the beeson group logo. this is probably GTO to LLO spatial lowthrust demo in dylan. I know orbits.ts can only integrate the dynamics but find some workaround so that we can have that transfer on every title slide, recreated by tweaking the demo so it looks as close as possible to the actual logo in /Users/claudiovestini/git/website/assets/beeson/dylan-inverted-image.png (reverse engineered). i am also noticing the dylan demos that produce the spatial lowthrust, as well as impulsive_transfer_* and low_thrust_transfer_* have too thick lines in the plots. all the line thicknesses should look like the ones in '/Users/claudiovestini/Library/CloudStorage/OneDrive-PrincetonUniversity/Beeson Group - Documents/Software/pydylan/demo_output/dylan/png/with_snopt/GTO_to_LLO_via_L1_planar_impulsive.png'. this is a DYLAN-580 commit update in a dylan branch. [...] i want the title slide animation to be perfect.

He added, on another point, that in a transfer the manifolds are animated first and the spacecraft second, and that the dot at the tip of an orbit stays off for a manifold and on for a spacecraft.

## What is in place

- Slide 1 of the demo deck of the template is the title plate, with `<div class="backdrop" data-scene="ribbon" data-cx="-1.24" data-cy="0" data-half="1.2"></div>`. The ribbon is the scene `ribbon` of `src/scenes.ts`, a bundle of trajectories integrated in the browser by `src/orbits.ts`, which integrates the circular restricted three-body problem only.
- A backdrop can also be drawn from a file of polylines, with `data-strands="file.js"` on the backdrop and a file that wraps JSON in `Beeson.strands(...)`, as `demo/broucke-sample.js` does on slide 12. The reader is `src/strands.ts`, and the attributes of the file and of the element (the selection, the colors, the ramp, the heads, and `data-live`) are described in the README. This is the workaround: the transfer is computed by DyLAN once, exported as polylines, and drawn by the template.
- The logo is `/Users/claudiovestini/git/website/assets/beeson/dylan-inverted-image.png`. Look at it before the interview, and reverse-engineer it: the transfer, the projection, the palette, and the line weights.
- The DyLAN demos that draw the transfers are in the `dylan` repository, and their outputs are in the OneDrive folder named above, next to the reference PNG whose line widths are wanted everywhere. The worktree set of DYLAN-580 is `/Users/claudiovestini/git/dylan/worktrees/DYLAN-580/`, with the `ac` repository only so far. Add the `d` and `dc` worktrees there by the rules of the workspace tier, `/Users/claudiovestini/git/dylan/worktrees/AGENTS.md`, and build what you need with the `build-chain` skill.
- Your checkout of the template is a worktree on the branch `talk/title-transfer`, based on the local `main`.

## The decisions to grill

Settle the facts yourself: which demo draws the transfer of the logo, what the logo shows, and which demos have the thick lines. Put the decisions to Claudio, one question each.

- The transfer and the demo to export.
- The projection and the frame of the title backdrop.
- The palette, i.e. the one of the logo or the one of the deck.
- One transfer, or a bundle in the spirit of the wide ribbon.
- The spacecraft dot and its timing.
- The loop and the speed.
- The look in light mode.
- Where the file of polylines is kept in the template.
- What "perfect" means to him, e.g. the logo and the render side by side at the end.

Ask for the exact size of the line widths only if the reference PNG does not settle it.

## Deliverables

1. On the DYLAN-580 branch of `dylan`, the line widths of the demos of the spatial low-thrust transfer, `impulsive_transfer_*`, and `low_thrust_transfer_*`, made to match the reference PNG. Regenerate their outputs and compare them side by side with the reference. Add an export of the transfer as polylines for the template, as an option of the demo or as a script beside it.
2. On `talk/title-transfer` of the template, the transfer as the backdrop of every title slide, i.e. of the title plate of the demo deck and of the title layout described in the README. It is drawn in both modes, as close to the logo as the interview settles. The `ribbon` scene is kept for other uses.
3. Commits on both branches, without attribution lines and without a push, and the report to the orchestrator: the branches, the commits, the commands run with their last lines, and the decisions taken in the interview.
