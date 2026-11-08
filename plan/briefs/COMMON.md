# Common brief of the overnight build of the bifurcation talk

Read this file first, then the brief of your task. The orchestrator is the T3 Code thread `43f4a815-2ba7-4fb6-93d4-d702ed7aaee4`, and you report to it through your final message alone.

## The talk

Claudio Vestini presents on Monday, 2026-11-09, to the PhD students of the Beeson group at Princeton, for about 30 minutes plus questions. The title is "Tracking bifurcations of periodic-orbit families", with the subtitle "Broucke's elliptic families, reproduced in DyLAN". The main result is the reproduction, in DyLAN, of the three families of periodic orbits that Broucke continued in eccentricity in the elliptic restricted three-body problem (ER3BP) in 1969, i.e. families 7, 8, and 11, each with a periapsis and an apoapsis branch. The deck is built on the reveal.js template of the group, and its demos are tycho scenes (tycho is the browser viewer of trajectories, with the Python writer pytycho) and in-slide elements of the template.

## The plan files

Every decision of the plan is in `/Users/claudiovestini/git/talks/bifurcation-tracking/plan/grill-record.md`. Read its sections `## Decisions`, `## Terms`, `## Decisions added (Round 4, 02:20)`, `## Terms added (Round 4)`, `## Confirmation with corrections (02:30)`, `## Decisions (final, superseding the lines above where they differ)`, and `## Correction (02:33)`. Where two lines differ, the later one holds. The slide-by-slide spine is the section `# outline:teacher` of `plan/outlines.md`, amended by the decisions of Round 4. The style of the maths reveals is described in `plan/thesis-style-guide.md`.

## The folder of the talk

The deck is `/Users/claudiovestini/git/talks/bifurcation-tracking/`, a git checkout on `main`, which is never pushed. It is a copy of the template at `/Users/claudiovestini/git/slides` (commit 03fc376), and the template is described in its `AGENTS.md` and `README.md`. Its subfolders are `plan/` (the plan and the briefs), `demos/<name>/` (the build script, the data, and the HTML of each demo), `data/` (the numbers and tables from DyLAN), `figures/` (the figures, in `figures/dylan/` and `figures/broucke/`), and `backdrops/` (the polylines of the data-driven backdrops). Do not run `git commit` in this folder, since several agents write to it at once, and the orchestrator commits. Do not run `cd`, and use absolute paths.

## Quality bar

The bar for every demo is the Broucke page `/Users/claudiovestini/git/tycho/code/examples/broucke/broucke.html`, built by `examples/broucke/build.py` in the same folder: its color, the smoothness of its animation, its complexity, and the fact that it is not boring. Read `build.py` before designing a scene. The other examples of tycho are below this bar.

## Rules

- Before writing any text that is not chat (a storyboard, a README, a docstring, a comment, a commit message), read the `writing` skill at `/Users/claudiovestini/.config/princeton/claude-home/skills/writing/SKILL.md` and the reference file it names for the surface. The symbols of the talk follow the notation registry `references/notation.md` of this skill and the `## Terms` sections of the record: the libration points $\mathcal{L}_1$ to $\mathcal{L}_5$, the mass ratio $\mu$, the effective potential $\tilde{U} = U_g + U_c$, the Jacobi constant $C = -2E$, the true anomaly $\theta$ and the separation $\rho(\theta) = (1 - e^2)/(1 + e\cos\theta)$ on the slides, the stability coefficients $a_1, a_2$ and the indices $k = \lambda + 1/\lambda$, the period $2\pi K$, the segment count $S$, and the frames rotating-pulsating $(x, y)$, rotating $(\xi, \eta)$, and barycentric inertial.
- DyLAN (astrodynamics-core, dylan-core, dylan) is proprietary. Never copy DyLAN source into the talk folder, the tycho repo, or the template repo. A script in the talk folder may import the Python bindings to compute or to check numbers, and such a script is kept in a file of its own whose name ends in `_dylan.py`, so that it can be left out of a review by a non-Anthropic model.
- The Python of DyLAN is `/Users/claudiovestini/git/dylan/.venv/bin/python` (3.14). Its `dylan.pth` pins the builds of the main checkouts, which are on `master` and do not contain the elliptic work. The elliptic work is on `vestini/master`, built in the worktree set `/Users/claudiovestini/git/dylan/worktrees/vestini-master/`. To import it, run the venv Python with `PYTHONPATH=/Users/claudiovestini/git/dylan/worktrees/vestini-master/ac/build_with_spice/python_binding:/Users/claudiovestini/git/dylan/worktrees/vestini-master/dc/build_with_spice/python_binding:/Users/claudiovestini/git/dylan/worktrees/vestini-master/d/build_with_spice/python_binding`, and check `pydylancore.__file__` before trusting an import. Do not rebuild DyLAN unless an import fails, and then follow the `build-chain` skill.
- pytycho runs with `uv run` inside `/Users/claudiovestini/git/tycho/code` (`uv run --project /Users/claudiovestini/git/tycho/code python <script>`), and the runtime must be built once in a fresh checkout (`npm --prefix web ci && npm --prefix web run build`).
- Run every build, test, and demo in the foreground, and wait for it before ending the turn. Never leave a job in the background at the end.
- Report at the end, in under twenty lines: what you built, where, how you verified it (the commands and their results), what you could not do, and any decision you made that the brief left open.
