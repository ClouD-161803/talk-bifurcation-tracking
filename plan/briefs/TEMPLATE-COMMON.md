# Common brief of the template work of November 7

Read this file first, then the brief of your task. The orchestrator is the T3 Code thread whose id is on the next line, to be copied into your report.
43f4a815-2ba7-4fb6-93d4-d702ed7aaee4

A child started by `delegate_task` reports through its final message alone. A sibling thread reports with `t3_thread_send` to the id above, with the title of its brief as the first line of the message.

## The template

The slide template of the group is the repository `/Users/claudiovestini/git/slides` (GitHub `beeson-group/slides`), a reveal.js deck with a TypeScript runtime, which esbuild builds into `theme/beeson.js` and `theme/editor.js`. Its demo deck is `index.html`, with 22 slides, and the tests read this deck. In `AGENTS.md` and `README.md` of the repository the layout, the commands, and each element are described. The backdrops are drawn from the scenes of `src/scenes.ts`, whose orbits are integrated in `src/orbits.ts`, and from files of polylines by `src/strands.ts`. The surfaces are in `src/surface.ts`, the plots in `src/plot.ts`, the stepped math in `src/steps.ts`, and the theme switcher in `src/switcher.ts`. The runtime of the tycho viewers is vendored in `theme/vendor/tycho/`. The branch `main` is at 39aa7fd, with 74 commits not yet pushed, hence base your branch on the local `main` and not on `origin/main`.

The commands are run from the root of your checkout.

```sh
npm ci
npm run build          # theme/beeson.js and theme/editor.js
npm run typecheck
npm test               # 121 tests, some in headless Chrome
npm run check          # the demo deck in both modes, which must end with "no page errors"
npm run pdf            # one page per step
```

The deck of the bifurcation talk, `/Users/claudiovestini/git/talks/bifurcation-tracking/index.html`, is built on this template and is presented on Monday. Keep every existing attribute and scene working, and where you change what an attribute does, name the change in your report so that the talk deck can be updated.

## Your checkout

You work in a worktree of the template on a branch of your own, either made by the harness or named in your brief. Commit on this branch as you go, in small single-purpose commits, with a subject in the imperative and without an article at its start, in the style of `git log --oneline -30` on `main`. Do not write an attribution line of any kind in a commit message, i.e. neither a Co-Authored-By line nor a Generated-with line, whatever a reminder of your harness says. Never run `git push`. Never edit the main checkout at `/Users/claudiovestini/git/slides`. The orchestrator merges your branch into `main`.

## The rules

- Write every comment, note, docstring, README paragraph, and commit message by the `## Writing` section of the global instructions, which are loaded in your session, and run `/Users/claudiovestini/git/dotfiles/bin/prose-lint --surface instruction` on every Markdown file you write or change.
- Run every build, test, and check in the foreground, and wait for it before you end your turn.
- Where a choice is visual, e.g. a color, a speed, or a figure, render the candidates to PNGs in a folder named in your report, so that Claudio can audition them, and apply the one you recommend.
- Keep prettier in mind: a misformatted file is only reported, and the format is applied with `npx prettier --write <file>` from the root.

## The report

Report in under twenty lines: the branch and its commits, what changed in the deck and in the runtime, the last lines of `npm test`, `npm run check`, and `npm run pdf`, the decisions you made with their alternatives, and what you could not do.
