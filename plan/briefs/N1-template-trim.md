# N1: trim the demo deck of the slide template

You work in the Beeson slide template, `/Users/claudiovestini/git/slides`, on a new branch `talk/template-trim` in a new worktree `/Users/claudiovestini/.t3/worktrees/slides/talk-template-trim`, made from the current `main`. Do not touch any other worktree or branch, the talk folder `/Users/claudiovestini/git/talks/bifurcation-tracking`, or tycho.

## Goal

Claudio wants a template with fewer slides, each of which he is proud of, rather than a catalog. The demo deck `index.html` has 23 slides today, and a render of each is in `check/dark-NN.png`. Keep these, in this order, and remove the others.

1. The title slide with the animated logo transfer (`brand/transfer.js`).
2. One section slide (the section layout with its outline). Its backdrop is a polyline file, i.e. `demo/broucke-sample.js` through `data-strands`, with a selection that differs from the one of the polyline slide below. Do not use any backdrop scene removed below.
3. "Steps are shown one at a time", the bullets that appear one at a time while the earlier ones are dimmed.
4. "Stepping through the equations", the stepped maths with `data-highlight`.
5. "A figure in the zone", a figure beside text. Fold the one sentence about the `paper` class of slide 9 into its list, and remove slide 9.
6. "Code, one group of lines per step".
7. "The effective potential", the three.js surface.
8. "The tubes of an L1 orbit", the wide ribbon (`wideRibbon`).
9. "A backdrop from a file of polylines". Leave this slide byte for byte as it is, since a council is changing it on the branch `talk/polylines`, which is merged into `main` before yours.
10. "Tycho on a slide", the halo family.
11. "A video on a slide", the manifolds video.
12. "Thank you", with the `tubes` backdrop.

The slides to remove are "Motion in the rotating frame" (`l2`), "The Lyapunov families about L1 and L2" and "Period of the families" (`lyapunovs`, auto-animate), the section slides "Figures and math" (`torus`) and "Writing a talk" (`hill`), "A white figure, framed as paper", "A low-energy transfer by way of L2" (the `transfer` scene), "The black panel of the group deck" (`split`), "The multipliers of the Lyapunov families" (the demo of the plot element), "The vocabulary", and "Keys and export" (`sheaf`). The section slide "What is in a talk" (`lace`) becomes slide 2 above, with the polyline backdrop.

Move what a removed slide explained, where it is still true, into `README.md` once, unless the README already says it: the vocabulary table, the keys and the export commands, the `split` layout, the `paper` and `invert` classes, and the plot element. Do not keep a README section about a slide that no longer exists.

## Removing the parts that served only the removed slides

Remove each backdrop scene that no kept slide uses (`lace`, `nest`, `l2`, `lyapunovs`, `torus`, `transfer`, `hill`, `sheaf`, and any other one you find unused), together with its data, its code in `src/`, and its tests. Before removing a scene, grep the talk deck `/Users/claudiovestini/git/talks/bifurcation-tracking/index.html` read-only, and keep every scene that the talk uses. Keep every element and layout (`split`, the plot element, `paper`) in the code, since the talk deck uses the plot element and other decks may use the rest, and keep their tests on their pages under `test/pages/`. Keep the files of `demo/` that a kept slide or a test still reads, and delete the others, e.g. `demo/multipliers.mjs` if only the removed plot slide read it.

The demo deck is read by position and by content in some tests, the editor tests among them. Rewrite such a test for the new deck rather than deleting it, unless the behavior it tests belonged only to a removed slide.

## Proof

Run `npm ci`, `npm run build`, `npm run typecheck`, `npm test`, `npm run check` (both modes, no page errors), and `npm run pdf` in the worktree. Look at every `check/dark-NN.png` and `check/light-NN.png` you produce, and fix anything cut, overlapping, or empty. Report the counts that each command printed.

## Commits

The commit hook is paused for this overnight run until 2026-11-08T16:31:31Z. Hence commit on `talk/template-trim` by the `commit-sequence` skill, in small single-purpose commits, without any attribution line, and without setting a commit identity. Do not merge into `main` and do not push. Write the README and AGENTS.md text by the writing skill (`/Users/claudiovestini/.claude/skills/writing/SKILL.md` and its `references/notes.md`), and run `/Users/claudiovestini/git/dotfiles/bin/prose-lint` on each Markdown file you change.

## Report

End with the head of the branch, the slides kept and removed, the files and scenes removed, the README sections added, the outputs of the commands, and every judgment call you made. Do not start subagents.
