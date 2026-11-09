# Figures of the talk

In this folder I put the figures of Broucke's families 7, 8, and 11, i.e. the figures I drew from DyLAN in `dylan/` and the crops of Broucke's papers in `broucke/`. The animation of the mass-ratio bridge is in `../data/bridge/` and is described at the end of this file. All paths below are relative to the talk folder.

## How the files were made

I computed every DyLAN file with PyDyLAN, the Python bindings of DyLAN, on the worktree set `/Users/claudiovestini/git/dylan/worktrees/vestini-master/`, with each repository on its branch `vestini/master`, clean, and built in `build_with_spice/`.

| Repository | Folder | Commit |
|---|---|---|
| astrodynamics-core | `ac/` | `9805a78962c6793868b8587e5f2598182fb43179` |
| dylan-core | `dc/` | `76a692878f3167074117edb1bdd67cf245585148` |
| dylan | `d/` | `b6a8f0713acf3bea58b0734aa5f02f7febb06e4f` |

The scripts reuse two demonstration scripts of dylan-core, `broucke_1969_stability_diagrams.py` and `broucke_1969_mass_ratio_bridge.py` in `src/python_binding/demonstration_scripts/`, and the support module `broucke_1969_support.py` in `src/python_binding/python_support_files/`. The scripts import the copies in `dc/build_with_spice/python_binding/`, which I checked to be identical to the sources. A script whose name ends in `_dylan.py` imports PyDyLAN, and the other scripts read only its archive. I ran them as below, with `ffmpeg` 9.0 from Homebrew and the LaTeX of MacTeX on the path.

```sh
export PYTHONPATH=/Users/claudiovestini/git/dylan/worktrees/vestini-master/ac/build_with_spice/python_binding:/Users/claudiovestini/git/dylan/worktrees/vestini-master/dc/build_with_spice/python_binding:/Users/claudiovestini/git/dylan/worktrees/vestini-master/d/build_with_spice/python_binding
export PATH=/Library/TeX/texbin:$PATH
/Users/claudiovestini/git/dylan/.venv/bin/python figures/family_tracks_dylan.py /tmp/family-tracks.npz            # about 2 min
uv run --with matplotlib,numpy python figures/draw_dylan_figures.py /tmp/family-tracks.npz figures/dylan          # about 20 s
uv run --with pymupdf,pillow,numpy python figures/crop_broucke.py /Users/claudiovestini/vault/_support/_pdfs/_articles figures/broucke
/Users/claudiovestini/git/dylan/.venv/bin/python data/bridge/bridge_dylan.py data/bridge/bridge.npz                # about 12 s
uv run --with matplotlib,numpy python data/bridge/draw_bridge.py data/bridge/bridge.npz data/bridge              # about 1 min
```

The archive `family-tracks.npz` is 50 MB, hence I did not keep it, and the first command above writes it again.

## `dylan/`

The files `family-<N>-<branch>-<frame>-<mode>.png` are the orbits of one branch in one frame, colored by the eccentricity $e$, with a colorbar in $e$. I computed them with `family_tracks_dylan.py`, which takes the seeds, the mass ratios, and the targets and steps in $e$ from `FIGURES` of `broucke_1969_stability_diagrams.py`, and calls `walk_branch()` of the support module and `coefficients_of_member()` and `branch_tracks()` of the demonstration script. The mass ratio is 0.012155 for family 7 and 0.5 for families 8 and 11. I drew four branches up to the last eccentricity of Broucke's orbit figure of the same branch. These eccentricities are $e$ = 0.975 for 7A (his Fig. 14), 0.85 for 8A (Fig. 17), 0.453 for 11P (Fig. 19), and 0.88 for 11A (Fig. 20). I drew 8P up to 0.97, one step short of his Fig. 16, for the reason given below. For 7A, 8P, and 11A these eccentricities are set in `ORBIT_TARGETS` of `family_tracks_dylan.py`, past the targets of the demonstration script, and for 8A and 11P they are the targets of the demonstration script. Broucke did not label the panels of 7P with $e$ (Fig. 13), and I drew this branch up to the target of the demonstration script, $e$ = 0.35. Between 27 and 36 members are drawn on each branch.

On 8P I left out Broucke's last member, at $e$ = 0.975, since the symplecticity residual of its monodromy matrix is 2.9 (see `../data/stability/README.md`), and the branch thus ends at 0.97. The closure error of the member at 0.97 over one period is $2.0 \times 10^{-6}$ in DyLAN, above the tolerance $10^{-6}$ of `verify_orbit()`, hence this branch is accepted without the check in `family_tracks_dylan.py`. I measured the gap between the two ends of each drawn track, which is $3.2 \times 10^{-8}$ DU for this member and below $4 \times 10^{-10}$ DU for all the other drawn members. On 7A, the agreement with Broucke's Table 13 is given in the comment on `DATASET_TARGETS` of the demonstration script as about $8 \times 10^{-5}$ in $\dot{y}_0$ up to $e$ = 0.955, growing to $4 \times 10^{-2}$ at 0.975, which I did not check. In the rotating-pulsating frame the member of 7A at $e$ = 0.975 is 75 DU wide, from $x = -8.5$ to 66. The coordinates of this frame are divided by the distance of the primary and the secondary, which is $1 - e$ at periapsis. The members of 7A below about $e$ = 0.6 are thus crowded near the two bodies in this figure.

The frame in the file name is one of five:

- `pulsating` is the rotating-pulsating frame $(x, y)$,
- `rotating` is the rotating frame $(\xi, \eta)$,
- `inertial` is the barycentric inertial frame $(X, Y)$,
- `inertial-m1` and `inertial-m2` are the inertial frames centered on the primary, $(X_1, Y_1)$, and on the secondary, $(X_2, Y_2)$.

The colormaps are those of the DYLAN-504 figures in `/Users/claudiovestini/vault/_support/_figures/DYLAN-504/`, i.e. viridis (rotating-pulsating), Blues_r (rotating), plasma (barycentric inertial), Reds_r (centered on the primary), and cividis (centered on the secondary), with $e$ divided by the larger target of the two branches. When the target of a branch is below this larger target, I marked it with a line on the colorbar.

The files `stability-family-<N>-<mode>.png` are the stability diagrams in the $(a_1, a_2)$ plane, with the trace of every other member of both branches, the boundaries $a_2 = a_1^2/4 + 2$ and $a_2 = \pm 2 a_1 - 2$, the names of Frauenfelder and Moreno for the stability regions of DyLAN, and the regions filled faintly in the colors of Fig. 4 of Zimovan-Spreen, Howell, and Davis (2019), as in the stability demo. The traces stop at the targets of the demonstration script, i.e. at $e$ = 0.75 on 7A, 0.30 on 8P, and 0.80 on 11A, hence the members past these targets are drawn only in the orbit figures. I placed each name at the point of its region farthest from the region border and from the labels of $e$. On family 11, $\mathcal H^{++}$ is not named, since it is too thin to hold a label in the window of the figure.

The mode is one of three. The `dark` and `light` files are drawn in the styles `styles/beeson-dark.mplstyle` and `styles/beeson-light.mplstyle` on a transparent background, for the classes `for-dark` and `for-light`. The `paper` files are drawn in the style of DYLAN-504 (Computer Modern through LaTeX, black on white, opaque), for the class `paper`. In dark mode I cut the dark end of each colormap until every color has a contrast of at least 3:1 with the background of the slide `#050505`. Every file is 2400 px wide, and I wrote them all with `draw_dylan_figures.py`.

## `broucke/`

The files in `broucke/` are crops at 300 dpi of two papers. The first is Fig. 4 on p. 1009 of the AIAA Journal paper, Broucke 1969, "Stability of periodic orbits in the elliptic, restricted three-body problem". The others are Figs. 13 to 20 of JPL Technical Report 32-1360, Broucke 1969, "Periodic orbits in the elliptic restricted three-body problem". I cut them with `crop_broucke.py` from rectangles taken from the vault note "numerical experiments in Broucke 1969". The paper, the PDF page, the figure, the branch, the frame, the eccentricities drawn, and the caption of each file are given in `broucke/INDEX.md`, together with the panels whose frame I was unsure of. The whole pages with their captions are in `broucke/pages/`.

## `../data/bridge/`

In the archive `bridge.npz` I stored the mass-ratio bridge of DYLAN-533, i.e. family 7A continued in the mass ratio $\mu$ from 0.012155 to 0.5, where it lands on family 8A. I computed it with `bridge_dylan.py`, which calls `bridge_at_eccentricity()` and `orbit_track()` of `broucke_1969_mass_ratio_bridge.py` at $e$ = 0, 0.1, 0.3, and 0.5. Each bridge has 26 members. At its two ends, $x_0$ and $\dot{y}_0$ differ from Broucke's rows of families 7A and 8A (Tables 13 and 15 of the report) by at most $3.1 \times 10^{-8}$ and $6.6 \times 10^{-8}$, respectively.

The videos `bridge-dark.mp4` and `bridge-light.mp4` are 20 s long at 30 frames per second, 1920 by 1080 px, and encoded with H.264. I drew them with `draw_bridge.py` in the beeson style of each mode. In each video the four orbits are drawn in the rotating-pulsating frame on the left, and $x_0$ and $\dot{y}_0$ against $\mu$ on the right, with Broucke's rows at the two ends. The video is held for 1.5 s on family 7A and for 3.5 s on family 8A. Between two members the orbit is interpolated linearly in $\mu$. The posters `bridge-dark.png` and `bridge-light.png` are the last frame of each video.
