# Data of the talk

The numbers of the talk were computed with PyDyLAN, the Python bindings of DyLAN, on the worktree set `/Users/claudiovestini/git/dylan/worktrees/vestini-master/`, with every repository on its branch `vestini/master` and built in `build_with_spice/`. The commits are listed below.

| Repository | Folder | Commit |
|---|---|---|
| astrodynamics-core | `ac/` | `9805a78962c6793868b8587e5f2598182fb43179` |
| dylan-core | `dc/` | `76a692878f3167074117edb1bdd67cf245585148` |
| dylan | `d/` | `b6a8f0713acf3bea58b0734aa5f02f7febb06e4f` |
| TyCHO | `/Users/claudiovestini/git/tycho/code` on `main` | `1b256eef06dee7673e18a903bfed1d8c6a8e5f01` |

A script whose name ends in `_dylan.py` imports PyDyLAN, and it is run with the Python of the DyLAN workspace and the three builds on its path, as below.

```sh
PYTHONPATH=/Users/claudiovestini/git/dylan/worktrees/vestini-master/ac/build_with_spice/python_binding:/Users/claudiovestini/git/dylan/worktrees/vestini-master/dc/build_with_spice/python_binding:/Users/claudiovestini/git/dylan/worktrees/vestini-master/d/build_with_spice/python_binding /Users/claudiovestini/git/dylan/.venv/bin/python <script>
```

## Files

I computed the files in `stability/` with `stability/compute_stability_dylan.py`, which runs in about three minutes. Their content is the stability of the six branches of Broucke's families 7, 8 and 11, the curve of family 11 at periapsis through its fold, and the members of the frames demo and the corrector demo. It continues each branch with the support module `broucke_1969_support.py` of dylan-core, in `src/python_binding/python_support_files/`, with the targets and steps of the demonstration script `broucke_1969_stability_diagrams.py`. The fields, the conventions, and the checked marks are described in `stability/README.md`.

I computed `lyapunov/l1-lyapunov.json` with `lyapunov/lyapunov_family_dylan.py`, which runs in about 2 s. Its content is the Earth–Moon $\mathcal{L}_1$ Lyapunov family of the slide on Lyapunov and halo orbits, i.e. 101 members with their Jacobi constant, Broucke's coefficients $a_1$ and $a_2$, the in-plane index $k_1$, the out-of-plane index $k_2$, and the region, together with 14 orbits over one period. The script imports the dylan-core demonstration script `lyapunov_family_stability_diagram.py`, and it continues the family with `generate_lyapunov_family()`, takes the stability from `collect_family_stability()`, and finds the bifurcation with `find_bifurcation_energy()`. It prints the crossing of $k_2 = 2$ at $C = 3.174378$, the value pinned by the regression test `lyapunov_family_stability_regression_test.py` of dylan-core, and a largest symplecticity residual of $1.5 \times 10^{-9}$. The fields are described under the key `readme` of the file.

`pydylan_calls_dylan.py` is the code of slide 17, i.e. the PyDyLAN calls that continue family 11 at periapsis from its circular member by pseudo-arclength and compute the stability of the last member. Its continuation is cut short at 10 steps. I ran it once, and it printed $e = 0.04969$, $a_1 = -4491.27$, $a_2 = 11565.08$, and the region $\mathcal{H}^{++}$, consistent with the members at $e = 0.045$ and 0.05 in `stability/family-11-periapsis.json`.

`check-144.md` is the table of the check of the reproduction against Broucke's figures and text. The panel counts are from the DYLAN-504 investigation in `.claude/broucke_1969_investigation/` of the dylan-core checkout `/Users/claudiovestini/git/dylan/dc`, and the values of the reproduction are from `stability/`.

The polylines of the backdrops are in `../backdrops/broucke-families.json`, i.e. 12 members of each branch in the rotating-pulsating frame and the barycentric inertial frame. I wrote this file with `../backdrops/export_broucke_families.py`, run with `uv run --project /Users/claudiovestini/git/tycho/code python`, from the container `examples/broucke/broucke-input.tyd` of the TyCHO checkout above, whose SHA-256 is `763334cf42d7dd1712de1954c3318eab5ec7e3b4d060623e09bee824ed86dba5`. The frames are taken from `examples/broucke/build.py`. The format and units of the file are described under its `readme` key. I checked the inertial points of the file against the conversion `rotating_to_barycentric_inertial` of PyDyLAN, and the largest gap is $3 \times 10^{-5}$, the size of the rounding to five decimals.
