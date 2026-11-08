"""Stability of the six branches of Broucke's families 7, 8 and 11, and the fold of family 11 at periapsis.

Each branch is continued in eccentricity by walk_branch() of broucke_1969_support.py, with the targets
and steps of the dataset of broucke_1969_stability_diagrams.py, and the stability of every member is
computed by PeriodicOrbitFamily.compute_member_stability(). The members are compared with the CSV files
of the TyCHO Broucke example, from which the Broucke page and the backdrops of the talk are drawn.

A pseudo-arclength continuation of EllipticPeriodicOrbit stops where the family turns back in e. The
curve of family 11 at periapsis through its fold is therefore continued here by pseudo-arclength on a
half-period shooting, with the ER3BP and the RK54 of PyDyLAN, and its members are passed to
compute_member_stability() as well.

The files family-<family>-<branch>.json, fold-family-11-periapsis.json, members.json, and marks.json
are written next to this script. Run it with the Python of the DyLAN workspace and the vestini/master
builds on PYTHONPATH, as data/README.md shows.
"""

import cmath
import json
import math
import pathlib
import time

import numpy as np

import pydylancore
from broucke_1969_support import (
    FAMILY_7_SEED,
    FAMILY_8_SEED,
    FAMILY_11_SEED,
    IN_PLANE,
    INTEGRATION_TOLERANCE,
    MASS_RATIO_7,
    MASS_RATIO_COPENHAGEN,
    NUMBER_OF_SEGMENTS,
    STATE_ELEMENTS,
    bodies_at_mass_ratio,
    walk_branch,
)

HERE = pathlib.Path(__file__).resolve().parent
TYCHO_CSV_DIRECTORY = pathlib.Path("/Users/claudiovestini/git/tycho/code/examples/broucke/data")
PERIOD = 2.0 * math.pi

# StateElements members are not accepted as NumPy indices
X, Y, VX, VY = (int(STATE_ELEMENTS.x), int(STATE_ELEMENTS.y), int(STATE_ELEMENTS.vx), int(STATE_ELEMENTS.vy))

# (family, seed, mass ratio, branches as (name, initial true anomaly in rad, target e, step in e)). the
# targets and steps are DATASET_TARGETS and FIGURES of broucke_1969_stability_diagrams.py
FAMILIES = (
    (7, FAMILY_7_SEED, MASS_RATIO_7, (("periapsis", 0.0, 0.50, 0.005), ("apoapsis", math.pi, 0.975, 0.005))),
    (8, FAMILY_8_SEED, MASS_RATIO_COPENHAGEN, (("periapsis", 0.0, 0.975, 0.005), ("apoapsis", math.pi, 0.85, 0.005))),
    (11, FAMILY_11_SEED, MASS_RATIO_COPENHAGEN, (("periapsis", 0.0, 0.453, 0.005), ("apoapsis", math.pi, 0.88, 0.0025))),
)

# the curve of family 11 at periapsis through its fold starts at the member at e = FOLD_CURVE_START and
# ends past the fold once e falls below FOLD_CURVE_END. FOLD_CURVE_STEP is the arclength step in
# (x0, ydot0, e), and FINITE_DIFFERENCE_STEP the step in e of the derivative of the shooting residual
FOLD_CURVE_START = 0.45
FOLD_CURVE_END = 0.4505
FOLD_CURVE_STEP = 2.5e-4
FINITE_DIFFERENCE_STEP = 1e-7


def pair(z):
    return [float(z.real), float(z.imag)]


def indices_from_coefficients(a1, a2):
    """Broucke's stability indices k1 and k2, i.e. the roots of `k**2 + a1*k + a2 - 2`.

    Real indices are returned in ascending order, and a complex pair with the negative imaginary part
    first. The root of larger magnitude is taken from the quadratic formula and the other from the
    product `k1*k2 = a2 - 2`, since a1 reaches about -5600 on family 11. Returns k1, k2, and the
    discriminant `a1**2 - 4*a2 + 8`, which is negative for a complex pair.
    """
    discriminant = a1 * a1 - 4.0 * (a2 - 2.0)
    if discriminant < 0.0:
        half_width = 0.5 * math.sqrt(-discriminant)
        return complex(-0.5 * a1, -half_width), complex(-0.5 * a1, half_width), discriminant
    larger = -0.5 * (a1 + math.copysign(math.sqrt(discriminant), a1))
    smaller = (a2 - 2.0) / larger if larger != 0.0 else 0.0
    return complex(min(larger, smaller)), complex(max(larger, smaller)), discriminant


def multipliers_of_index(k):
    """The multipliers lambda and 1/lambda whose sum is the index k, the one of modulus at least 1 first,
    and on the unit circle the one with a nonnegative imaginary part first."""
    root = cmath.sqrt(k * k - 4.0)
    candidates = (0.5 * (k + root), 0.5 * (k - root))
    larger = max(candidates, key=lambda z: (round(abs(z), 12), z.imag))
    return larger, 1.0 / larger


def stability_record(stability):
    """The coefficients, indices, multipliers, and region of a MemberStability, and the checks on them.

    The multipliers are the eigenvalues of the in-plane block of the monodromy matrix, ordered as the
    multiplier of k1 of modulus at least 1, its inverse, and the same pair of k2. The checks are the largest relative
    gap between an eigenvalue and its multiplier computed from k1 or k2, and the largest relative gap
    between k1 or k2 and the closest of the stability_indices of DyLAN. Raises RuntimeError when the
    horizontal Broucke point is undefined.
    """
    point = stability.horizontal
    if not point.is_defined():
        raise RuntimeError("the horizontal Broucke point is undefined")
    a1, a2 = point.first_coefficient, point.second_coefficient
    k1, k2, _ = indices_from_coefficients(a1, a2)
    targets = [*multipliers_of_index(k1), *multipliers_of_index(k2)]
    block = np.asarray(stability.monodromy_matrix)[np.ix_(IN_PLANE, IN_PLANE)]
    eigenvalues = list(np.linalg.eigvals(block))
    ordered, multiplier_gap = [], 0.0
    for target in targets:
        gaps = [abs(z - target) / max(1.0, abs(target)) for z in eigenvalues]
        nearest = int(np.argmin(gaps))
        multiplier_gap = max(multiplier_gap, gaps[nearest])
        ordered.append(eigenvalues.pop(nearest))
    dylan_indices = list(np.asarray(stability.stability_indices))
    index_gap = max(min(abs(d - k) for d in dylan_indices) / max(1.0, abs(k)) for k in (k1, k2))
    region = int(point.region)
    record = {
        "a1": a1,
        "a2": a2,
        "k": [pair(k1), pair(k2)],
        "multipliers": [pair(z) for z in ordered],
        "region": region,
        "region_name": point.region.name,
        "stable": region == 1,
        "symplecticity_residual": float(point.symplecticity_residual),
    }
    checks = {"multiplier_gap": multiplier_gap, "index_gap": index_gap}
    return record, checks


def branch_document(family_number, seed, mass_ratio, branch, initial_true_anomaly, target, step):
    """Continues one branch and computes the stability of every member. Returns the JSON document of
    the branch, the checks of every member, and the comparison with the CSV of the TyCHO example."""
    earth, moon = bodies_at_mass_ratio(mass_ratio)
    orbit = walk_branch(earth, moon, seed, initial_true_anomaly, target, step, require_success=False)
    family = orbit.get_orbit_family()
    members, checks = [], []
    for index in range(len(family)):
        member = family[index]
        system = pydylancore.eom.ER3BP(earth, moon, member.parameter_value)
        stability = family.compute_member_stability(index, system, integration_tolerance=INTEGRATION_TOLERANCE)
        record, check = stability_record(stability)
        members.append(
            {
                "index": index,
                "e": member.parameter_value,
                "theta0": initial_true_anomaly,
                "period": member.period,
                "state": [float(v) for v in member.initial_state],
                **record,
            }
        )
        checks.append(check)

    # columns of the CSV: e, energy, period, the six components of the initial state, iterations. the
    # members are compared at the values of e that both continuations reach
    rows = np.loadtxt(TYCHO_CSV_DIRECTORY / f"family_{family_number}_{branch}.csv", delimiter=",", skiprows=1)
    pairs = [(row, m) for m in members for row in rows if abs(row[0] - m["e"]) < 1e-9]
    comparison = {
        "tycho_members": len(rows),
        "dylan_members": len(members),
        "common_e_values": len(pairs),
        "largest_period_difference": max(abs(row[2] - m["period"]) for row, m in pairs),
        "largest_state_difference": max(float(np.max(np.abs(row[3:9] - m["state"]))) for row, m in pairs),
    }
    document = {
        "family": family_number,
        "branch": branch,
        "mu": mass_ratio,
        "theta0": initial_true_anomaly,
        "number_of_members": len(members),
        "members": members,
    }
    return document, checks, comparison


def region_runs(members):
    """The runs of one region along a branch, each with its first and last e and its member count."""
    runs = []
    for m in members:
        if runs and runs[-1]["region"] == m["region"]:
            runs[-1]["last_e"] = m["e"]
            runs[-1]["count"] += 1
        else:
            runs.append({"region": m["region"], "region_name": m["region_name"], "first_e": m["e"], "last_e": m["e"], "count": 1})
    return runs


def boundary_crossings(members):
    """The boundaries of Broucke's diagram that a branch crosses between consecutive members.

    A crossing is located by linear interpolation in e of the quantity that changes sign: the
    discriminant of indices_from_coefficients() for the parabola, and k - 2 or k + 2 for an index
    that passes 2 or -2.
    """
    crossings = []
    for before, after in zip(members, members[1:]):
        if before["region"] == after["region"]:
            continue
        values = []
        for m in (before, after):
            k1, k2, discriminant = indices_from_coefficients(m["a1"], m["a2"])
            side = {"parabola": discriminant}
            if discriminant >= 0.0:
                side.update({"k1 = 2": k1.real - 2.0, "k1 = -2": k1.real + 2.0, "k2 = 2": k2.real - 2.0, "k2 = -2": k2.real + 2.0})
            values.append(side)
        for name in values[0].keys() & values[1].keys():
            f_before, f_after = values[0][name], values[1][name]
            if f_before * f_after > 0.0:
                continue
            e = before["e"] + (after["e"] - before["e"]) * f_before / (f_before - f_after)
            crossings.append({"boundary": name, "e": e, "from_region": before["region"], "to_region": after["region"]})
    return crossings


class HalfPeriodShooting:
    """The symmetric members of family 11 at periapsis, i.e. orbits of period 2 pi in true anomaly that
    cross the x axis perpendicularly at f = 0 and at f = pi.

    The unknowns are u = (x0, ydot0, e), and the residual is (y, xdot) at f = pi, in the
    rotating-pulsating frame.
    """

    def __init__(self, mass_ratio):
        self.earth, self.moon = bodies_at_mass_ratio(mass_ratio)

    def propagate(self, u, variational):
        system = pydylancore.eom.ER3BP(self.earth, self.moon, float(u[2]))
        system.set_variational_mode(variational)
        rk54 = pydylancore.integrators.RK54()
        rk54.tolerance = INTEGRATION_TOLERANCE
        rk54.set_eom(system)
        rk54.set_time(0.0, math.pi)
        state = np.array([u[0], 0.0, 0.0, 0.0, u[1], 0.0])
        if variational:
            state = np.concatenate([state, np.eye(6).ravel()])
        return np.asarray(rk54.evaluate(state, True, False))

    def residual(self, u):
        return self.propagate(u, False)[[Y, VX]]

    def residual_and_jacobian(self, u):
        """The residual and its 2 x 3 Jacobian in u. The columns of x0 and ydot0 are taken from the STM,
        which PyDyLAN stores row by row after the state, and the column of e by central differences."""
        final = self.propagate(u, True)
        transition = final[6:].reshape(6, 6)
        rows = [Y, VX]
        shift = np.array([0.0, 0.0, FINITE_DIFFERENCE_STEP])
        de = (self.residual(u + shift) - self.residual(u - shift)) / (2.0 * FINITE_DIFFERENCE_STEP)
        jacobian = np.column_stack([transition[np.ix_(rows, [X, VY])], de])
        return final[rows], jacobian

    def correct(self, guess, normal, tolerance=1e-12, iteration_limit=20):
        """The member on the hyperplane through guess with the given normal, by Newton's method. Returns
        the member and its Jacobian, and raises RuntimeError when Newton's method does not converge."""
        u = np.array(guess, dtype=float)
        for _ in range(iteration_limit):
            residual, jacobian = self.residual_and_jacobian(u)
            constraint = np.append(residual, normal @ (u - guess))
            if np.max(np.abs(constraint)) < tolerance:
                return u, jacobian
            u = u - np.linalg.solve(np.vstack([jacobian, normal]), constraint)
        raise RuntimeError(f"the half-period corrector did not converge from {guess}")

    @staticmethod
    def tangent(jacobian, previous):
        """The unit tangent of the curve, oriented along previous. Its e component is proportional to the
        determinant of the x0 and ydot0 columns of the Jacobian, which changes sign at the fold."""
        t = np.cross(jacobian[0], jacobian[1])
        t /= np.linalg.norm(t)
        return -t if t @ previous < 0.0 else t

    def fold_function(self, u):
        _, jacobian = self.residual_and_jacobian(u)
        return np.cross(jacobian[0], jacobian[1])[2]

    def stability(self, u):
        """compute_member_stability() of the member u, in a family of one member built by hand."""
        member = pydylancore.periodic_orbit.PeriodicOrbitFamily.FamilyMember()
        member.parameter_value = float(u[2])
        member.period = PERIOD
        member.initial_state = np.array([u[0], 0.0, 0.0, 0.0, u[1], 0.0])
        family = pydylancore.periodic_orbit.PeriodicOrbitFamily("family 11 at periapsis through the fold")
        family.add_member(member)
        system = pydylancore.eom.ER3BP(self.earth, self.moon, float(u[2]))
        return family.compute_member_stability(
            0, system, number_of_trivial_unit_multipliers=0, initial_time=0.0, integration_tolerance=INTEGRATION_TOLERANCE
        )

    def k1(self, u):
        point = self.stability(u).horizontal
        return indices_from_coefficients(point.first_coefficient, point.second_coefficient)[0].real

    def bisect(self, ua, ub, function, iteration_limit=60, width=1e-11):
        """A zero of function on the curve between the members ua and ub, where function has opposite
        signs. Each midpoint of the chord is corrected onto the curve normal to the chord."""
        fa = function(ua)
        for _ in range(iteration_limit):
            chord = ub - ua
            if np.linalg.norm(chord) < width:
                break
            u, _ = self.correct(0.5 * (ua + ub), chord / np.linalg.norm(chord))
            fu = function(u)
            if fu * fa > 0.0:
                ua, fa = u, fu
            else:
                ub = u
        return 0.5 * (ua + ub)


def first_sign_change(values):
    for i in range(len(values) - 1):
        if values[i] * values[i + 1] <= 0.0:
            return i
    raise RuntimeError("the values do not change sign")


def fold_of_family_11(periapsis_document):
    """The curve of family 11 at periapsis through its fold, and the fold and the crossings of k1 = 2
    and k1 = -2 on it, each located by bisection along the curve."""
    shooting = HalfPeriodShooting(MASS_RATIO_COPENHAGEN)
    start = min(periapsis_document["members"], key=lambda m: abs(m["e"] - FOLD_CURVE_START))
    natural = np.array([start["state"][0], start["state"][4], start["e"]])
    u, jacobian = shooting.correct(natural, np.array([0.0, 0.0, 1.0]))
    start_gap = float(np.max(np.abs(u - natural)))
    t = shooting.tangent(jacobian, np.array([0.0, 0.0, 1.0]))
    curve = [(u, t)]
    while not (t[2] < 0.0 and u[2] < FOLD_CURVE_END):
        u, jacobian = shooting.correct(u + FOLD_CURVE_STEP * t, t)
        t = shooting.tangent(jacobian, t)
        curve.append((u, t))
        if len(curve) > 2000:
            raise RuntimeError("the curve through the fold did not come back to FOLD_CURVE_END")
    print(f"  {len(curve)} members on the curve through the fold", flush=True)

    points = []
    for u, t in curve:
        record, _ = stability_record(shooting.stability(u))
        points.append({"e": float(u[2]), "x0": float(u[0]), "ydot0": float(u[1]), "tangent_e": float(t[2]), **record})

    fold_index = first_sign_change([p["tangent_e"] for p in points])
    fold = shooting.bisect(curve[fold_index][0], curve[fold_index + 1][0], shooting.fold_function)
    fold_record, _ = stability_record(shooting.stability(fold))
    marks = {"fold": {"e": float(fold[2]), "x0": float(fold[0]), "ydot0": float(fold[1]), **fold_record}}
    k1_values = [p["k"][0][0] if p["k"][0][1] == 0.0 else math.nan for p in points]
    for name, value in (("k1 = 2", 2.0), ("k1 = -2", -2.0)):
        index = first_sign_change([k - value for k in k1_values])
        u = shooting.bisect(curve[index][0], curve[index + 1][0], lambda w, value=value: shooting.k1(w) - value)
        side = "before the fold" if index < fold_index else ("between the curve members around the fold" if index == fold_index else "past the fold")
        marks[name] = {"e": float(u[2]), "x0": float(u[0]), "ydot0": float(u[1]), "side": side, "k1": shooting.k1(u)}
    return {"points": points, "marks": marks, "start_gap_to_natural_member": start_gap}


def class_fold_of_family_11():
    """The largest e of the members that a pseudo-arclength continuation of EllipticPeriodicOrbit records
    from the circular seed of family 11 at periapsis, with steps of 0.001, before it stops at the fold."""
    earth, moon = bodies_at_mass_ratio(MASS_RATIO_COPENHAGEN)
    orbit = pydylancore.periodic_orbit.EllipticPeriodicOrbit(
        pydylancore.eom.ER3BP(earth, moon, 0.46), FAMILY_11_SEED, PERIOD, 1, 1, 0.0
    )
    orbit.set_differential_corrector_information(
        np.array([STATE_ELEMENTS.x, STATE_ELEMENTS.vy]),
        np.array([STATE_ELEMENTS.x, STATE_ELEMENTS.z, STATE_ELEMENTS.vy, STATE_ELEMENTS.vz]),
        np.zeros(6),
        NUMBER_OF_SEGMENTS,
        50,
        1.0,
        1e-10,
        False,
    )
    orbit.integration_tolerance = INTEGRATION_TOLERANCE
    orbit.initial_true_anomaly = 0.0
    info = orbit.get_continuation_parameters()
    info.continuation_method = pydylancore.enum.ContinuationMethod.pseudo_arc_length
    info.step_size = 0.001
    info.min_step_size = 1e-7
    orbit.set_continuation_information(info, 5000, 8)
    orbit.set_record_family(True)
    result = orbit.solve_for_orbit()
    family = orbit.get_orbit_family()
    eccentricities = [family[i].parameter_value for i in range(len(family))]
    return {"result": result.name, "members": len(eccentricities), "largest_e": max(eccentricities)}


def write_members_document(path, header, members):
    """A JSON document with the header fields first and one member per line."""
    text = json.dumps(header, indent=2)[:-2] + ',\n  "members": [\n'
    text += ",\n".join("    " + json.dumps(m) for m in members)
    path.write_text(text + "\n  ]\n}\n")


def member_entry(label, member, keys=("a1", "a2", "k", "multipliers", "region", "region_name", "stable")):
    return {"label": label, "e": member["e"], "theta0": 0.0, "period": PERIOD, "state": member["state"], **{k: member[k] for k in keys}}


def main():
    t0 = time.time()
    marks = {"branches": {}}
    documents = {}
    for family_number, seed, mass_ratio, branches in FAMILIES:
        for branch, initial_true_anomaly, target, step in branches:
            document, checks, comparison = branch_document(family_number, seed, mass_ratio, branch, initial_true_anomaly, target, step)
            documents[(family_number, branch)] = document
            members = document["members"]
            header = {key: value for key, value in document.items() if key != "members"}
            header = {"readme": "Fields, units, and frame are described in README.md next to this file.", **header}
            write_members_document(HERE / f"family-{family_number}-{branch}.json", header, members)
            marks["branches"][f"{family_number}-{branch}"] = {
                "members": len(members),
                "e_range": [members[0]["e"], members[-1]["e"]],
                "regions": region_runs(members),
                "crossings": boundary_crossings(members),
                "stable_members": sum(m["stable"] for m in members),
                "a1_minimum": min((m["a1"], m["e"]) for m in members),
                "a1_maximum": max((m["a1"], m["e"]) for m in members),
                "a2_minimum": min((m["a2"], m["e"]) for m in members),
                "a2_maximum": max((m["a2"], m["e"]) for m in members),
                "largest_multiplier_gap": max(c["multiplier_gap"] for c in checks),
                "largest_index_gap": max(c["index_gap"] for c in checks),
                "largest_symplecticity_residual": max(m["symplecticity_residual"] for m in members),
                "tycho_csv": comparison,
            }
            print(f"family {family_number:>2} {branch:9}: {len(members):4d} members to e = {members[-1]['e']:.4f}, {time.time() - t0:5.0f} s", flush=True)

    fold = fold_of_family_11(documents[(11, "periapsis")])
    print(f"fold of family 11 at periapsis at e = {fold['marks']['fold']['e']:.7f}, {time.time() - t0:5.0f} s", flush=True)
    class_fold = class_fold_of_family_11()
    print(f"EllipticPeriodicOrbit pseudo-arclength: largest e = {class_fold['largest_e']:.7f}, {time.time() - t0:5.0f} s", flush=True)
    marks["fold_family_11_periapsis"] = {
        **fold["marks"],
        "start_gap_to_natural_member": fold["start_gap_to_natural_member"],
        "class_pseudo_arclength": class_fold,
    }

    fold_header = {
        "readme": (
            "Family 11 at periapsis (mu = 0.5, theta0 = 0) continued by pseudo-arclength through its fold in e, "
            "from e = 0.45 before the fold to e = 0.4505 past it. Each point is a member of period 2 pi in true "
            "anomaly with the initial state (x0, 0, 0, 0, ydot0, 0) in the rotating-pulsating frame at theta = 0. "
            "tangent_e is the e component of the unit tangent of the curve in (x0, ydot0, e), positive before the "
            "fold and negative past it. The other fields are those of family-11-periapsis.json, described in README.md."
        ),
        "family": 11,
        "branch": "periapsis",
        "mu": MASS_RATIO_COPENHAGEN,
        "theta0": 0.0,
        "marks": fold["marks"],
    }
    write_members_document(HERE / "fold-family-11-periapsis.json", fold_header, fold["points"])

    fold_mark = fold["marks"]["fold"]
    fold_member = {**fold_mark, "state": [fold_mark["x0"], 0.0, 0.0, 0.0, fold_mark["ydot0"], 0.0]}
    members = {
        "readme": (
            "Members of family 11 and family 7 at periapsis, for the frames demo and the corrector demo. Each state "
            "is (x, y, z, xdot, ydot, zdot) in the rotating-pulsating frame, nondimensional, at the epoch theta = "
            "theta0 = 0, with the velocity as the derivative with respect to the true anomaly theta. Each period is "
            "in true anomaly and equals 2 pi, i.e. one revolution of the primary and the secondary. The units are "
            "those of the CSV files of the TyCHO Broucke example. Fields are described in README.md."
        ),
        "family_11_periapsis": {
            "mu": MASS_RATIO_COPENHAGEN,
            "members": [
                member_entry("circular seed", documents[(11, "periapsis")]["members"][0]),
                member_entry("fold", fold_member),
            ],
        },
        "family_7_periapsis": {
            "mu": MASS_RATIO_7,
            "members": [member_entry(f"e = {m['e']:.3f}", m) for m in documents[(7, "periapsis")]["members"]],
        },
    }
    (HERE / "members.json").write_text(json.dumps(members, indent=1) + "\n")
    (HERE / "marks.json").write_text(json.dumps(marks, indent=2) + "\n")
    print(f"wrote the stability data into {HERE} in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
