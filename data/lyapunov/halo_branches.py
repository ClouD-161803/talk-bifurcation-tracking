"""Computes the two L1 Halo branches that leave the Lyapunov family at its pitchfork, for the
bifurcation diagram of the Lyapunov-to-halo slide.

A Halo orbit is symmetric about the x-z plane, hence it starts at a crossing of y = 0 with the
state (x0, 0, z0, 0, ydot0, 0) and is closed when xdot = zdot = 0 at the next crossing. The branch
is continued in z0 from the bifurcation member of l1-lyapunov.json, written by
lyapunov_family_dylan.py, with x0 and ydot0 corrected at each step, until the Jacobi constant is
below C_STOP. The other branch is the mirror image under z -> -z, with the same Jacobi constant and
multipliers. The mass ratio mu is recovered from the position of L1 stored in the same file, as in
eigendirections.py. The script does not import DyLAN. As a check of the model, it recomputes k1 and
k2 of three Lyapunov members of the file and prints their largest difference from DyLAN.

The stability indices k = lambda + 1/lambda of the two nontrivial pairs of multipliers are taken
from Broucke's coefficients of the monodromy matrix M, since the pair at 1 cannot be told apart
from a pair near 1 by the eigenvalues. With the trivial pair divided out, a1 = 2 - tr M and
a2 = s2 + 2 a1 - 1, where s2 is the sum of the principal 2 by 2 minors of M, and the indices are
the roots of k^2 + a1 k + a2 - 2 = 0. Run it as

    uv run --with numpy,scipy python data/lyapunov/halo_branches.py data/lyapunov/l1-lyapunov.json

which writes data/lyapunov/l1-halo.json, read by demos/stability/build.py.
"""

import argparse
import json
import pathlib

import numpy as np
from scipy.integrate import solve_ivp

from eigendirections import libration_mass_ratio

# the continuation stops at the first member below this Jacobi constant, the lower end of the axis
# of the plot, nondimensional
C_STOP = 3.1672
# the first z0 and the step in z0, nondimensional
Z_FIRST = 2e-3
Z_STEP = 1.5e-3
TOLERANCE = 1e-13

README = (
    "The two Earth-Moon L1 Halo branches that leave the Lyapunov family of l1-lyapunov.json at its "
    "pitchfork, computed without DyLAN by halo_branches.py. Units are the nondimensional units of the "
    "CR3BP, with x measured from the barycenter. Each member starts at a crossing of y = 0, at "
    "initial_state = (x0, 0, z0, 0, ydot0, 0), and its mirror image under z -> -z, with -z0, is the "
    "member of the other branch. jacobi_constant is C, and period the full period. k1 and k2 are the "
    "stability indices of the two nontrivial pairs of multipliers, k1 the large one, and region is "
    "the region of Broucke's diagram, 4 for doubly positive hyperbolic and 6 for elliptic and "
    "positive hyperbolic, as in l1-lyapunov.json. closure is the largest difference between the "
    "initial state and the state after one period."
)


def equations(mu):
    """The spatial CR3BP in the rotating frame, with the 6 by 6 STM appended to the state."""
    def rhs(t, s):
        x, y, z, vx, vy, vz = s[:6]
        r1 = np.sqrt((x + mu) ** 2 + y**2 + z**2)
        r2 = np.sqrt((x - 1 + mu) ** 2 + y**2 + z**2)
        a1, a2 = (1 - mu) / r1**3, mu / r2**3
        ax = 2 * vy + x - a1 * (x + mu) - a2 * (x - 1 + mu)
        ay = -2 * vx + y - a1 * y - a2 * y
        az = -a1 * z - a2 * z
        b1, b2 = 3 * a1 / r1**2, 3 * a2 / r2**2
        d = np.array([x + mu, y, z]), np.array([x - 1 + mu, y, z])
        # the Hessian of the effective potential
        hess = b1 * np.outer(d[0], d[0]) + b2 * np.outer(d[1], d[1]) - (a1 + a2) * np.eye(3)
        hess[0, 0] += 1
        hess[1, 1] += 1
        jac = np.zeros((6, 6))
        jac[:3, 3:] = np.eye(3)
        jac[3:, :3] = hess
        jac[3, 4], jac[4, 3] = 2, -2
        stm = s[6:].reshape(6, 6)
        return np.concatenate([[vx, vy, vz, ax, ay, az], (jac @ stm).ravel()])
    return rhs


def jacobi(mu, s):
    x, y, z, vx, vy, vz = s[:6]
    r1 = np.sqrt((x + mu) ** 2 + y**2 + z**2)
    r2 = np.sqrt((x - 1 + mu) ** 2 + y**2 + z**2)
    return x**2 + y**2 + 2 * (1 - mu) / r1 + 2 * mu / r2 - vx**2 - vy**2 - vz**2


def flow(rhs, s0, t1, **kw):
    start = np.concatenate([s0, np.eye(6).ravel()])
    return solve_ivp(rhs, (0, t1), start, method="DOP853", rtol=TOLERANCE, atol=TOLERANCE, **kw)


def half_period(rhs, s0):
    """The time and the state with STM at the next crossing of y = 0 downward, from s0 with ydot0 > 0."""
    def crossing(t, s):
        return s[1]
    crossing.terminal, crossing.direction = True, -1
    sol = flow(rhs, s0, 20.0, events=crossing)
    return sol.t_events[0][0], sol.y_events[0][0]


def correct(rhs, x0, z0, vy0):
    """A Halo orbit from (x0, 0, z0, 0, vy0, 0) with z0 held, corrected in x0 and vy0 for
    xdot = zdot = 0 at the half period. Returns x0, vy0, and the period."""
    for _ in range(40):
        t, s = half_period(rhs, np.array([x0, 0, z0, 0, vy0, 0]))
        stm, f = s[6:].reshape(6, 6), rhs(t, s)[:6]
        # the derivatives of xdot and zdot at the crossing, along the change of the crossing time
        rows = [stm[k] - f[k] / f[1] * stm[1] for k in (3, 5)]
        residual = np.array([s[3], s[5]])
        if np.max(np.abs(residual)) < 1e-12:
            return x0, vy0, 2 * t
        jac = np.array([[r[0], r[4]] for r in rows])
        step = np.linalg.solve(jac, -residual)
        x0, vy0 = x0 + step[0], vy0 + step[1]
    raise RuntimeError(f"the corrector did not converge at z0 = {z0}")


def indices(rhs, s0, period):
    """The stability indices k1 >= k2 of the nontrivial pairs, from Broucke's coefficients of the
    monodromy matrix, and the closure of the orbit after one period."""
    end = flow(rhs, s0, period).y[:, -1]
    m = end[6:].reshape(6, 6)
    trace = np.trace(m)
    s2 = (trace**2 - np.trace(m @ m)) / 2
    a1 = 2 - trace
    a2 = s2 + 2 * a1 - 1
    root = np.sqrt(complex(a1**2 - 4 * (a2 - 2)))
    k = sorted([(-a1 + root).real / 2, (-a1 - root).real / 2], reverse=True)
    return k, float(np.max(np.abs(end[:6] - s0)))


def region(k):
    """The region of Broucke's diagram for real indices above -2, 4 or 6 as in l1-lyapunov.json."""
    return 4 if min(k) > 2 else 6


def build(family_path):
    family = json.loads(family_path.read_text())
    mu = libration_mass_ratio(family["libration_point"][0])
    rhs = equations(mu)

    worst = 0.0
    for i in (0, family["bifurcation"]["index"], family["number_of_members"] - 1):
        member = family["members"][i]
        k, _ = indices(rhs, np.array(member["initial_state"]), member["period"])
        worst = max(worst, abs(k[0] - member["k1"]) / member["k1"], abs(k[1] - member["k2"]))

    start = family["members"][family["bifurcation"]["index"]]["initial_state"]
    x0, vy0 = start[0], start[4]
    members, history = [], []
    z0 = Z_FIRST
    while True:
        # the predictor extrapolates x0 and ydot0 linearly in z0 from the last two members
        if len(history) >= 2:
            (za, xa, va), (zb, xb, vb) = history[-2:]
            x0 = xb + (xb - xa) * (z0 - zb) / (zb - za)
            vy0 = vb + (vb - va) * (z0 - zb) / (zb - za)
        x0, vy0, period = correct(rhs, x0, z0, vy0)
        history.append((z0, x0, vy0))
        s0 = np.array([x0, 0, z0, 0, vy0, 0])
        k, closure = indices(rhs, s0, period)
        c = float(jacobi(mu, s0))
        members.append({
            "jacobi_constant": c,
            "z0": z0,
            "period": period,
            "initial_state": [float(v) for v in s0],
            "k1": k[0],
            "k2": k[1],
            "region": region(k),
            "closure": closure,
        })
        if c < C_STOP:
            break
        z0 += Z_STEP

    document = {
        "readme": README,
        "mass_ratio": mu,
        "bifurcation": family["bifurcation"],
        "members": members,
    }
    report = {
        "members": len(members),
        "C range": f"{members[0]['jacobi_constant']:.6f} to {members[-1]['jacobi_constant']:.6f}",
        "z0 range": f"{members[0]['z0']:.4f} to {members[-1]['z0']:.4f}",
        "k2 range": f"{min(m['k2'] for m in members):.5f} to {max(m['k2'] for m in members):.5f}",
        "regions": sorted({m["region"] for m in members}),
        "largest closure": f"{max(m['closure'] for m in members):.1e}",
        "largest difference of k1 (relative) or k2 from DyLAN": f"{worst:.1e}",
    }
    return document, report


def main():
    parser = argparse.ArgumentParser(description=(__doc__ or "").split("\n", 1)[0])
    parser.add_argument("family", type=pathlib.Path, help="l1-lyapunov.json")
    args = parser.parse_args()
    document, report = build(args.family)
    (args.family.parent / "l1-halo.json").write_text(json.dumps(document, indent=1) + "\n")
    for key, value in report.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
