"""Computes the mass-ratio bridge of DYLAN-533 for the backup slide of the talk.

The script imports pydylancore and the demonstration script broucke_1969_mass_ratio_bridge.py of
dylan-core, and calls its bridge_at_eccentricity() and orbit_track(). At each of the four
eccentricities of the script (0, 0.1, 0.3, and 0.5), family 7A is continued in the mass ratio from
0.012155 to 0.5, where it lands on family 8A. The archive holds, per eccentricity, the mass ratio,
x0, and ydot0 of every member, the orbit of every member in the rotating-pulsating frame resampled
to POINTS points by arc length from its start, and Broucke's rows of Tables 13 and 15. It is read
by draw_bridge.py, which does not import DyLAN. Run it with the venv of DyLAN and the builds of
vestini/master on the path, as given in figures/README.md.
"""

import json
import pathlib
import sys
import time

import numpy as np

import pydylancore

BINDING = pathlib.Path(pydylancore.__file__).resolve().parent
sys.path.insert(0, str(BINDING / "demonstration_scripts"))

import broucke_1969_mass_ratio_bridge as bridge  # noqa: E402

POINTS = 600


def resample(track):
    """The track at POINTS points equally spaced in arc length, from its first point to its last."""
    lengths = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(track, axis=0).T))])
    targets = np.linspace(0.0, lengths[-1], POINTS)
    return np.column_stack([np.interp(targets, lengths, track[:, k]) for k in range(2)])


def main():
    output = pathlib.Path(sys.argv[1])
    arrays, meta = {}, {"pydylancore": pydylancore.__file__, "eccentricities": [], "published": {}}
    for eccentricity in sorted(bridge.PUBLISHED):
        start = time.time()
        result = bridge.bridge_at_eccentricity(eccentricity)
        walk = result["walk"]
        key = f"e{eccentricity:.1f}"
        arrays[f"{key}_mass_ratio"] = np.array([m for m, _, _ in walk])
        arrays[f"{key}_x0"] = np.array([s[0] for _, s, _ in walk])
        arrays[f"{key}_ydot0"] = np.array([s[4] for _, s, _ in walk])
        arrays[f"{key}_tracks"] = np.array([resample(bridge.orbit_track(eccentricity, member)) for member in walk], dtype=np.float32)
        meta["eccentricities"].append(eccentricity)
        meta["published"][key] = bridge.PUBLISHED[eccentricity]
        meta[key] = {k: result[k] for k in ("eccentricity_walk", "mass_ratio_walk", "reached_mass_ratio", "residual_family_7", "residual_family_8")}
        print(
            f"e = {eccentricity}: {len(walk)} members to mu = {result['reached_mass_ratio']:.6f}, "
            f"residuals {result['residual_family_7']:.1e} (7A) and {result['residual_family_8']:.1e} (8A), {time.time() - start:.0f} s"
        )
    np.savez_compressed(output, meta=json.dumps(meta), **arrays)
    print(f"wrote {output}")


if __name__ == "__main__":
    main()
