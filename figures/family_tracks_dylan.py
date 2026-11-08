"""Computes the orbits and the stability traces of Broucke's families 7, 8 and 11 for the talk.

The script imports pydylancore and the demonstration script broucke_1969_stability_diagrams.py
of dylan-core, and reuses their settings and functions. From FIGURES it takes the seeds, the
mass ratios, and the eccentricity targets and steps. It calls walk_branch() for the
continuation, coefficients_of_member() for the stability coefficients, and branch_tracks() for
the conversion to the five frames. The archive it writes is read by draw_dylan_figures.py, which
does not import DyLAN. Run it with the venv of DyLAN and the builds of vestini/master on the
path, as given in figures/README.md.

For each family and branch, the drawn members (about 25, as in the demonstration script) are
stored in the five frames, together with the trace (e, a1, a2, region) of every other member.
A grid of the stability regions of DyLAN over the window of the stability diagram is stored for
each family. Three
branches are continued and drawn past the targets of FIGURES, to the eccentricities of
ORBIT_TARGETS, and their traces stop at the targets of FIGURES, as in the stability diagrams of
the demonstration script.
"""

import json
import math
import pathlib
import subprocess
import sys
import time

import numpy as np

import pydylancore

BINDING = pathlib.Path(pydylancore.__file__).resolve().parent
sys.path.insert(0, str(BINDING / "demonstration_scripts"))

import broucke_1969_stability_diagrams as diagrams  # noqa: E402
from broucke_1969_support import bodies_at_mass_ratio, walk_branch  # noqa: E402

# the frame names of the demonstration script, in the order of the Broucke page
FRAMES = ("pulsating", "rotating", "inertial", "geocentric", "selenocentric")
REGION_GRID = 360
# the eccentricity to which a branch is continued and drawn where it is past the target of
# FIGURES, i.e. the last one of Broucke's orbit figure of the branch (Figs. 14, 16 and 20 of his
# JPL report). on 8P the member at 0.975 is left out, since the symplecticity residual of its
# monodromy matrix is 2.9, hence the branch is drawn to 0.97
ORBIT_TARGETS = {("7", "apoapsis"): 0.975, ("8", "periapsis"): 0.97, ("11", "apoapsis"): 0.88}
# the last member of 8P closes over its period only to 2e-6, above the 1e-6 of verify_orbit(),
# hence its continuation is accepted without this check
UNVERIFIED = {("8", "periapsis")}


def checkout_commits():
    """The branch and the commit of astrodynamics-core, dylan-core, and dylan in the worktree set."""
    commits = {}
    for name in ("ac", "dc", "d"):
        root = BINDING.parents[2] / name
        git = ["git", "-C", str(root), "rev-parse"]
        commits[name] = {
            "path": str(root),
            "branch": subprocess.run(git + ["--abbrev-ref", "HEAD"], capture_output=True, text=True).stdout.strip(),
            "commit": subprocess.run(git + ["HEAD"], capture_output=True, text=True).stdout.strip(),
        }
    return commits


def trace_up_to(orbit, earth, moon, eccentricity):
    """The trace of trace_branch() over the members of a branch up to an eccentricity."""
    family = orbit.get_orbit_family()
    count = sum(family[k].parameter_value <= eccentricity + 1e-9 for k in range(len(family)))
    indices = sorted(set(range(0, count, diagrams.MEMBER_STRIDE)) | {count - 1})
    return np.array([diagrams.coefficients_of_member(orbit, index, earth, moon) for index in indices])


def region_grid(a1_window, a2_window):
    """The StabilityRegion number of DyLAN on a square grid of REGION_GRID points over the window."""
    classify = pydylancore.periodic_orbit.StabilityAnalysis.stability_region_from_coefficients
    a1 = np.linspace(*a1_window, REGION_GRID)
    a2 = np.linspace(*a2_window, REGION_GRID)
    grid = np.array([[int(classify(x, y)) for x in a1] for y in a2], dtype=np.int8)
    return a1, a2, grid


def main():
    output = pathlib.Path(sys.argv[1])
    output.parent.mkdir(parents=True, exist_ok=True)
    arrays = {}
    meta = {"pydylancore": pydylancore.__file__, "checkouts": checkout_commits(), "families": {}}
    for name, seed, mass_ratio, peri_target, apo_target, peri_step, apo_step, labels, windows in diagrams.FIGURES:
        start = time.time()
        earth, moon = bodies_at_mass_ratio(mass_ratio)
        family_meta = {"mass_ratio": mass_ratio, "labels": labels, "windows": windows, "branches": {}}
        branches = (("periapsis", 0.0, peri_target, peri_step), ("apoapsis", math.pi, apo_target, apo_step))
        for branch, anomaly, trace_target, step in branches:
            target = ORBIT_TARGETS.get((name, branch), trace_target)
            orbit = walk_branch(earth, moon, seed, anomaly, target, step, require_success=(name, branch) not in UNVERIFIED)
            trace = trace_up_to(orbit, earth, moon, trace_target)
            tracks = diagrams.branch_tracks(earth, moon, orbit, anomaly, FRAMES)
            key = f"f{name}_{branch}"
            arrays[f"{key}_trace"] = trace
            arrays[f"{key}_e"] = np.array([e for e, _ in tracks])
            for frame in FRAMES:
                pieces = [track[frame] for _, track in tracks]
                arrays[f"{key}_{frame}_points"] = np.concatenate(pieces)
                arrays[f"{key}_{frame}_offsets"] = np.cumsum([0] + [len(p) for p in pieces])
            family = orbit.get_orbit_family()
            last = family[len(family) - 1].parameter_value
            family_meta["branches"][branch] = {
                "initial_true_anomaly": anomaly,
                "target_eccentricity": target,
                "trace_eccentricity": trace_target,
                "step_size": step,
                "members": len(family),
                "last_eccentricity": last,
                "drawn_members": len(tracks),
            }
            print(f"family {name} {branch}: {len(family)} members to e = {last:.4f}, {len(tracks)} drawn, traced to e = {trace[-1, 0]:.4f}")
        a1, a2, grid = region_grid(*windows)
        arrays[f"f{name}_region_a1"], arrays[f"f{name}_region_a2"] = a1, a2
        arrays[f"f{name}_region_grid"] = grid
        meta["families"][name] = family_meta
        print(f"family {name}: {time.time() - start:.0f} s")
    np.savez_compressed(output, meta=json.dumps(meta), **arrays)
    print(f"wrote {output}")


if __name__ == "__main__":
    main()
