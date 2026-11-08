"""Numerical checks of the frames scene, run on the written ``frames.tys``, ``frames.tyd``, and ``frames.html``.

Run it after ``build.py`` with the pytycho of the same checkout::

    uv run --project /Users/claudiovestini/git/tycho/code python check.py

It checks that the libration points stored as attributes satisfy their quintics and the equilibrium condition of
the CR3BP. With pytycho's evaluator, at several eccentricities, frame indices, and both clock channels, it checks
that the radius of every body in the rotating panel is rho(theta) times its radius in the pulsating panel. It
also checks that the clock channels t and theta of every track span one forcing period, and that the page is
within its size budget. It prints one line per check and exits with status 1 when any check fails.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

import pytycho as ty

HERE = Path(__file__).resolve().parent
TOL = 1e-12
# the float32 orbits are checked against Kepler's equation to this tolerance, a few float32 roundings of 2 pi
TOL_FLOAT32 = 4e-6
PAGE_BUDGET = 1.5e6
FRAMES_CHECKED = (0, 37, 100, 240, 333, 479)
BODIES = ("L1", "L2", "L3", "L4", "L5", "m1", "m2")
VIEWS = ("rotating-pulsating", "rotating", "barycentric-inertial")

failures: list[str] = []


def report(name: str, value: float, tol: float) -> None:
    ok = value <= tol
    print(f"{'ok  ' if ok else 'FAIL'} {name}: {value:.3g} (tolerance {tol:.0e})")
    if not ok:
        failures.append(name)


def quintics(mu: float) -> dict[str, tuple[np.ndarray, float, float]]:
    """The quintic of each collinear point in its distance gamma from the nearest primary, with x = origin + sign * gamma."""
    return {
        "L1": (np.array([1.0, -(3 - mu), 3 - 2 * mu, -mu, 2 * mu, -mu]), -1.0, 1 - mu),
        "L2": (np.array([1.0, 3 - mu, 3 - 2 * mu, -mu, -2 * mu, -mu]), 1.0, 1 - mu),
        "L3": (np.array([1.0, 2 + mu, 1 + 2 * mu, -(1 - mu), -2 * (1 - mu), -(1 - mu)]), -1.0, -mu),
    }


def gradient(mu: float, x: float, y: float) -> np.ndarray:
    """The gradient of the effective potential of the CR3BP, -(x, y) plus the two attractions, at (x, y)."""
    r1 = np.hypot(x + mu, y)
    r2 = np.hypot(x - 1 + mu, y)
    gx = x - (1 - mu) * (x + mu) / r1**3 - mu * (x - 1 + mu) / r2**3
    gy = y - (1 - mu) * y / r1**3 - mu * y / r2**3
    return np.array([gx, gy])


def check_libration_points(drivers: list[dict]) -> None:
    for ts in drivers:
        a = ts["attrs"]
        mu = a["mu"]
        worst_quintic = 0.0
        for name, (coefficients, sign, origin) in quintics(mu).items():
            gamma = sign * (a["x" + name] - origin)
            worst_quintic = max(worst_quintic, abs(np.polyval(coefficients, gamma)))
        report(f"{ts['id']}: quintic residual of L1, L2, and L3", worst_quintic, TOL)
        points = [(a["xL1"], 0.0), (a["xL2"], 0.0), (a["xL3"], 0.0), (a["xL45"], a["yL45"]), (a["xL45"], -a["yL45"])]
        worst = max(np.max(np.abs(gradient(mu, x, y))) for x, y in points)
        report(f"{ts['id']}: gradient of the effective potential at L1 to L5", worst, TOL)
        print(f"     {ts['id']}: mu = {mu}, L1 = {a['xL1']:.12f}, L2 = {a['xL2']:.12f}, L3 = {a['xL3']:.12f}")


def members(container: ty.Container, sid: str) -> list[dict[str, np.ndarray]]:
    offsets = container.view(f"{sid}/offsets")
    names = ("theta", "t", "rho")
    channels = {n: container.view(f"{sid}/channels/{n}") for n in names}
    e = container.view(f"{sid}/parameters/eccentricity")
    k = container.view(f"{sid}/parameters/K")
    out = []
    for i in range(len(offsets) - 1):
        rows = slice(int(offsets[i]), int(offsets[i + 1]))
        out.append({"e": float(e[i]), "K": float(k[i]), **{n: np.asarray(channels[n][rows], dtype=np.float64) for n in names}})
    return out


def theta_of_mean_anomaly(t: np.ndarray, e: float) -> np.ndarray:
    """The true anomaly at mean anomaly t, by Newton's method on Kepler's equation, independent of build.py."""
    eccentric = t.copy()
    for _ in range(50):
        eccentric -= (eccentric - e * np.sin(eccentric) - t) / (1 - e * np.cos(eccentric))
    return 2 * np.arctan2(np.sqrt(1 + e) * np.sin(eccentric / 2), np.sqrt(1 - e) * np.cos(eccentric / 2)) % (2 * np.pi)


def angle_error(a: np.ndarray, b: np.ndarray) -> float:
    d = (a - b + np.pi) % (2 * np.pi) - np.pi
    return float(np.max(np.abs(d)))


def check_clock(container: ty.Container, drivers: list[dict], orbits: list[dict]) -> None:
    span = spacing = rho = kepler = 0.0
    for ts in drivers:
        for m in members(container, ts["id"]):
            for c in ("theta", "t"):
                span = max(span, abs(m[c][0]), abs(m[c][-1] - 2 * np.pi * m["K"]))
                spacing = max(spacing, -float(np.min(np.diff(m[c]))))
            rho = max(rho, float(np.max(np.abs(m["rho"] - (1 - m["e"] ** 2) / (1 + m["e"] * np.cos(m["theta"]))))))
            kepler = max(kepler, angle_error(theta_of_mean_anomaly(m["t"], m["e"]), m["theta"]))
    report("driver sets: |t[0]|, |theta[0]|, and their distance from 2 pi K at the last sample", span, TOL)
    report("driver sets: largest decrease between two samples of t or theta (strictly increasing if negative)", spacing, 0.0)
    report("driver sets: rho against (1 - e^2) / (1 + e cos theta)", rho, TOL)
    report("driver sets: theta against Kepler's equation solved for the stored t", kepler, TOL)
    span = kepler = 0.0
    grids = []
    for ts in orbits:
        ms = members(container, ts["id"])
        grids.append([m["e"] for m in ms])
        for m in ms:
            for c in ("theta", "t"):
                span = max(span, abs(m[c][0]), abs(m[c][-1] - 2 * np.pi * m["K"]))
            kepler = max(kepler, angle_error(theta_of_mean_anomaly(m["t"], m["e"]), m["theta"]))
    report("orbit sets (float32): |t[0]|, |theta[0]|, and their distance from 2 pi K at the last sample", span, TOL_FLOAT32)
    report("orbit sets (float32): theta against Kepler's equation solved for the stored t", kepler, TOL_FLOAT32)
    same = all(
        np.array_equal([m["e"] for m in members(container, d["id"])], g) for d, g in zip(drivers, grids, strict=True)
    )
    report("eccentricity grids: 1 if a driver set and its orbit set differ, else 0", 0.0 if same else 1.0, 0.0)


def turned(angle: float, p: np.ndarray) -> np.ndarray:
    return np.array([np.cos(angle) * p[0] - np.sin(angle) * p[1], np.sin(angle) * p[0] + np.cos(angle) * p[1]])


def bodies_of(panel: dict) -> dict[str, np.ndarray]:
    return {layer["body"]: np.array(layer["position"]) for layer in panel["layers"] if layer["kind"] == "body"}


def check_radii(document: dict, container: ty.Container, drivers: list[dict]) -> None:
    steps = document["clock"]["steps"]
    radius = turn = chord = rest = formula = 0.0
    cases = 0
    for ts in drivers:
        system = ts["tags"]["system"]
        a = ts["attrs"]
        at_rest = {
            "L1": (a["xL1"], 0.0),
            "L2": (a["xL2"], 0.0),
            "L3": (a["xL3"], 0.0),
            "L4": (a["xL45"], a["yL45"]),
            "L5": (a["xL45"], -a["yL45"]),
            "m1": (-a["mu"], 0.0),
            "m2": (1 - a["mu"], 0.0),
        }
        ms = members(container, ts["id"])
        for m in (ms[0], ms[len(ms) // 2], ms[-1]):
            for channel in ("theta", "t"):
                for i in FRAMES_CHECKED:
                    state = json.loads(json.dumps(document["initial"]))
                    state["variables"] = {"system": system, "e": m["e"], "orbit": False}
                    state["clock"]["channel"] = channel
                    # the page opens with the inertial panel alone, hence the panels of the other two views are
                    # added here, as the presenter adds them from the Add panel group
                    state["panels"] = {view: {"view": view} for view in VIEWS}
                    state["layout"] = ty.split("col", 0.5, ty.split("row", 0.5, *VIEWS[:2]), VIEWS[2])
                    panels = ty.evaluate(document, container, state, i)["panels"]
                    pulsating = bodies_of(panels["rotating-pulsating"])
                    rotating = bodies_of(panels["rotating"])
                    inertial = bodies_of(panels["barycentric-inertial"])
                    # the reading of the fraction clock at frame i, its segment k and weight w (rule C4), and
                    # the driver's rho and theta blended there
                    c = m[channel]
                    reading = c[0] + (i / steps) * (c[-1] - c[0])
                    k = min(int(np.searchsorted(c, reading, side="right")) - 1, len(c) - 2)
                    w = (reading - c[k]) / (c[k + 1] - c[k])
                    rho = float(np.interp(reading, c, m["rho"]))
                    theta = float(np.interp(reading, c, m["theta"]))
                    formula = max(formula, abs(rho - (1 - m["e"] ** 2) / (1 + m["e"] * np.cos(theta))))
                    for b in BODIES:
                        p, r, q = pulsating[b][:2], rotating[b][:2], inertial[b][:2]
                        rest = max(rest, float(np.max(np.abs(p - at_rest[b]))))
                        radius = max(radius, abs(np.linalg.norm(r) - rho * np.linalg.norm(p)))
                        # rule C4: the two samples are turned and scaled first, and the results are blended
                        ends = [m["rho"][j] * turned(m["theta"][j], p) for j in (k, k + 1)]
                        turn = max(turn, float(np.max(np.abs(q - ((1 - w) * ends[0] + w * ends[1])))))
                        chord = max(chord, abs(np.linalg.norm(q) - np.linalg.norm(r)))
                    cases += 1
    print(f"     {cases} evaluated states: 2 systems, 3 eccentricities each, 2 clock channels, frame indices {FRAMES_CHECKED}")
    report("pulsating panel: the bodies against their positions in the rotating-pulsating frame", rest, TOL)
    report("rotating panel: |radius - rho(theta) times the pulsating radius|, rho blended as the runtime blends it", radius, TOL)
    report("inertial panel: the bodies against the two driver samples turned by theta, scaled by rho, and blended", turn, TOL)
    report("inertial panel: radius on the chord of rule C4 against the radius in the rotating panel, in DU", chord, 1e-4)
    report("rho blended between driver samples against the formula at the blended theta", formula, 2e-4)


def main() -> None:
    document = json.loads((HERE / "frames.tys").read_text())
    container = ty.Container((HERE / "frames.tyd").read_bytes())
    sets = [{"id": sid, **ts} for sid, ts in document["track_sets"].items()]
    drivers = [ts for ts in sets if ts.get("tags", {}).get("role") == "secondary"]
    orbits = [ts for ts in sets if ts.get("tags", {}).get("role") == "orbit"]
    check_libration_points(drivers)
    check_clock(container, drivers, orbits)
    check_radii(document, container, drivers)
    for name in ("frames.tys", "frames.tyd", "frames.html"):
        print(f"     {name}: {(HERE / name).stat().st_size / 1e3:.0f} kB")
    report("frames.html over the 1.5 MB budget, in MB", max(0.0, ((HERE / "frames.html").stat().st_size - PAGE_BUDGET) / 1e6), 0.0)
    if failures:
        sys.exit(f"{len(failures)} checks failed")
    print("all checks passed")


if __name__ == "__main__":
    main()
