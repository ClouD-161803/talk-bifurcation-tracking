"""Writes the orbits of the L1 Lyapunov family and of its two Halo branches, for the 3D drawing of
the Lyapunov-to-Halo slide, which is moved by the clock of the plot of the same slide.

Each orbit is propagated from the initial state of its member in l1-lyapunov.json or l1-halo.json
over one period, and sampled at POINTS times spaced evenly over the period, from the crossing of
y = 0 at the initial state. Two members are thus morphed into each other point by point. The
Lyapunov family is split at the pitchfork into the members before it, elliptic out of the plane and
drawn violet as in the bifurcation diagram, and the members after it, hyperbolic and drawn orange.
The member at the pitchfork ends the first part and starts the second, and it starts both Halo
branches, the northern one with z0 > 0 and its mirror image under z -> -z. Every STRIDE-th Lyapunov
member is kept. Points are (x - x_L1, y, z) divided by the largest |y| of the family, nondimensional.
The script does not import DyLAN. Run it as

    uv run --with numpy,scipy python data/lyapunov/family_orbits.py data/lyapunov/l1-lyapunov.json --deck index.html

which writes data/lyapunov/l1-family-orbits.json and the block id="family-orbits" of the deck.
"""

import argparse
import json
import pathlib

import numpy as np
from scipy.integrate import solve_ivp

from eigendirections import inject, libration_mass_ratio

POINTS = 96
STRIDE = 3
TOLERANCE = 1e-11

README = (
    "The Earth-Moon L1 Lyapunov family of l1-lyapunov.json and its two Halo branches of l1-halo.json, "
    "as orbits sampled at evenly spaced times over one period from the initial state of each member. "
    "Each family holds the Jacobi constant C of its members in values, in the order of the clock of "
    "the plot, i.e. decreasing, and their orbits as points (x - x_L1, y, z) divided by unit, the "
    "largest |y| of the family, nondimensional. tone is the tone of the theme in which it is drawn, and "
    "every member of a family with ghost is drawn faint before the clock reaches it. "
    "The Lyapunov family is split at the pitchfork, whose member is the last of lyapunov-elliptic, the "
    "first of lyapunov-hyperbolic, and the first of both Halo branches."
)


def motion(mu):
    """The spatial CR3BP in the rotating frame."""
    def rhs(_, s):
        x, y, z, vx, vy, vz = s
        r1 = np.sqrt((x + mu) ** 2 + y**2 + z**2)
        r2 = np.sqrt((x - 1 + mu) ** 2 + y**2 + z**2)
        a1, a2 = (1 - mu) / r1**3, mu / r2**3
        return [vx, vy, vz,
                2 * vy + x - a1 * (x + mu) - a2 * (x - 1 + mu),
                -2 * vx + y - a1 * y - a2 * y,
                -a1 * z - a2 * z]
    return rhs


def orbit(rhs, state, period):
    """The positions at POINTS times spaced evenly over one period, and the distance from the start after it."""
    times = np.linspace(0, period, POINTS + 1)
    sol = solve_ivp(rhs, (0, period), state, method="DOP853", t_eval=times, rtol=TOLERANCE, atol=TOLERANCE)
    return sol.y[:3, :-1].T, float(np.max(np.abs(sol.y[:, -1] - state)))


def build(family_path):
    family = json.loads(family_path.read_text())
    halo = json.loads((family_path.parent / "l1-halo.json").read_text())
    x_l1 = family["libration_point"][0]
    mu = libration_mass_ratio(x_l1)
    rhs = motion(mu)
    members, pitch = family["members"], family["bifurcation"]
    c_pitch = pitch["jacobi_constant"]

    kept = [m for i, m in enumerate(members) if i % STRIDE == 0 or i == len(members) - 1]
    before = [m for m in kept if m["jacobi_constant"] > c_pitch]
    after = [m for m in kept if m["jacobi_constant"] < c_pitch and m["index"] != pitch["index"]]
    closures = []

    def sampled(m):
        state = np.array(m["initial_state"])
        points, closure = orbit(rhs, state, m["period"])
        closures.append(closure)
        return points

    root = sampled(members[pitch["index"]])
    lyapunov_before = [sampled(m) for m in before] + [root]
    lyapunov_after = [root] + [sampled(m) for m in after]
    north = [root] + [sampled(m) for m in halo["members"]]
    south = [p * np.array([1, 1, -1]) for p in north]
    halo_values = [c_pitch] + [m["jacobi_constant"] for m in halo["members"]]

    every = np.concatenate(lyapunov_before + lyapunov_after + north)
    unit = float(np.max(np.abs(every[:, 1])))

    def scaled(orbits):
        return [[[round((p[0] - x_l1) / unit, 4), round(p[1] / unit, 4), round(p[2] / unit, 4)] for p in o] for o in orbits]

    document = {
        "readme": README,
        "mass_ratio": mu,
        "unit": unit,
        "libration_point": [0.0, 0.0, 0.0],
        "families": [
            {"id": "lyapunov-elliptic", "tone": "violet", "values": [m["jacobi_constant"] for m in before] + [c_pitch], "orbits": scaled(lyapunov_before), "ghost": True},
            {"id": "lyapunov-hyperbolic", "tone": "accent", "values": [c_pitch] + [m["jacobi_constant"] for m in after], "orbits": scaled(lyapunov_after), "ghost": True},
            {"id": "halo-north", "tone": "violet", "values": halo_values, "orbits": scaled(north)},
            {"id": "halo-south", "tone": "violet", "values": halo_values, "orbits": scaled(south)},
        ],
    }
    report = {
        "orbits": f"{len(lyapunov_before)} + {len(lyapunov_after)} Lyapunov, {len(north)} per Halo branch, {POINTS} points each",
        "largest closure": f"{max(closures):.1e}",
        "unit": f"{unit:.5f}",
        "largest |z| / unit": f"{float(np.max(np.abs(every[:, 2]))) / unit:.3f}",
    }
    return document, report


def main():
    parser = argparse.ArgumentParser(description=(__doc__ or "").split("\n", 1)[0])
    parser.add_argument("family", type=pathlib.Path, help="l1-lyapunov.json")
    parser.add_argument("--deck", type=pathlib.Path, help='also write the JSON into the block id="family-orbits" of this deck')
    args = parser.parse_args()
    document, report = build(args.family)
    text = json.dumps(document, separators=(",", ":"))
    (args.family.parent / "l1-family-orbits.json").write_text(text + "\n")
    if args.deck:
        inject(args.deck, text, block="family-orbits")
    for key, value in report.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
