# H2: the transfer of slide 10, redesigned

Read `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/briefs/TEMPLATE-COMMON.md` first. Your checkout is a worktree of the template made by the harness, on a branch of its own. Other children work on the template at the same time, on other slides and on the surface element. Hence keep your changes of `index.html` to slide 10, and your changes of the runtime to the scene of the transfer and what it needs.

## Claudio's words

> in a transfer, the manifolds should be animated first, and the spacecraft second, otherwise it is confusing. so slide 10 needs fixing. in addition, we seem to be using L1 lyapunov orbits for every single slide at this point, and it is getting a little repetitive. and slide 10 manifolds are too sparse. please have the slide 10 transfer redesigned.

He also asked, on another point, that the dot at the tip of an orbit be off by default, off for a manifold, and on for a spacecraft. Another child, H1, adds this switch to the scenes and documents it. Use the dot on the spacecraft alone, through the switch once it is merged, and until then through the means of the scene itself, and say in the report which you used.

## What is in place

- Slide 10 is `<section class="figure">` with the backdrop `data-scene="transfer" data-cx="-0.42" data-cy="0" data-half="0.85" data-live`, the labels Earth and Moon, and the heading "A low-energy transfer through L1". The caption is "A flight from a perigee along the stable manifold of an L1 Lyapunov orbit, once around the orbit, and along its unstable manifold to a close pass of the Moon."
- The scene is `transfer: () => transfer(0.03)` in `src/scenes.ts`, and the orbits and the manifolds are integrated in `src/orbits.ts` in the Earth–Moon circular restricted three-body problem. Read both files, and the section on scenes of the README, before you design.

## Tasks

1. Design a transfer on another orbit than an L1 Lyapunov orbit, which the deck shows too often. Choose among what the integrator gives, e.g. an L2 Lyapunov orbit with a transfer to the far side of the Moon, or a transfer into a distant retrograde orbit along the manifolds of a Lyapunov orbit. The transfer must be dynamically right: a ballistic flight along a stable manifold, around the orbit, and along an unstable manifold, as is said in the current caption, or another flight you can justify in the caption.
2. Draw the manifolds denser, with more strands, and animate them first, growing from the orbit, with the spacecraft second, flying its path after the manifolds are complete.
3. Write the heading and the caption of the slide for the new transfer, with the libration point in `\(\mathcal L_2\)` or the equivalent, and the note of the slide.
4. Render the slide in both modes, look at the PNGs in `check/` at several moments of the animation, and tune the window (`data-cx`, `data-cy`, `data-half`) so that the whole flight is seen.
5. Run `npm test`, `npm run check`, and `npm run pdf`, commit as you go, and report by TEMPLATE-COMMON.md, with the design and its alternatives.
