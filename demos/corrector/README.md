# Corrector and continuation scenes

The files in this folder are two TyCHO scenes of the talk. The correction scene, `correction.html`, shows multiple shooting for slides 11 and 12, and the continuation scene, `continuation.html`, shows natural-parameter and pseudo-arclength continuation for slides 13 and 14. What the presenter does and what the audience sees at each shot is described in `STORYBOARD.md`, whose lines are written to become speaker notes.

## Files

| File | Content |
|---|---|
| `STORYBOARD.md` | The shots of both scenes, with the lines of the speaker and the controls. |
| `corrector.py` | The models (the CR3BP and the ER3BP in the rotating-pulsating frame), the propagator, the multiple-shooting corrector, and the two continuation methods, in NumPy only. |
| `build.py` | The builder of both scenes, which computes every orbit with `corrector.py` and writes the pages with pytycho. |
| `check_dylan.py` | The check of every converged orbit against DyLAN. |
| `CHECKS.md` | The numbers of this check. |
| `correction.tys`, `correction.tyd`, `correction.html` | The scene document, the data container, and the page of the correction scene. |
| `continuation.tys`, `continuation.tyd`, `continuation.html` | The same three files of the continuation scene. |
| `runs.json` | The references, the converged corrections, and the members of every continuation run, read by `check_dylan.py`. |
| `shots.mjs`, `shots/` | The script that takes a still of each shot of `STORYBOARD.md` with headless Chrome, and the stills with their index. |

The builder imports only NumPy, pytycho, `corrector.py`, and the standard library. It reads the circular member of family 11 from `data/stability/members.json` of the talk. The only file here that imports the DyLAN bindings is `check_dylan.py`, and DyLAN text is held only in this file and in `CHECKS.md`, where the classes and methods of the bindings are named. I did not copy any DyLAN source into this folder.

## Building and checking

The pages are built with the pytycho of the TyCHO checkout, whose runtime has to be built into `src/pytycho/_static/tycho.js` first.

```sh
uv run --project /Users/claudiovestini/git/tycho/code python /Users/claudiovestini/git/talks/bifurcation-tracking/demos/corrector/build.py
```

On the Mac a build takes about 230 s, spread over worker processes, i.e. the number of cores less two unless `--jobs` is given. The builder prints the table of the iterations of the 240 correction runs and a line for each continuation run. The correction page is 9.1 MB, of which 5.2 MB is the data container, and the continuation page is 1.7 MB, of which 0.7 MB is the data container. The check runs in about 30 s with the Python of DyLAN and the bindings of `vestini/master`.

```sh
PYTHONPATH=/Users/claudiovestini/git/dylan/worktrees/vestini-master/ac/build_with_spice/python_binding:/Users/claudiovestini/git/dylan/worktrees/vestini-master/dc/build_with_spice/python_binding:/Users/claudiovestini/git/dylan/worktrees/vestini-master/d/build_with_spice/python_binding /Users/claudiovestini/git/dylan/.venv/bin/python /Users/claudiovestini/git/talks/bifurcation-tracking/demos/corrector/check_dylan.py
```

## Playback

Both pages are opened paused, and the presenter starts each with the play button of the transport. At speed 1 a loop of the value clock is played in 8 s. The correction scene is played at speed 0.5, i.e. 16 s a loop, and the continuation scene at speed 0.25, i.e. 32 s a loop. In the deck the speed of each viewer is set from its slide, and the speed menu of the transport is needed only on a page opened alone, which is opened at speed 1. Each slide shows only the controls spoken to on it, which are chosen with the `--show` option of `tools/deck/embed_scene.py`, while the pages `correction.html` and `continuation.html` keep every control. A change of a tab or a toggle does not restart the clock. The presenter rewinds the viewer with the key 0, i.e. puts the clock back to its start, also right after a click on one of its tabs or switches. The convergence panel of the correction scene is drawn under a free aspect, with the two axes scaled separately. The diagram and the close-up of the continuation scene are drawn under a free aspect as well. In each of them, a unit of the continuation norm is as long across the panel as up it. The tangent of a pseudo-arclength step is thus drawn at a right angle to its constraint line.
