"""Computes the eigendirections of the monodromy matrix along an L1 Lyapunov orbit for the Floquet slide.

The orbit is the planar Earth-Moon L1 Lyapunov orbit at the Jacobi constant JACOBI. It is continued
in x0 from the last member of l1-lyapunov.json, written by lyapunov_family_dylan.py, with a
half-period corrector of its own, since the members of l1-lyapunov.json are smaller than this orbit. The
mass ratio mu is recovered from the position of L1 stored in the same file. The script does not
import DyLAN. As a check of the model, it recomputes the in-plane index k1 of two members of the
file and prints its relative difference from the value of DyLAN.

At a time t on the orbit, the unstable and stable directions are the eigenvectors of the monodromy
matrix Phi(t + T, t) of the multipliers lambda > 1 and 1/lambda, i.e. Phi(t) v for the eigenvectors
v of M = Phi(T). By Floquet's theorem, Phi(t) v = exp(alpha t) P(t) v. Hence each direction has
period T. The orbit and the directions are drawn in the projection (x, y, ydot) of the planar state,
with ydot scaled by VELOCITY_SCALE, and each direction is normalized in this projection. Run it as

    uv run --with numpy,scipy python data/lyapunov/eigendirections.py data/lyapunov/l1-lyapunov.json --deck index.html

which writes data/lyapunov/l1-eigendirections.json and the block id="eigendirections" of the deck,
read by the bundle of src/bundle.ts.
"""

import argparse
import json
import pathlib

import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq

# the Jacobi constant of the drawn orbit, nondimensional
JACOBI = 3.05
# the scale of ydot against x and y in the drawing
VELOCITY_SCALE = 0.4
# points of the orbit, spaced evenly in arclength in the drawing, and the number of them at which a
# segment along each direction is drawn
ORBIT_POINTS = 240
RIBS = 12
# the half width of a strip, in units of the largest |y| of the orbit
HALF_WIDTH = 0.32
TOLERANCE = 1e-13

README = (
    "The planar Earth-Moon L1 Lyapunov orbit at C = jacobi_constant and its unstable and stable "
    "directions, i.e. the eigenvectors of the monodromy matrix from each point of the orbit. "
    "Points are in the projection (x - x_L1, y, velocity_scale * ydot) of the rotating frame, divided "
    "by the largest |y| of the orbit, nondimensional. orbit holds the points, spaced evenly in "
    "arclength in this projection. Each strip holds the unit direction at every point of orbit, in "
    "the same projection, its half width, and ribs, the indices of the points at which a segment "
    "is drawn. multiplier is the eigenvalue of the monodromy matrix along the direction. Each "
    "record of arrows holds the id of its label and the point toward which it is drawn, here the Earth."
)


def libration_mass_ratio(x_l1):
    """The mass ratio mu at which L1 is at x_l1, measured from the barycenter, nondimensional."""
    def balance(mu):
        return x_l1 - (1 - mu) * (x_l1 + mu) / abs(x_l1 + mu) ** 3 - mu * (x_l1 - 1 + mu) / abs(x_l1 - 1 + mu) ** 3
    return brentq(balance, 1e-3, 0.1, xtol=1e-16)


def equations(mu):
    """The planar CR3BP in the rotating frame with its variational equations, for a state of 4 + 16 entries."""
    def rhs(t, s):
        x, y, vx, vy = s[:4]
        r1, r2 = np.hypot(x + mu, y), np.hypot(x - 1 + mu, y)
        a1, a2 = (1 - mu) / r1**3, mu / r2**3
        ax = 2 * vy + x - a1 * (x + mu) - a2 * (x - 1 + mu)
        ay = -2 * vx + y - a1 * y - a2 * y
        uxx = 1 - a1 - a2 + 3 * a1 * (x + mu) ** 2 / r1**2 + 3 * a2 * (x - 1 + mu) ** 2 / r2**2
        uyy = 1 - a1 - a2 + 3 * a1 * y**2 / r1**2 + 3 * a2 * y**2 / r2**2
        uxy = 3 * a1 * (x + mu) * y / r1**2 + 3 * a2 * (x - 1 + mu) * y / r2**2
        jacobian = np.array([[0, 0, 1, 0], [0, 0, 0, 1], [uxx, uxy, 0, 2], [uxy, uyy, -2, 0]])
        return np.concatenate([[vx, vy, ax, ay], (jacobian @ s[4:].reshape(4, 4)).ravel()])
    return rhs


def jacobi(mu, s):
    x, y, vx, vy = s[:4]
    return x**2 + y**2 + 2 * (1 - mu) / np.hypot(x + mu, y) + 2 * mu / np.hypot(x - 1 + mu, y) - vx**2 - vy**2


def flow(rhs, s0, t1, **kw):
    start = np.concatenate([s0, np.eye(4).ravel()])
    return solve_ivp(rhs, (0, t1), start, method="DOP853", rtol=TOLERANCE, atol=TOLERANCE, **kw)


def half_period(rhs, x0, vy0):
    """The time and the state with STM at the next crossing of y = 0 downward, from (x0, 0, 0, vy0) with vy0 > 0."""
    def crossing(t, s):
        return s[1]
    crossing.terminal, crossing.direction = True, -1
    sol = flow(rhs, np.array([x0, 0, 0, vy0]), 20.0, events=crossing)
    return sol.t_events[0][0], sol.y_events[0][0]


def correct(mu, rhs, x0, vy0, target=None):
    """A symmetric orbit from (x0, 0, 0, vy0), corrected in vy0 for xdot = 0 at the half period, or
    in x0 and vy0 for that and the Jacobi constant target. Returns x0, vy0, and the period."""
    for _ in range(40):
        t, s = half_period(rhs, x0, vy0)
        stm, f = s[4:].reshape(4, 4), rhs(t, s)[:4]
        # the derivatives of xdot at the crossing, along the change of the crossing time
        d_vx = stm[2] - f[2] / f[1] * stm[1]
        if target is None:
            residual = np.array([s[2]])
            jac = np.array([[d_vx[3]]])
        else:
            start = np.array([x0, 0, 0, vy0])
            residual = np.array([s[2], jacobi(mu, start) - target])
            grad = np.array([2 * x0 - 2 * (1 - mu) * (x0 + mu) / abs(x0 + mu) ** 3 - 2 * mu * (x0 - 1 + mu) / abs(x0 - 1 + mu) ** 3, -2 * vy0])
            jac = np.array([[d_vx[0], d_vx[3]], [grad[0], grad[1]]])
        if np.max(np.abs(residual)) < 1e-12:
            return x0, vy0, 2 * t
        step = np.linalg.solve(jac, -residual)
        if target is None:
            vy0 += step[0]
        else:
            x0, vy0 = x0 + step[0], vy0 + step[1]
    raise RuntimeError(f"the corrector did not converge from x0 = {x0}")


def monodromy_check(rhs, member):
    """The relative difference of k1 = lambda + 1/lambda of a member of the file from the value of DyLAN."""
    s = np.array(member["initial_state"])[[0, 1, 3, 4]]
    stm = flow(rhs, s, member["period"]).y[4:, -1].reshape(4, 4)
    lam = np.max(np.abs(np.linalg.eigvals(stm)))
    return abs(lam + 1 / lam - member["k1"]) / member["k1"]


def even_arclength(points, count):
    """Indices into points and the fractions toward the next point at count positions spaced evenly in arclength."""
    seg = np.linalg.norm(np.diff(points, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    targets = np.linspace(0, s[-1], count, endpoint=False)
    i = np.clip(np.searchsorted(s, targets, side="right") - 1, 0, len(seg) - 1)
    return i, (targets - s[i]) / seg[i]


def build(family_path):
    family = json.loads(family_path.read_text())
    x_l1 = family["libration_point"][0]
    mu = libration_mass_ratio(x_l1)
    rhs = equations(mu)
    checks = {m["index"]: monodromy_check(rhs, m) for m in (family["members"][family["bifurcation"]["index"]], family["members"][-1])}

    # natural-parameter continuation in x0 from the last member, away from L1, until C is below the target
    last = family["members"][-1]
    x0, vy0 = last["initial_state"][0], last["initial_state"][4]
    dx = x0 - family["members"][-2]["initial_state"][0]
    while jacobi(mu, np.array([x0, 0, 0, vy0])) > JACOBI:
        x0, vy0, _ = correct(mu, rhs, x0 + 16 * dx, vy0)
    x0, vy0, period = correct(mu, rhs, x0, vy0, target=JACOBI)

    fine = flow(rhs, np.array([x0, 0, 0, vy0]), period, t_eval=np.linspace(0, period, 20001))
    states, stms = fine.y[:4].T, fine.y[4:].T.reshape(-1, 4, 4)
    closure = np.linalg.norm(states[-1] - states[0])
    eigenvalues, vectors = np.linalg.eig(stms[-1])
    order = np.argsort(np.abs(eigenvalues))
    unstable, stable = order[-1], order[0]

    size = np.max(np.abs(states[:, 1]))
    drawn = np.column_stack([states[:, 0] - x_l1, states[:, 1], VELOCITY_SCALE * states[:, 3]]) / size
    i, f = even_arclength(drawn[:-1], ORBIT_POINTS)

    def at(values):
        return values[i] + f[:, None] * (values[i + 1] - values[i])

    orbit = at(drawn)
    strips, turns, closures = [], {}, {}
    for name, k, tone in (("unstable", unstable, "accent"), ("stable", stable, "violet")):
        v = vectors[:, k].real
        along = np.einsum("kij,j->ki", stms, v)
        along /= np.linalg.norm(along, axis=1)[:, None]
        # the direction at the end of the period is that at the start, since lambda > 0
        closures[name] = 1 - abs(along[-1] @ along[0])
        projected = np.column_stack([along[:, 0], along[:, 1], VELOCITY_SCALE * along[:, 3]])
        unit = at(projected)
        unit /= np.linalg.norm(unit, axis=1)[:, None]
        turns[name] = float(np.degrees(np.arccos(np.clip(np.abs(unit @ unit[0]), 0, 1))).max())
        strips.append({
            "id": name,
            "tone": tone,
            "multiplier": float(eigenvalues[k].real),
            "half_width": HALF_WIDTH,
            "ribs": [int(r) for r in np.linspace(0, ORBIT_POINTS, RIBS, endpoint=False).round()],
            "directions": np.round(unit, 5).tolist(),
        })

    document = {
        "readme": README,
        "mass_ratio": mu,
        "jacobi_constant": JACOBI,
        "period": period,
        "initial_state": [x0, 0.0, 0.0, vy0],
        "velocity_scale": VELOCITY_SCALE,
        "unit": size,
        "libration_point": [0.0, 0.0, 0.0],
        "orbit": np.round(orbit, 5).tolist(),
        "strips": strips,
        "arrows": [{"id": "Earth", "toward": [round((-mu - x_l1) / size, 5), 0.0, 0.0]}],
    }
    report = {
        "mu": mu,
        "k1 checks": checks,
        "period": period,
        "closure": closure,
        "multipliers": (eigenvalues[unstable].real, eigenvalues[stable].real),
        "product": eigenvalues[unstable].real * eigenvalues[stable].real,
        "direction closure": closures,
        "largest turn in deg": turns,
    }
    return document, report


def inject(page, text, block="eigendirections"):
    html = page.read_text()
    start = f'<script type="application/json" id="{block}">'
    i = html.index(start) + len(start)
    j = html.index("</script>", i)
    page.write_text(html[:i] + text + html[j:])


def main():
    parser = argparse.ArgumentParser(description=(__doc__ or "").split("\n", 1)[0])
    parser.add_argument("family", type=pathlib.Path, help="l1-lyapunov.json")
    parser.add_argument("--deck", type=pathlib.Path, help='also write the JSON into the block id="eigendirections" of this deck')
    args = parser.parse_args()
    document, report = build(args.family)
    text = json.dumps(document, separators=(",", ":"))
    (args.family.parent / "l1-eigendirections.json").write_text(text + "\n")
    if args.deck:
        inject(args.deck, text)
    for key, value in report.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
