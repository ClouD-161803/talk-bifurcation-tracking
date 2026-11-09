"""Check the orbits of runs.json against DyLAN, on vestini/master of dylan-core.

Every converged correction of scene 1 and every member of scene 2 is checked. A Lyapunov orbit in the
CR3BP is solved again by the class Lyapunov, seeded with the orbit and with its x0 held. A member of
family 11 is propagated by the ER3BP and the RK54 of DyLAN, and its distance from the curve of DyLAN's
members is the minimum-norm Newton step in (x0, ydot0, e) that zeroes (y, xdot) at theta = pi. The
four references in the ER3BP at e = 0.3 are compared with EllipticPeriodicOrbit solves from the
circular seed, with two spacecraft revolutions for the Lyapunov case, whose circular seed has the
period pi. The members of family 11 at a tabulated e are compared with the CSV of the Broucke page. Run it
with the Python of DyLAN and the PYTHONPATH of README.md, after build.py has written runs.json.
"""

import json
import math
import pathlib
import time

import numpy as np
import pydylancore as dc

HERE = pathlib.Path(__file__).resolve().parent
CSV = pathlib.Path("/Users/claudiovestini/git/tycho/code/examples/broucke/data")
FOLD = pathlib.Path("/Users/claudiovestini/git/talks/bifurcation-tracking/data/stability/fold-family-11-periapsis.json")
TOLERANCE = 1e-12
FD_STEP = 1e-6
EL = dc.enum.StateElements


def bodies(mu):
    earth, moon = dc.Body("Earth"), dc.Body("Moon")
    moon.mass = earth.mass * mu / (1 - mu)
    return earth, moon


def propagate(earth, moon, e, theta0, x0, vy0, span, variational=False):
    system = dc.eom.ER3BP(earth, moon, max(float(e), 0.0))
    system.set_variational_mode(variational)
    rk54 = dc.integrators.RK54()
    rk54.tolerance = TOLERANCE
    rk54.set_eom(system)
    rk54.set_time(theta0, theta0 + span)
    state = np.array([x0, 0.0, 0.0, 0.0, vy0, 0.0])
    if variational:
        state = np.concatenate([state, np.eye(6).ravel()])
    return np.asarray(rk54.evaluate(state, True, False))


def symmetric_distance(earth, moon, e, theta0, x0, vy0, half=math.pi, free="x0"):
    """The residual (y, xdot) after the half period from a perpendicular crossing, and the largest component of the
    minimum-norm Newton step to DyLAN's orbit. The step is taken in (x0, ydot0) with free "x0", in (x0, ydot0, e)
    with free "e", and in (ydot0, half) with free "half", i.e. with x0 held and the period free, as in the CR3BP."""
    final = propagate(earth, moon, e, theta0, x0, vy0, half, True)
    r = final[[1, 3]]
    J = final[6:].reshape(6, 6)[np.ix_([1, 3], [4] if free == "half" else [0, 4])]
    if free == "e":
        plus = propagate(earth, moon, e + FD_STEP, theta0, x0, vy0, half)[[1, 3]]
        minus = propagate(earth, moon, e - FD_STEP, theta0, x0, vy0, half)[[1, 3]]
        J = np.column_stack([J, (plus - minus) / (2 * FD_STEP)])
    elif free == "half":
        plus = propagate(earth, moon, e, theta0, x0, vy0, half + FD_STEP)[[1, 3]]
        minus = propagate(earth, moon, e, theta0, x0, vy0, half - FD_STEP)[[1, 3]]
        J = np.column_stack([J, (plus - minus) / (2 * FD_STEP)])
    step = np.linalg.lstsq(J, -r, rcond=None)[0]
    return float(np.abs(r).max()), float(np.abs(step).max())


def lyapunov_resolve(eom, x0, vy0, period, C):
    """DyLAN's Lyapunov orbit through x0 at the Jacobi constant C, from the seed (x0, ydot0, period).
    Returns the gaps in ydot0, in the period, and in C."""
    orbit = dc.periodic_orbit.Lyapunov(eom, dc.enum.LibrationPoint.L1, np.array([x0, 0.0, 0.0, 0.0, vy0, 0.0]), period)
    info = dc.periodic_orbit.ContinuationParameterInfo()
    info.parameter_type = dc.enum.ParameterType.energy
    info.desired_value = -C / 2
    info.step_size = 1e-3
    info.min_step_size = 1e-10
    orbit.set_continuation_information(info)
    if orbit.solve_for_orbit() != dc.enum.OrbitGenerationResult.Success:
        return math.inf, math.inf, math.inf
    s = np.asarray(orbit.orbit_initial_state)
    assert s[0] == x0
    return abs(s[4] - vy0), abs(orbit.orbit_period - period), abs(-2 * orbit.orbit_energy - C)


def jacobi(mu, x, vy):
    r1, r2 = abs(x + mu), abs(x - 1 + mu)
    return x * x + 2 * (1 - mu) / r1 + 2 * mu / r2 - vy * vy


def elliptic_solve(earth, moon, seed, e, theta0, revolutions=1):
    """The member at e of the family through the circular seed (x0, ydot0, T), by EllipticPeriodicOrbit with one
    revolution of the primaries and ``revolutions`` of the spacecraft, and the members it records on the way, at
    steps of 0.005 in e."""
    orbit = dc.periodic_orbit.EllipticPeriodicOrbit(
        dc.eom.ER3BP(earth, moon, e), np.array([seed[0], 0, 0, 0, seed[1], 0]), seed[2], 1, revolutions, theta0
    )
    orbit.set_differential_corrector_information(
        np.array([EL.x, EL.vy]), np.array([EL.x, EL.z, EL.vy, EL.vz]), np.zeros(6), 6, 50, 1.0, 1e-12, False
    )
    orbit.integration_tolerance = TOLERANCE
    orbit.initial_true_anomaly = theta0
    info = orbit.get_continuation_parameters()
    info.continuation_method = dc.enum.ContinuationMethod.natural_parameter
    info.step_size = 0.005
    info.min_step_size = 1e-7
    orbit.set_continuation_information(info, 1000, 8)
    orbit.set_record_family(True)
    assert orbit.solve_for_orbit() == dc.enum.OrbitGenerationResult.Success
    family = orbit.get_orbit_family()
    members = {round(family[i].parameter_value, 9): np.asarray(family[i].initial_state)[[0, 4]] for i in range(len(family))}
    return np.asarray(orbit.orbit_initial_state)[[0, 4]], orbit.orbit_period, members


def csv_rows(name):
    data = np.genfromtxt(CSV / f"{name}.csv", delimiter=",", names=True)
    return {round(float(p), 9): np.array([x, vy]) for p, x, vy in zip(data["parameter"], data["x"], data["ydot"], strict=True)}


def table(header, rows):
    print("| " + " | ".join(header) + " |")
    print("|" + "---|" * len(header))
    for row in rows:
        print("| " + " | ".join(f"{v:.1e}" if isinstance(v, float) else str(v) for v in row) + " |")
    print()


def main():
    t_start = time.time()
    R = json.loads((HERE / "runs.json").read_text())
    print("pydylancore:", dc.__file__, "\n")
    mu_l, mu_f = R["mu"]["lyapunov"], R["mu"]["family11"]
    earth_l, moon_l = bodies(mu_l)
    earth_f, moon_f = bodies(mu_f)
    cr3bp = dc.eom.CR3BP(earth_l, moon_l)
    refs, systems = R["references"], R["systems"]

    print("References against EllipticPeriodicOrbit (e = 0.3) and against DyLAN's Lyapunov orbit (CR3BP):\n")
    rows, recorded = [], {}
    pair = {"lyapunov": (earth_l, moon_l), "family11": (earth_f, moon_f)}
    x0, vy0, T = refs["lyapunov"]["cr3bp"]
    gaps = lyapunov_resolve(cr3bp, x0, vy0, T, jacobi(mu_l, x0, vy0))
    rows.append(("lyapunov", "cr3bp", "Lyapunov", "-", gaps[0], gaps[1]))
    for case, (earth, moon) in pair.items():
        for system in ("peri", "apo"):
            e, theta0 = systems[system]["e"], systems[system]["theta0"]
            revolutions = 2 if case == "lyapunov" else 1
            state, period, members = elliptic_solve(earth, moon, refs[case]["cr3bp"], e, theta0, revolutions)
            recorded[(case, system)] = members
            ref = refs[case][system]
            rows.append((case, system, "EllipticPeriodicOrbit", abs(state[0] - ref[0]), abs(state[1] - ref[1]), abs(period - ref[2])))
    table(["case", "system", "DyLAN class", "x0 gap", "ydot0 gap", "period gap"], rows)

    print("Converged corrections of scene 1, against their reference and, when they land elsewhere, against DyLAN:\n")
    rows, elsewhere = {}, []
    for r in R["corrections"]:
        if not r["converged"]:
            continue
        case, system = r["case"], r["system"]
        ref = refs[case][system]
        n = r["node0"]
        gap = max(abs(n[0] - ref[0]), abs(n[1]), abs(n[2]), abs(n[3] - ref[1]))
        key = (case, system, r["targeting"])
        count, worst = rows.get(key, (0, 0.0))
        if gap < 1e-6:
            rows[key] = (count + 1, max(worst, gap))
        else:
            rows.setdefault(key, (0, 0.0))
            # the class Lyapunov does not take these orbits as seeds, since they are not Lyapunov orbits
            e, theta0 = systems[system]["e"], systems[system]["theta0"]
            earth, moon = pair[case]
            half = r["arc"] if r["targeting"] == "half" else r["arc"] / 2
            residual, dist = symmetric_distance(earth, moon, e, theta0, n[0], n[3], half, "half" if e == 0.0 else "x0")
            elsewhere.append((case, system, r["targeting"], r["S"], r["guess"], gap, 2 * half, residual, dist))
    table(["case", "system", "targeting", "runs on the reference", "largest gap to the reference"], [(*k, v[0], v[1]) for k, v in sorted(rows.items())])
    print("Converged runs that landed on another orbit, with their period and their distance to DyLAN's orbit:\n")
    table(["case", "system", "targeting", "S", "guess", "gap to the reference", "period", "residual (y, xdot)", "distance"], elsewhere)

    print("Members of scene 2 against DyLAN:\n")
    runs = [(f"{r['step']} {r['method']}", r["family"], r["members"]) for r in R["continuations"]]
    runs += [("the curve", family, members) for family, members in R["curves"].items()]
    rows = []
    for name, family, members in runs:
        if family == "lyapunov":
            g = np.array([lyapunov_resolve(cr3bp, Y[0], Y[1], 2 * Y[2], Y[3]) for Y in members])
            rows.append((family, name, len(members), "-", g[:, 0].max(), g[:, 1].max(), g[:, 2].max()))
        else:
            g = np.array([symmetric_distance(earth_f, moon_f, Y[2], 0.0, Y[0], Y[1], free="e") for Y in members])
            rows.append((family, name, len(members), g[:, 0].max(), g[:, 1].max(), "-", "-"))
    table(["family", "run", "members", "residual (y, xdot) at pi", "distance", "period gap", "C gap"], rows)

    print("Members of family 11 at a tabulated e, against the CSV of the Broucke page and the members of EllipticPeriodicOrbit:\n")
    csv = {"peri": csv_rows("family_11_periapsis"), "apo": csv_rows("family_11_apoapsis")}
    rows = []
    for system in ("cr3bp", "peri", "apo"):
        e = systems[system]["e"]
        ref = np.array(refs["family11"][system][:2])
        table_ = csv["apo" if system == "apo" else "peri"]
        rows.append((f"reference {system}", 1, float(np.abs(table_[round(e, 9)] - ref).max())))
    on_grid = []
    for _, family, members in runs:
        if family == "family11":
            for Y in members:
                e = round(max(Y[2], 0.0), 9)
                if abs(e / 0.005 - round(e / 0.005)) < 1e-6 and round(e, 9) in csv["peri"]:
                    on_grid.append((np.abs(csv["peri"][e] - np.array(Y[:2])).max(), e))
    rows.append(("members of scene 2", len(on_grid), max(g for g, _ in on_grid)))
    elliptic = [(np.abs(recorded[("family11", "peri")][e] - csv["peri"][e]).max()) for e in recorded[("family11", "peri")]]
    rows.append(("EllipticPeriodicOrbit members, 0 to 0.3", len(elliptic), max(elliptic)))
    table(["what", "states", "largest gap in (x0, ydot0) to the CSV"], rows)

    fold = json.loads(FOLD.read_text())["marks"]["fold"]["e"]
    top = max(max(Y[2] for Y in m) for _, f, m in runs if f == "family11")
    print(f"The largest e of family 11 is {top:.8f} in runs.json, and the fold is at e = {fold:.8f} in the stability data.\n")
    print(f"checked in {time.time() - t_start:.0f} s")


if __name__ == "__main__":
    main()
