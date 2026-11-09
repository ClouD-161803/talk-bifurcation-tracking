"""Builds the correction scene (slides 11 and 12) and the continuation scene (slides 13 and 14) of the talk.

Run it with pytycho from the tycho checkout,

    uv run --project /Users/claudiovestini/git/tycho/code python build.py

which writes correction.html, correction.tys, and correction.tyd, the same three files of the
continuation scene, and runs.json, the members and the runs that check_dylan.py checks against
DyLAN. STORYBOARD.md describes what each scene shows. Every orbit is computed here by corrector.py.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

import pytycho as ty

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import corrector as c  # noqa: E402

MEMBERS = HERE.parent.parent / "data" / "stability" / "members.json"
CSV = Path("/Users/claudiovestini/git/tycho/code/examples/broucke/data/family_11_periapsis.csv")
TWO_PI = 2.0 * math.pi

# the mass ratio of each case. The Lyapunov case of scene 1 is the member of period pi of the Lyapunov family, and two
# laps of it take 2 pi, the period of the ER3BP
MU = {"lyapunov": 0.012155, "family11": 0.5}
FAMILIES = tuple(MU)
E = 0.3
# the eccentricity and the initial true anomaly of each system
SYSTEMS = {"cr3bp": (0.0, 0.0), "peri": (E, 0.0), "apo": (E, math.pi)}
TARGETINGS = ("half", "full")
SEGMENTS = (1, 4, 16)
# the scale error epsilon of each first guess
GUESSES = {"near": 0.001, "farther": 0.05}
MAX_ITERATIONS = 10

# the Jacobi constant of the Lyapunov orbit of period 2 pi, where the Lyapunov family of scene 2 ends,
# and the Jacobi constant past the last member of every arclength pen, at which the run of the gray curve is stopped
C_END = 2.9230742651998
C_CURVE_END = 2.918
LYAPUNOV_AMPLITUDE = 0.02
# the weights of the continuation norm, which are nonzero only on the two coordinates of the diagram of
# scene 2, i.e. x0 and C on the Lyapunov family and the launch velocity and e on family 11, each scaled by
# its range over the family. The norm is then the length in the diagram, and the tangent and the hyperplane
# of a pseudo-arclength step are a line and its normal in it. On the Lyapunov family a norm of the launch
# velocity and C lets the blue pen at the large step jump to an orbit of four times the period, and on
# family 11 a norm of x0 and e stalls it at the fold, where both are at an extremum
W_LYAPUNOV = np.array([1 / 0.157**2, 0.0, 0.0, 1 / 0.2309**2])
W_FAMILY11 = np.array([0.0, 1 / 0.313**2, 1 / 0.4539**2])
# the index in a member Y of the ordinate of the diagram of each family
ORDINATE = {"lyapunov": 0, "family11": 1}
# a corrected member lies at most this many step lengths from its predictor, which keeps a pen on its family
MAX_JUMP = 0.5
NATURAL_STEPS = {"lyapunov": {"small": 0.01, "medium": 0.025, "large": 0.05}, "family11": {"small": 0.025, "medium": 0.05, "large": 0.1}}
# both pens halve their step down to this fraction of the full step, and stop below it
MIN_STEP = 2.0**-14
# the arclength pen of family 11 stops on the second branch below this eccentricity, and the run of the gray family curve below the next
FAMILY11_RETURN = 0.40
FAMILY11_CURVE_RETURN = 0.36

# a mark without a color, e.g. a node, an arrow, or the scale bar, is drawn in the foreground of the theme of the viewer,
# hence in white over the dark background and in black over the light one
GRAY, RED, ORANGE, BLUE = "#8a93a6", "#e8414a", "#e69f00", "#56b4e9"
# the color of the arcs and of the convergence curve of the current run of scene 1, in both systems
TEAL = "#21918c"
# the opacity of the glow of the converged orbit of scene 1, drawn in TEAL, and its width in CSS pixels
GLOW, STILL_GLOW = 0.3, 15.0
# a body that a case does not show is parked this far out, outside every panel
FAR = 1.0e3
# the half width and the half height in n and in log10 ||F|| of a cross that marks a failed run in the
# convergence panel
CROSS_HALF, CROSS_TALL = 0.14, 0.45
# each defect is drawn with a red disc of DEFECT_DISC CSS pixels at its target, under the node of NODE_SIZE.
# a defect shorter than a pixel is thus still seen, as a red ring around its node or as a red dot
DEFECT_DISC, NODE_SIZE = 12, 8
# the length of the head of a velocity arrow, in CSS pixels
ARROWHEAD = 9
# the label of a failed run is drawn at the height FAIL_Y, above every cross and below the head of the panel,
# from the right tip of its cross. It is drawn from n = 1 at least, clear of the tick labels, and further left
# when its width in n, FAIL_WIDTH at the size of the panel on slide 12, would take it out of the panel
FAIL_Y, FAIL_WIDTH = 2.4, 6.0

# scene 1 timing, in units of the clock c: iterate 0 spans c from ZERO to 1, and iterate n >= 1 spans
# c from n to n + 1. In each iterate n >= 1, in turn, the close-up is moved to the target and the scale of the
# iterate up to MOVE_END, the arcs grow from SHOOT until they land at GROW, the velocity at the end of the arc
# is drawn at END_ARROW, the velocity required at the target at TARGET_ARROW, the defects grow from
# DEFECT_START to DEFECT_END, the point of the convergence curve appears at POINT, and the nodes slide from
# SLIDE. The arcs of iterate 0 grow from its start. Under the half period, the mirror image of the converged
# arc grows over MIRROR before the converged orbit lights up at LIGHT_HALF, and over the full period the
# orbit lights up at LIGHT_FULL. One loop of the clock lasts SECONDS at speed 1
ZERO = -2.0
START1, MOVE_END, SHOOT, GROW, END_ARROW, TARGET_ARROW = -2.3, 0.2, 0.22, 0.3, 0.42, 0.54
DEFECT_START, DEFECT_END, POINT, SLIDE = 0.68, 0.8, 0.8, 0.84
MIRROR, LIGHT_HALF, LIGHT_FULL, SECONDS = (0.68, 1.08), 1.14, 0.68, 14.0
END1 = MAX_ITERATIONS + 1.5
# iterate 0 of a run with S > 1 is staged instead: the arc and the defect of segment 0 grow in FIRST, while
# the other nodes are dim, the other arcs and defects grow together in REST, the nodes slide from
# STAGED_SLIDE to 1
FIRST, REST, STAGED_SLIDE = (-2.0, -1.05), (-0.95, -0.1), 0.1
# the nodes and the node arrows of iterate 0 start at DRAWN[0], before the loop, and the point of iterate 0
# of a run with S > 1 is added to its convergence curve at DRAWN[1], hence both are drawn from the first frame.
# a channel is stored in single precision, in which START1 is rounded above the first value of the clock,
# and a track that starts at START1 is thus hidden on the first frame
DRAWN = (START1 - 1.0, START1 - 0.1)
# a run with S = 1 opens on its node and its arrow alone. Its iterate 0 is played from GUESS on, hence its arc
# grows right after play, and the ends of its phases GROW, DEFECT_END, SLIDE, and 1 are reached at the offsets
# PACE0 from GUESS, about 3.8 s in all at speed 0.5, so that the arc, the arrows, and the defect can be named
# as each is drawn. Its iterates n >= 1 are played LEAD earlier
GUESS = START1 + 0.05
PACE0 = (0.0, 0.45, 1.45, 1.53, 1.85)
LEAD = 1.0 - (GUESS + PACE0[-1])
# the close-up of scene 1 is a flipbook of magnified copies of the orbit panel, fitted to the box of half side
# ZOOM_HALF and a margin, with the end of an iterate ZOOM_GAP from its target at the scale of the iterate. The scale
# is kept while the new gap is within ZOOM_KEEP of this distance. A move to the next target and scale is drawn in up
# to ZOOM_SLICES copies, about one per frame of the clock, with ZOOM_PER_DECADE copies per power of ten of the zoom
# and steps of the center of at most GLIDE_STEP. Every copy is clipped to CLOSE_CLIP, which covers the panel, and
# the fixed grid of the close-up is GRID_STEP apart. The samples of a growing mark that a copy has already drawn
# are spaced EPS apart
ZOOM_HALF, ZOOM_GAP, ZOOM_SLICES, EPS = 1.0, 0.6, 14, 1e-5
ZOOM_KEEP, ZOOM_PER_DECADE, GLIDE_STEP, GRID_STEP = (0.3, 0.9), 6, 0.08, 0.5
CLOSE_CLIP = (-4.0, 4.0, -3.0, 3.0)
# the scale of the close-up is shown by a scale bar at its lower left, from (BAR_X, BAR_Y) in the units of the
# close-up, with end ticks of half height BAR_TICK. Its length in LU is the largest of SCALE_VALUES, i.e. 1, 2, or 5
# times a power of ten, that is drawn at most BAR_MAX long, hence the bar is drawn from 0.4 to BAR_MAX long. Its
# label is drawn BAR_LABEL above its left end
BAR_X, BAR_Y, BAR_TICK, BAR_MAX, BAR_LABEL = -1.2, -1.02, 0.04, 1.0, 0.13
SCALE_VALUES = [m * 10.0**e for e in range(-16, 1) for m in (1, 2, 5)]
# the marks of the close-up that are drawn whole within a slice, and thinned to within SIMPLIFY of the close-up
STATIC_NEAR, SIMPLIFY = ("zoom_ref", "zoom_solution"), 0.005
# the requirement of the half period, i.e. the target on the axis and its vertical velocity
GREEN = "#7ad151"
# the clock span of one lap of the satellite on a converged orbit, about 1.7 s at speed 0.5
LAP = 0.85
GAP = 1e-3
# the gap of the ticker channels that a readout prints as integers, short enough that a frame does not fall in it
TICK_GAP = 1e-6
Y_TOP, Y_BOTTOM = 1.5, -15.5
SAMPLES_HALF, SAMPLES_FULL, SAMPLES_ORBIT = 110, 180, 240
# the target (x, 0, 0, ydot) of an end (x, y, xdot, ydot) under the half period, on the axis with a vertical velocity
ON_AXIS = np.array([1.0, 0.0, 0.0, 1.0])

# scene 2 timing: the sub-phases of one attempt, as fractions of its duration. A failed attempt is marked at
# CORRECTOR_START, when its corrector would start, and its red dot is removed when the next attempt starts
TANGENT_END, PREDICTOR_END, CONSTRAINT_START, CORRECTOR_START, MEMBER_AT = 0.15, 0.4, 0.4, 0.5, 0.9
START2, FLOOR, FIRST_ATTEMPT = -0.3, 0.25, 0.2
# an attempt that reaches the range of the parameter of the close-up lasts WINDOW_ATTEMPT before the stretch
WINDOW_ATTEMPT = 0.35
# each pen is stretched so that it ends its last attempt at LAST_END, and the end is held for HOLD2
LAST_END, HOLD2 = 26.0, 1.5
# the blue pen of family 11 is held for FOLD_HOLD in the attempt from the member whose tangent is closest to
# vertical, at the fraction HOLD_AT of the attempt, i.e. after its predictor and its constraint line are
# drawn and before its correction. Its last attempt ends FOLD_END_HOLD before the end of the loop. The time of
# both holds is taken from its attempts before the close-up, hence its attempts inside the close-up are as
# long as those of the other pens
FOLD_HOLD, HOLD_AT, FOLD_END_HOLD = 4.5, 0.45, 3.5
# the tangent and the constraint line of the blue pen are drawn in the violet of the dark theme of the deck,
# the color of tau_j on slide 14. The record of the orange pen on the tab "both" is drawn in ORANGE at an
# opacity of 0.5 over the dark background, since a head is drawn opaque. The record ends at its last member,
# without the dot of its stop, hence the red dots of the failed attempts of the blue pen are the only red at
# the fold
VIOLET, DIM_ORANGE = "#c94fe6", "#765203"
STEPS2 = 780
SAMPLES_MEMBER = 140
# the close-up of family 11 is centered on the tip of the fold and spans e from CLOSEUP_BELOW under it to
# as much over it, and the close-up of the Lyapunov family spans the first failed step of the natural pen
# at the medium step. Each is padded by WINDOW_PAD of the span of the curve in the ordinate. Its outline in the
# diagram is at least WINDOW_MIN CSS pixels wide and tall, and dashed in dashes of about WINDOW_DASH CSS pixels
CLOSEUP_BELOW, WINDOW_PAD, WINDOW_MIN, WINDOW_DASH = 0.0005, 0.15, 12.0, 4.0
# the size of each panel of scene 2 on slides 13 and 14 in CSS pixels, and the insets of the area in which
# its data are drawn from the left, the right, the bottom, and the top, which keep the data clear of the
# tick labels and the axis titles at the left and the bottom, and of the head of the panel at the top. The
# bottom inset of the orbit panel is raised, so that the line y = 0 is drawn above the y title
PANELS = {
    "diagram": ((290, 373), (48, 8, 40, 33)),
    "closeup": ((434, 373), (64, 8, 40, 33)),
    "orbits": ((730, 306), (48, 8, 56, 33)),
}
# the size in CSS pixels of the orbit panel of scene 1 on slides 11 and 12, and the height above its middle at
# which the line y = 0 is drawn, clear of the y title at the middle of its left edge
ORBIT_PANEL, TITLE_CLEAR = (398, 624), 12.0
# the step of the run of the gray curve, and of the run that replaces its members of family 11 within
# FINE_BELOW of the fold, which is fine enough for the close-up to show the two branches of the hairpin
CURVE_STEP, FINE_BELOW, FOLD_STEP = 0.01, 0.002, 1e-4


# numerics


def pin(index: int, value: float, n: int):
    """The extra equation Y[index] = value of :func:`corrector.newton`."""
    row = np.zeros(n)
    row[index] = 1.0
    return lambda Y: (Y[index] - value, row)


def jacobi_fun(model: c.Model):
    return lambda Y: c.symmetric_F(model, 0.0, Y, "jacobi", None)


def e_fun(model: c.Model, theta0: float):
    return lambda Y: c.symmetric_F(model, theta0, Y, "e", TWO_PI)


def lyapunov_seed() -> np.ndarray:
    """The small L1 Lyapunov orbit, Y = (x0, y'0, T/2, C), corrected from the linear orbit at x0 fixed."""
    model = c.Model(MU["lyapunov"])
    x0, vy0, half = c.linear_lyapunov(model.mu, LYAPUNOV_AMPLITUDE)
    Y = np.array([x0, vy0, half, float(model.jacobi(np.array([x0, 0.0, 0.0, vy0])))])
    iterates, _, ok = c.newton(jacobi_fun(model), Y, extra=pin(0, x0, 4))
    if not ok:
        raise SystemExit("the seed of the Lyapunov family did not converge")
    return iterates[-1]


def family11_seed() -> np.ndarray:
    """The member of family 11 at e = 0, Y = (x0, y'0, e), from members.json or else from the CSV of the Broucke page."""
    try:
        state = json.loads(MEMBERS.read_text())["family_11_periapsis"]["members"][0]["state"]
        x0, vy0 = state[0], state[4]
    except (OSError, KeyError, IndexError):
        row = np.genfromtxt(CSV, delimiter=",", skip_header=1, max_rows=1)
        x0, vy0 = row[3], row[7]
    model = c.Model(MU["family11"])
    iterates, _, ok = c.newton(e_fun(model, 0.0), np.array([x0, vy0, 0.0]), extra=pin(2, 0.0, 3))
    if not ok:
        raise SystemExit("the seed of family 11 did not converge")
    # the Newton step leaves e at a rounding error of about 1e-28, which a readout would print
    Y = iterates[-1].copy()
    Y[2] = 0.0
    return Y


def to_eccentricity(mu: float, Y0: np.ndarray, theta0: float) -> np.ndarray:
    """The member at e = E of the family continued in e at the period 2 pi from Y0 = (x0, y'0, 0)."""
    model = c.Model(mu)
    fam = c.continue_family(
        model,
        Y0,
        parameter="e",
        method="arclength",
        step=0.01,
        steps=400,
        theta0=theta0,
        period=TWO_PI,
        stop=lambda Y: "e = E was passed" if Y[-1] >= E else "",
    )
    if fam.members[-1][-1] < E:
        raise SystemExit(f"the family at mu = {mu}, theta0 = {theta0} stopped at e = {fam.members[-1][-1]:.4f}: {fam.stopped}")
    a, b = fam.members[-2], fam.members[-1]
    Y = a + (b - a) * (E - a[-1]) / (b[-1] - a[-1])
    iterates, _, ok = c.newton(e_fun(model, theta0), Y, extra=pin(2, E, 3), give_up=10.0)
    if not ok:
        raise SystemExit(f"the member at e = {E}, mu = {mu}, theta0 = {theta0} did not converge")
    return iterates[-1]


def references_job(case: str) -> dict:
    """The converged orbit (x0, y'0, T) of each system, from which scene 1 builds its first guesses."""
    mu = MU[case]
    if case == "lyapunov":
        # the member of period pi is the first member past the half period pi / 2, corrected at it
        half_period = math.pi / 2
        model = c.Model(mu)
        fam = c.continue_family(
            model,
            lyapunov_seed(),
            parameter="jacobi",
            method="natural",
            step=0.01,
            steps=400,
            weights=W_LYAPUNOV,
            direction=-1.0,
            max_jump=MAX_JUMP,
            stop=lambda Y: "the half period pi / 2 was passed" if Y[2] >= half_period else "",
        )
        if fam.members[-1][2] < half_period:
            raise SystemExit(f"the Lyapunov family stopped at the half period {fam.members[-1][2]}: {fam.stopped}")
        iterates, _, ok = c.newton(jacobi_fun(model), fam.members[-1], extra=pin(2, half_period, 4))
        if not ok:
            raise SystemExit(f"the Lyapunov orbit of period {2 * half_period} did not converge")
        x0, vy0, half, _ = iterates[-1]
        base = np.array([x0, vy0, 0.0])
        out = {"cr3bp": [x0, vy0, 2 * half]}
    else:
        base = family11_seed()
        out = {"cr3bp": [base[0], base[1], TWO_PI]}
    for system in ("peri", "apo"):
        Y = to_eccentricity(mu, base, SYSTEMS[system][1])
        out[system] = [Y[0], Y[1], TWO_PI]
    return {"case": case, "references": {k: [float(x) for x in v] for k, v in out.items()}}


# polylines


def spread(P: np.ndarray, n: int) -> np.ndarray:
    """n fractional sample indices along the polyline P (m, 2), spaced evenly in length plus turning angle, ends included."""
    if len(P) < 2:
        return np.zeros(1)
    seg = np.diff(P, axis=0)
    length = np.hypot(seg[:, 0], seg[:, 1])
    heading = np.arctan2(seg[:, 1], seg[:, 0])
    turn = np.r_[0.0, np.abs(np.angle(np.exp(1j * np.diff(heading))))]
    w = length / max(float(length.sum()), 1e-300)
    if turn.sum() > 1e-9:
        w = w + turn / turn.sum()
    sigma = np.r_[0.0, np.cumsum(w)]
    if sigma[-1] <= 0.0:
        return np.array([0.0, len(P) - 1.0])
    return np.interp(np.linspace(0.0, sigma[-1], max(n, 2)), sigma, np.arange(len(P), dtype=float))


def weight(P: np.ndarray) -> tuple[float, float]:
    """The length and the total turning angle of the polyline P (m, 2)."""
    if len(P) < 2:
        return 0.0, 0.0
    seg = np.diff(P, axis=0)
    heading = np.arctan2(seg[:, 1], seg[:, 0])
    return float(np.hypot(seg[:, 0], seg[:, 1]).sum()), float(np.abs(np.angle(np.exp(1j * np.diff(heading)))).sum())


def rows_at(idx: np.ndarray, A: np.ndarray) -> np.ndarray:
    grid = np.arange(len(A), dtype=float)
    return np.stack([np.interp(idx, grid, A[:, j]) for j in range(A.shape[1])], axis=1)


def orbit_polyline(model: c.Model, theta0: float, state: np.ndarray, period: float, n: int) -> tuple[np.ndarray, np.ndarray]:
    """The positions (n, 2) of one period of the orbit from ``state``, and the elapsed anomaly at each."""
    taus, X = c.orbit(model, theta0, state, period)
    idx = spread(X[:, :2], n)
    return rows_at(idx, X[:, :2]), np.interp(idx, np.arange(len(taus), dtype=float), taus)


def first_guess(model: c.Model, theta0: float, sol: np.ndarray, T: float, kind: str, S: int, eps: float) -> np.ndarray:
    """The S nodes sampled at equal steps of time over the targeted arc of the converged orbit, with each position
    scaled about the centroid of the orbit and each velocity by 1 + eps."""
    taus, X = c.orbit(model, theta0, sol, T)
    center = X[:-1, :2].mean(axis=0)
    arc = T / 2 if kind == "half" else T
    out = []
    for i in range(S):
        t = arc * i / S
        j = min(max(int(np.searchsorted(taus, t)), 1), len(taus) - 1)
        w = (t - taus[j - 1]) / (taus[j] - taus[j - 1])
        s = (1 - w) * X[j - 1] + w * X[j]
        g = s.copy()
        g[:2] = center + (1 + eps) * (s[:2] - center)
        g[2:] = (1 + eps) * s[2:]
        out.append(g)
    return np.array(out)


def correction_job(job: tuple) -> dict:
    """One run of scene 1, with the arcs of every iterate thinned for drawing."""
    case, system, targeting, S, guess, ref = job
    t_start = time.time()
    mu = MU[case]
    e, theta0 = SYSTEMS[system]
    eps = GUESSES[guess]
    model = c.Model(mu, e)
    sol = np.array([ref[0], 0.0, 0.0, ref[1]])
    T = ref[2]
    free = e == 0.0
    t = c.Targeting(model, targeting, T * (1 + eps) if free else T, theta0=theta0, period_free=free, fixed_x0=sol[0] if free else None)
    run = c.correct(t, first_guess(model, theta0, sol, T, targeting, S, eps), max_iterations=MAX_ITERATIONS)
    total = SAMPLES_HALF if targeting == "half" else SAMPLES_FULL
    iterates = []
    for it in run.iterates:
        dt = it.arc / S
        sizes = [weight(it.samples[i][:, :2]) for i in range(S)]
        lengths, turns = sum(x[0] for x in sizes), sum(x[1] for x in sizes)
        segments = []
        for i in range(S):
            share = sizes[i][0] / max(lengths, 1e-300) + (sizes[i][1] / turns if turns > 1e-9 else 0.0)
            idx = spread(it.samples[i][:, :2], max(6, round(total * share / 2)))
            xy = rows_at(idx, it.samples[i][:, :2])
            tau = np.interp(idx, np.arange(len(it.taus), dtype=float), it.taus)
            segments.append((xy, tau / dt, theta0 + i * dt + tau))
        iterates.append({"nodes": it.nodes, "ends": it.ends, "norm": it.norm, "arc": it.arc, "segments": segments})
    solution = None
    if run.converged:
        # the still orbit is joined from the converged segments, each flown from its own node, and under the half
        # period from their mirror image. A single flight over the period from x0 would amplify the residual of x0
        # by the monodromy matrix, about 1e6 for the two laps of the Lyapunov orbit in the ER3BP, and its end would be
        # drawn a scale bar away from x0 in the close-up
        last = run.iterates[-1]
        period = 2 * last.arc if targeting == "half" else last.arc
        dt = last.arc / S
        X = np.concatenate([last.samples[i][1 if i else 0 :, :2] for i in range(S)])
        tau = np.concatenate([i * dt + last.taus[1 if i else 0 :] for i in range(S)])
        if targeting == "half":
            X = np.r_[X, X[-2::-1] * np.array([1.0, -1.0])]
            tau = np.r_[tau, 2 * last.arc - tau[-2::-1]]
        idx = spread(X, SAMPLES_ORBIT)
        P, tau = rows_at(idx, X), np.interp(idx, np.arange(len(tau), dtype=float), tau)
        solution = (P, tau / period, theta0 + tau)
    return {
        "key": (case, system, targeting, S, guess),
        "converged": run.converged,
        "failure": run.failure,
        "iterates": iterates,
        "solution": solution,
        "seconds": time.time() - t_start,
    }


def family_model(family: str, Y: np.ndarray) -> tuple[c.Model, np.ndarray, float]:
    """The model, the initial state, and the period of the member Y of a family."""
    if family == "lyapunov":
        return c.Model(MU[family]), np.array([Y[0], 0.0, 0.0, Y[1]]), 2.0 * Y[2]
    return c.Model(MU[family], Y[2]), np.array([Y[0], 0.0, 0.0, Y[1]]), TWO_PI


def run_family(family: str, seed: np.ndarray, method: str, step: float, *, curve: bool = False) -> c.Family:
    """One continuation run of scene 2, or with ``curve`` the fine run drawn as the gray family curve."""
    min_step = 1e-6 if curve else step * MIN_STEP
    if family == "lyapunov":
        model, W = c.Model(MU[family]), W_LYAPUNOV
        kw = {"parameter": "jacobi", "weights": W, "direction": -1.0, "min_step": min_step}
        if method == "natural":
            return c.continue_family(model, seed, method="natural", step=step, steps=400, end=C_END, max_jump=MAX_JUMP, **kw)
        last = C_CURVE_END if curve else C_END
        return c.continue_family(
            model,
            seed,
            method="arclength",
            step=step,
            steps=600,
            max_jump=MAX_JUMP,
            stop=lambda Y: "C passed the end" if Y[-1] <= last else "",
            **kw,
        )
    model, W = c.Model(MU[family]), W_FAMILY11
    kw = {"parameter": "e", "weights": W, "direction": 1.0, "period": TWO_PI, "theta0": 0.0, "min_step": min_step}
    if method == "natural":
        return c.continue_family(model, seed, method="natural", step=step, steps=400, max_jump=MAX_JUMP, **kw)
    floor = FAMILY11_CURVE_RETURN if curve else FAMILY11_RETURN
    top = [0.0]

    def returned(Y):
        top[0] = max(top[0], Y[-1])
        return "the second branch was reached" if Y[-1] < floor and top[0] > Y[-1] + 0.01 else ""

    return c.continue_family(model, seed, method="arclength", step=step, steps=600, max_jump=MAX_JUMP, stop=returned, **kw)


def with_fine_fold(members: list[np.ndarray]) -> list[np.ndarray]:
    """The gray curve of family 11 with its members around the fold replaced by a run at the step FOLD_STEP."""
    e = np.array([Y[-1] for Y in members])
    top = int(e.argmax())
    lo = float(e[top]) - FINE_BELOW
    a = max(i for i in range(top) if e[i] < lo)
    b = min(i for i in range(top, len(members)) if e[i] < lo)
    highest = [lo]

    def below(Y):
        highest[0] = max(highest[0], Y[-1])
        return "the curve left the fold" if Y[-1] < lo < highest[0] else ""

    kw = {"parameter": "e", "weights": W_FAMILY11, "direction": 1.0, "period": TWO_PI, "theta0": 0.0, "min_step": 1e-9}
    fine = c.continue_family(c.Model(MU["family11"]), members[a], method="arclength", step=FOLD_STEP, steps=2000, max_jump=MAX_JUMP, stop=below, **kw)
    return members[:a] + fine.members + members[b:]


def continuation_job(job: tuple) -> dict:
    """One pen of scene 2, or the gray family curve when the step name is "curve"."""
    family, step_name, method, seed = job
    t_start = time.time()
    W = W_LYAPUNOV if family == "lyapunov" else W_FAMILY11
    if step_name == "curve":
        fam = run_family(family, seed, "arclength", CURVE_STEP, curve=True)
        members = with_fine_fold(fam.members) if family == "family11" else fam.members
        return {"key": (family, "curve", "arclength"), "members": members, "stopped": fam.stopped, "seconds": time.time() - t_start}
    step = NATURAL_STEPS[family][step_name]
    if method == "arclength":
        step *= math.sqrt(W[-1])
    fam = run_family(family, seed, method, step)
    orbits = []
    for Y in fam.members:
        model, state, period = family_model(family, Y)
        orbits.append(orbit_polyline(model, 0.0, state, period, SAMPLES_MEMBER)[0])
    steps = [
        {
            "start": s.start,
            "tangent": s.tangent,
            "predictor": s.predictor,
            "iterates": s.iterates,
            "converged": s.member is not None,
            "size": s.size,
        }
        for s in fam.steps
    ]
    return {
        "key": (family, step_name, method),
        "members": fam.members,
        "steps": steps,
        "stopped": fam.stopped,
        "orbits": orbits,
        "seconds": time.time() - t_start,
    }


# drawing helpers


def inside(P: np.ndarray, box: tuple[float, float, float, float]) -> np.ndarray:
    x0, x1, y0, y1 = box
    return (P[:, 0] >= x0) & (P[:, 0] <= x1) & (P[:, 1] >= y0) & (P[:, 1] <= y1)


def clamp(P: np.ndarray, box) -> np.ndarray:
    x0, x1, y0, y1 = box
    return np.stack([np.clip(P[:, 0], x0, x1), np.clip(P[:, 1], y0, y1)], axis=1)


def increasing(cc: np.ndarray) -> np.ndarray:
    """A mask that keeps the samples at which the clock channel strictly increases."""
    keep = np.ones(len(cc), dtype=bool)
    last = cc[0]
    for i in range(1, len(cc)):
        if cc[i] > last + 1e-7:
            last = cc[i]
        else:
            keep[i] = False
    return keep


def lowered(box) -> tuple[float, float, float, float]:
    """The box extended downward until the camera of the orbit panel of scene 1, fitted to it at the equal
    aspect, draws y = 0 TITLE_CLEAR px above the middle of the panel."""
    (width, height), (x0, x1, y0, y1) = ORBIT_PANEL, box
    for _ in range(3):
        per_px = 2.2 * max((x1 - x0) / 2 * height / width, (y1 - y0) / 2) / height
        y0 = min(y0, -2 * TITLE_CLEAR * per_px - y1)
    return x0, x1, y0, y1


def widened(box) -> tuple[float, float, float, float]:
    """The box widened about its middle to the aspect of the orbit panel of scene 1, i.e. the area that the
    camera fitted to the box shows inside the margin of a tenth that it adds."""
    (width, height), (x0, x1, y0, y1) = ORBIT_PANEL, box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    half = max((x1 - x0) / 2 * height / width, (y1 - y0) / 2)
    return cx - half * width / height, cx + half * width / height, cy - half, cy + half


def box_of(points: list[np.ndarray], margin: float) -> tuple[float, float, float, float]:
    P = np.vstack(points)
    lo, hi = P.min(axis=0), P.max(axis=0)
    pad = margin * (hi - lo)
    return (float(lo[0] - pad[0]), float(hi[0] + pad[0]), float(lo[1] - pad[1]), float(hi[1] + pad[1]))


def nearest_on(P: np.ndarray, p: np.ndarray) -> tuple[int, float, float]:
    """The segment k of the polyline P nearest to the point p, the fraction along it of the nearest point, and its distance."""
    a, d = P[:-1], np.diff(P, axis=0)
    w = np.clip(np.einsum("ij,ij->i", p - a, d) / np.maximum(np.einsum("ij,ij->i", d, d), 1e-300), 0.0, 1.0)
    dist = np.hypot(*(a + w[:, None] * d - p).T)
    k = int(dist.argmin())
    return k, float(w[k]), float(dist[k])


def rectangle(box) -> np.ndarray:
    x0, x1, y0, y1 = box
    return np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]])


def cross(center, dx: float, dy: float) -> list[np.ndarray]:
    x, y = center
    return [np.array([[x - dx, y - dy], [x + dx, y + dy]]), np.array([[x - dx, y + dy], [x + dx, y - dy]])]


def enter_leave(a: np.ndarray, b: np.ndarray, box) -> tuple[float, float] | None:
    """The fractions along the segment from a to b at which it enters and leaves the box (Liang and Barsky), or None."""
    x0, x1, y0, y1 = box
    d = b - a
    t0, t1 = 0.0, 1.0
    for p, q in ((-d[0], a[0] - x0), (d[0], x1 - a[0]), (-d[1], a[1] - y0), (d[1], y1 - a[1])):
        if p == 0.0:
            if q < 0.0:
                return None
        elif p < 0.0:
            t0 = max(t0, q / p)
        else:
            t1 = min(t1, q / p)
    return (t0, t1) if t0 <= t1 else None


def clip_pieces(P: np.ndarray, cc: np.ndarray, box, hold: float | None = None) -> list[tuple[np.ndarray, np.ndarray]]:
    """The pieces of the polyline P inside the box, cut where P crosses an edge, with the clock channel cc
    interpolated at each cut. With ``hold``, each piece is held at its last point until this clock value."""
    pieces: list[tuple[list, list]] = []
    open_ = False
    for j in range(len(P) - 1):
        a, b, ca, cb = P[j], P[j + 1], cc[j], cc[j + 1]
        span = enter_leave(a, b, box)
        if span is None:
            open_ = False
            continue
        t0, t1 = span
        if not open_ or t0 > 0.0:
            pieces.append(([a + t0 * (b - a)], [ca + t0 * (cb - ca)]))
        pieces[-1][0].append(a + t1 * (b - a))
        pieces[-1][1].append(ca + t1 * (cb - ca))
        open_ = t1 >= 1.0
    out = []
    for Q, cq in pieces:
        Q, cq = np.array(Q), np.array(cq)
        keep = increasing(cq)
        Q, cq = Q[keep], cq[keep]
        if hold is not None and hold > cq[-1] + 1e-7:
            Q, cq = np.r_[Q, Q[-1:]], np.r_[cq, hold]
        if len(Q) >= 2:
            out.append((Q, cq))
    return out


def in_slice(
    P: np.ndarray, cc: np.ndarray, a: float, b: float, revealed: bool = True, thin: float | None = None
) -> tuple[np.ndarray, np.ndarray] | None:
    """The part of a track in the slice of the clock from a to b, i.e. its samples inside the slice and its
    points interpolated at both ends of the slice, or None when it is not shown in the slice. With
    ``revealed``, the samples of a growing track before the slice are kept as well, spaced EPS apart from the
    start of the slice, since the track has already drawn them. With ``thin``, these samples are thinned to
    within this distance, so that they are drawn again within a few EPS of the start of the slice."""
    a, b = max(a, float(cc[0])), min(b, float(cc[-1]))
    if b - a < 2 * GAP:
        return None
    ends = np.stack([np.interp([a, b], cc, P[:, d]) for d in range(2)], axis=1)
    before = P[cc < a] if revealed else P[:0]
    if thin is not None and len(before) > 2:
        before = before[simplified(before, thin)]
    # every sample inside the slice is kept, and pushed after the sample before it by EPS where it is closer, since
    # a piece clipped at a deep zoom enters the close-up only EPS before it lands. A sample pushed to within half
    # of EPS of the end of the slice is dropped
    inner = (cc > a) & (cc < b)
    Q = np.r_[before, ends[:1], P[inner], ends[1:]]
    times = np.r_[a + EPS * np.arange(len(before)), a + EPS * len(before), cc[inner], b]
    for i in range(1, len(times) - 1):
        times[i] = max(times[i], times[i - 1] + EPS)
    keep = np.r_[times[:-1] < b - EPS / 2, True]
    return Q[keep], times[keep]


def simplified(P: np.ndarray, tol: float) -> np.ndarray:
    """The indices of the vertices of the polyline P that the Ramer-Douglas-Peucker algorithm keeps, i.e. the
    vertices without which the polyline would move by more than tol, with its two ends."""
    keep = np.zeros(len(P), dtype=bool)
    keep[[0, -1]] = True
    stack = [(0, len(P) - 1)]
    while stack:
        i, j = stack.pop()
        if j - i < 2:
            continue
        d = P[j] - P[i]
        n = float(np.hypot(*d))
        Q = P[i + 1 : j] - P[i]
        dist = np.abs(Q[:, 0] * d[1] - Q[:, 1] * d[0]) / n if n > 0 else np.hypot(Q[:, 0], Q[:, 1])
        m = int(np.argmax(dist))
        if dist[m] > tol:
            keep[i + 1 + m] = True
            stack += [(i, i + 1 + m), (i + 1 + m, j)]
    return np.flatnonzero(keep)


def clip_late(P: np.ndarray, cc: np.ndarray, box) -> list[tuple[np.ndarray, np.ndarray]]:
    """The pieces of the polyline P inside the box, as in clip_pieces, but with the clock values of each piece
    spaced at least EPS apart by moving its earlier samples back, so that the last point of a piece is kept when a
    cut falls closer to it than the precision of the clock, as at the end of an arc magnified a trillion times."""
    pieces: list[tuple[list, list]] = []
    open_ = False
    for j in range(len(P) - 1):
        span = enter_leave(P[j], P[j + 1], box)
        if span is None:
            open_ = False
            continue
        t0, t1 = span
        a, d, ca, dc = P[j], P[j + 1] - P[j], cc[j], cc[j + 1] - cc[j]
        if not open_ or t0 > 0.0:
            pieces.append(([a + t0 * d], [ca + t0 * dc]))
        if t1 > 0.0 or not open_:
            pieces[-1][0].append(a + t1 * d)
            pieces[-1][1].append(ca + t1 * dc)
        open_ = t1 >= 1.0
    out = []
    for Q, times in pieces:
        Q, times = np.array(Q), np.array(times)
        for i in range(len(times) - 2, -1, -1):
            times[i] = min(times[i], times[i + 1] - EPS)
        if len(Q) >= 2:
            out.append((Q, times))
    return out


def smooth(x: float) -> float:
    return x * x * (3.0 - 2.0 * x)


def hold_series(changes: list[tuple[float, dict]], start: float, end: float, gap: float = GAP) -> tuple[np.ndarray, dict]:
    """A clock channel and channels that hold each value from its time to the next change."""
    times, values = [start], [changes[0][1]]
    for t, v in changes[1:]:
        if t - gap > times[-1] + 1e-9:
            times.append(t - gap)
            values.append(values[-1])
        if t > times[-1] + 1e-9:
            times.append(t)
            values.append(v)
        else:
            values[-1] = v
    if end > times[-1] + 1e-9:
        times.append(end)
        values.append(values[-1])
    return np.array(times), {k: np.array([v[k] for v in values]) for k in values[0]}


def at(k: int, f, S: int):
    """The clock value at the fraction f of iterate k of a run of scene 1 with S segments."""
    if k == 0 and S == 1:
        return GUESS + np.interp(f, (0.0, GROW, DEFECT_END, SLIDE, 1.0), PACE0)
    if k == 0:
        return ZERO + (1.0 - ZERO) * f
    return k + f - (LEAD if S == 1 else 0.0)


def staged(k: int, S: int) -> bool:
    """Whether iterate k of a run with S segments is staged one segment first."""
    return k == 0 and S > 1


def grow_at(k: int, S: int, i: int, f):
    """The clock value at the fraction f, at most DEFECT_END, of the growth of the arc and the defect of segment i."""
    if staged(k, S):
        a, b = FIRST if i == 0 else REST
    else:
        return at(k, f, S)
    return a + (b - a) * np.asarray(f) / DEFECT_END


def slide_at(k: int, S: int) -> float:
    """The clock value at which the nodes of iterate k start to slide to iterate k + 1."""
    return STAGED_SLIDE if staged(k, S) else at(k, SLIDE, S)


def point_at(k: int, S: int) -> float:
    """The clock value at which the point of iterate k is added to the convergence curve, and the caption is updated."""
    return DRAWN[1] if staged(k, S) else at(k, POINT, S)


def snapped(points: list[tuple[float, float]], times: list[float], end: float) -> tuple[np.ndarray, np.ndarray]:
    """The polyline through the points of a convergence curve, held at each point until the next is added,
    so that the head of a grown curve jumps from one point to the next."""
    P, cc = [points[0]], [times[0]]
    for p, t in zip(points[1:], times[1:], strict=True):
        P += [P[-1], p]
        cc += [t - GAP, t]
    return np.array([*P, P[-1]]), np.array([*cc, end])


def convergence_curve(r: dict, S: int) -> tuple[list[tuple[float, float]], list[float], tuple | None]:
    """The convergence curve of a run of scene 1 with S segments.

    Returns the points (n, log10 ||F||) of its finite iterates, clamped to the convergence panel, the clock
    value at which each point is added, and for a failed run its cross, i.e. the center of the cross at the
    iterate at which the run failed and at the height of its last finite norm, with its clock value. The
    cross is None for a converged run.
    """
    its = r["iterates"]
    K = len(its) - 1
    finite = [k for k, it in enumerate(its) if math.isfinite(it["norm"])]
    pts = [(float(k), min(max(math.log10(max(its[k]["norm"], 1e-300)), Y_BOTTOM), Y_TOP)) for k in finite] or [(0.0, Y_TOP)]
    times = [point_at(k, S) for k in finite] or [point_at(0, S)]
    mark = ((float(K), pts[-1][1]), point_at(K, S)) if not r["converged"] else None
    return pts, times, mark


def dashes(P: np.ndarray, dash: float, gap: float) -> list[np.ndarray]:
    """The polyline P cut into dashes of the length dash, separated by gaps of the length gap."""
    s = np.r_[0.0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
    out = []
    for a in np.arange(0.0, s[-1], dash + gap):
        t = np.r_[a, s[(s > a) & (s < min(a + dash, s[-1]))], min(a + dash, s[-1])]
        out.append(np.stack([np.interp(t, s, P[:, 0]), np.interp(t, s, P[:, 1])], axis=1))
    return out


def bodies(scene: ty.Scene, frame, l1_below: bool = False) -> list:
    """The masses and 𝓛₁ at attributes of the driver's set, which :func:`body_attrs` writes. With ``l1_below``, the
    label of 𝓛₁ is drawn below 𝓛₁, at the ordinate of the attribute "l1_label_y", by a body of its own."""
    out = []
    for id, label, size in (("earth", "Earth", 7.0), ("moon", "Moon", 5.0), ("primary", "primary", 6.0), ("secondary", "secondary", 6.0)):
        out.append(ty.body(scene.body(id, frame=frame, position=[ty.attr(f"{id}_x"), 0.0, 0.0], label=label, color=GRAY), size=size))
    l1 = scene.body("L1", frame=frame, position=[ty.attr("l1x"), 0.0, 0.0], label=None if l1_below else "𝓛₁", color=GRAY)
    out.append(ty.body(l1, size=4.0))
    if l1_below:
        tag = scene.body("L1_label", frame=frame, position=[ty.attr("l1x"), ty.attr("l1_label_y"), 0.0], label="𝓛₁", color=GRAY)
        out.append(ty.body(tag, size=2.0))
    return out


def scale_text(v: float) -> str:
    """The label of a scale bar of length v in LU, in decimals down to 0.01 and with a power of ten below."""
    e = math.floor(math.log10(v) + 1e-9)
    m = round(v / 10.0**e)
    if e >= -2:
        return f"{v:.{max(0, -e)}f} LU"
    power = "10" + str(e).translate(str.maketrans("-0123456789", "⁻⁰¹²³⁴⁵⁶⁷⁸⁹"))
    return f"{power} LU" if m == 1 else f"{m} × {power} LU"


def scale_value(w: float) -> float:
    """The length in LU of the scale bar of the close-up at the scale w, which is drawn v / w long."""
    return max(v for v in SCALE_VALUES if v <= BAR_MAX * w * (1 + 1e-9))


def body_attrs(case: str) -> dict[str, float]:
    """The positions of the masses of :func:`bodies`. The Lyapunov case shows the Earth and the Moon, and family 11
    the primary and the secondary, and the masses of the other cases are parked at FAR."""
    mu = MU[case]
    moon = case == "lyapunov"
    return {
        "earth_x": -mu if moon else FAR,
        "moon_x": 1 - mu if moon else FAR,
        "primary_x": FAR if moon else -mu,
        "secondary_x": FAR if moon else 1 - mu,
        "l1x": c.libration_l1(mu),
    }


def masses_near(case: str, polylines: list[np.ndarray]) -> list[np.ndarray]:
    """The masses within one size of the box of the polylines, which a panel then shows with them."""
    x0, x1, y0, y1 = box_of(polylines, 0.0)
    size = max(x1 - x0, y1 - y0)
    out = []
    for x in (-MU[case], 1 - MU[case]):
        if x0 - size <= x <= x1 + size and y0 - size <= 0.0 <= y1 + size:
            out.append(np.array([[x, 0.0]]))
    return out


# scene 1


def build_correction(refs: dict, runs: dict, out: Path) -> dict:
    scene = ty.Scene(title="Differential correction")
    rp = scene.frame("rp", label="rotating-pulsating", axes=("x", "y"))
    conv = scene.frame("convergence", label="convergence", axes=("iterate n", "log₁₀ ‖F‖"), parent=rp)
    # the close-up is drawn in its own units u = (p - t) / w about the target t at the scale w, which the frame zoom
    # maps back to the rotating frame with the channels t_x, t_y, and inv_w = 1 / w of the ticker, so that the orbit
    # panel can outline the area that the close-up shows
    zf = scene.frame(
        "zoom", label="centered on the target", axes=("", ""), parent=rp, origin=[ty.channel("t_x"), ty.channel("t_y"), 0.0], scale=ty.channel("inv_w")
    )
    scene.track_set("zoom-box", frame=zf).add(rectangle((-1.1 * ZOOM_HALF, 1.1 * ZOOM_HALF, -1.1 * ZOOM_HALF, 1.1 * ZOOM_HALF)))
    # the close-up has a fixed grid GRID_STEP apart and the axis y = 0, on which every target lies, through its middle
    ts = scene.track_set("zoom-grid", frame=zf)
    x0, x1, y0, y1 = CLOSE_CLIP
    for x in np.arange(math.ceil(x0 / GRID_STEP), math.floor(x1 / GRID_STEP) + 1) * GRID_STEP:
        ts.add(np.array([[x, y0], [x, y1]]))
    for y in np.arange(math.ceil(y0 / GRID_STEP), math.floor(y1 / GRID_STEP) + 1) * GRID_STEP:
        if y != 0.0:
            ts.add(np.array([[x0, y], [x1, y]]))
    scene.track_set("zoom-axis", frame=zf).add(np.array([[x0, 0.0], [x1, 0.0]]))
    # the scale bar is drawn in a frame that the channel "bar" scales to its length, since a frame of scale s maps a
    # length d of its parent to s d, and its right tick in a frame
    # at its right end. Each label is written once, in a frame that its channel parks at FAR unless it is the label
    # of the bar
    bar = scene.frame("scalebar", parent=zf, origin=[BAR_X, BAR_Y, 0.0], scale=ty.channel("bar"))
    scene.track_set("scalebar", frame=bar).add(np.array([[0.0, 0.0], [1.0, 0.0]]))
    bar_end = scene.frame("scalebar-end", parent=zf, origin=[ty.channel("bar_end"), BAR_Y, 0.0])
    scene.track_set("scalebar-end", frame=bar_end).add(np.array([[0.0, -BAR_TICK], [0.0, BAR_TICK]]))
    scene.track_set("scalebar-start", frame=zf).add(np.array([[BAR_X, BAR_Y - BAR_TICK], [BAR_X, BAR_Y + BAR_TICK]]))
    scale_labels = []
    for k, v in enumerate(SCALE_VALUES):
        tag = scene.frame(f"scale{k}", parent=zf, origin=[BAR_X, ty.channel(f"scale{k}"), 0.0])
        scale_labels.append(ty.body(scene.body(f"scale{k}", frame=tag, position=[0.0, 0.0, 0.0], label=scale_text(v)), size=1.0))
    # the label of a failed run is drawn in a frame that the driver's channel "failed" scales by 1e-6 up
    # to the failure and by 1 after it, which parks the label at FAR and then moves it into the panel. A label
    # is written for each iterate n at which a run can fail, and the labels of the other iterates stay at FAR
    failure = scene.frame("failure", parent=conv, origin=[FAR, FAR, 0.0], scale=ty.channel("failed"))
    failed_labels = [
        ty.body(
            scene.body(f"failed{n}", frame=failure, position=[ty.attr(f"fail{n}_x"), ty.attr("fail_y"), 0.0], label=f"run failed at n = {n}", color=RED),
            size=2.0,
        )
        for n in range(MAX_ITERATIONS + 1)
    ]
    body_layers = bodies(scene, rp)

    # the box of each case holds the three converged orbits and the masses near them. The camera of the orbit
    # panel is fitted to this box, lowered and widened to the panel, and the arcs are cut where they leave it
    boxes, clips, arrow, ref_lines = {}, {}, {}, {}
    for case, by_system in refs.items():
        polylines = {}
        for system, (x0, vy0, T) in by_system.items():
            e, theta0 = SYSTEMS[system]
            polylines[system] = orbit_polyline(c.Model(MU[case], e), theta0, np.array([x0, 0.0, 0.0, vy0]), T, SAMPLES_ORBIT)[0]
        x0, vy0, T = by_system["cr3bp"]
        X = c.orbit(c.Model(MU[case]), 0.0, np.array([x0, 0.0, 0.0, vy0]), T)[1]
        speed = float(np.median(np.hypot(X[:, 2], X[:, 3])))
        boxes[case] = box_of([*polylines.values(), *masses_near(case, list(polylines.values()))], 0.12)
        b = boxes[case]
        size = max(b[1] - b[0], b[3] - b[2])
        arrow[case] = 0.07 * size / speed
        clips[case] = widened(lowered(b))
        scene.track_set(f"box-{case}", frame=rp, tags={"element": "box", "case": case}).add(rectangle(clips[case]))
        # the reference orbit is dashed, so that the arcs below it are still seen
        for system, P in polylines.items():
            ref_lines[(case, system)] = P
            ts = scene.track_set(f"ref-{case}-{system}", frame=rp, tags={"element": "ref", "case": case, "system": system})
            for D in dashes(P, 0.02 * size, 0.012 * size):
                ts.add(D)
    # the right margin keeps a cross at the last iterate and the label of a failed run inside the panel
    # the top is left clear of the head of the panel, which covers the top 0.6 of the box
    conv_box = (-0.4, MAX_ITERATIONS + 2.4, Y_BOTTOM, Y_TOP + 2.0)
    scene.track_set("convergence-box", frame=conv).add(rectangle(conv_box))
    scene.track_set("tolerance", frame=conv).add(np.array([[conv_box[0], -11.0], [conv_box[1], -11.0]]))
    # the grid of the convergence panel has a line at every iterate and at every power of ten of the norm
    ts = scene.track_set("convergence-grid", frame=conv)
    for n in range(0, MAX_ITERATIONS + 3):
        ts.add(np.array([[n, conv_box[2]], [n, conv_box[3]]]))
    for y in range(math.ceil(conv_box[2]), math.floor(conv_box[3]) + 1):
        ts.add(np.array([[conv_box[0], y], [conv_box[1], y]]))

    convergence = {key: convergence_curve(r, key[3]) for key, r in runs.items()}

    for key, r in sorted(runs.items()):
        case, system, targeting, S, guess = key
        tags = {"case": case, "system": system, "targeting": targeting, "S": str(S), "guess": guess}
        name = "-".join(tags.values())
        box = clips[case]
        half = targeting == "half"
        its = r["iterates"]
        K = len(its) - 1

        def new(element, frame=rp, periodic=False, attrs=None, name=name, tags=tags):
            return scene.track_set(
                f"{element}-{name}", frame=frame, tags={"element": element, **tags}, periodic=periodic, attrs=attrs or {}
            )

        arcs, defects, nodes, dim_nodes, arrows, target_arrows = [], [], [], [], [], []
        # the marks of the orbit panel that the close-up magnifies, uncut, each a polyline, its clock channel, and
        # whether the samples of the track before a copy of the flipbook have already been drawn
        near: dict[str, list] = {key: [] for key in ("zoom_ref", "zoom_arcs", "zoom_solution", "zoom_defects", "zoom_dim_nodes", "zoom_nodes", "zoom_end", "zoom_mirror")}
        for k, it in enumerate(its):
            hold = END1 if k == K else at(k + 1, 0.0, S) - GAP
            slide = slide_at(k, S)
            # an arc that leaves the box is drawn in its pieces inside it, and the last point of its last piece is kept
            cuts: dict[int, np.ndarray | None] = {}
            for i, (xy, frac, _) in enumerate(it["segments"]):
                shoot = SHOOT if k else 0.0
                cc = grow_at(k, S, i, shoot + (GROW - shoot) * frac)
                pieces = clip_pieces(xy, cc, box)
                if not inside(xy, box).all():
                    cuts[i] = pieces[-1][0][-1] if pieces else None
                for Pk, ck in pieces:
                    arcs.append((np.r_[Pk, Pk[-1:]], np.r_[ck, hold]))
                ok = np.isfinite(xy).all(axis=1) & np.isfinite(cc)
                if ok.sum() >= 2:
                    near["zoom_arcs"].append((np.r_[xy[ok], xy[ok][-1:]], np.r_[cc[ok], hold], True))
            if math.isfinite(it["norm"]):
                # the converged iterate keeps the arrows at the end of its arc, which form one vertical arrow, but
                # it does not have defects
                last = r["converged"] and k == K
                ends, nd, s = it["ends"], it["nodes"], arrow[case]
                targets = [nd[i + 1] for i in range(S - 1)]
                targets.append(ends[-1] * ON_AXIS if half else nd[0])
                for i, (a, b) in enumerate(zip(ends, targets, strict=True)):
                    tt = np.array([grow_at(k, S, i, DEFECT_START), grow_at(k, S, i, DEFECT_END)])
                    # the last gap of a half period runs from the end of the arc down to its target on the axis
                    on_axis = half and i == S - 1
                    # with a single segment, the end of the arc is drawn with its velocity arrow at END_ARROW, and
                    # under the half period its target as well, with the vertical velocity required there, at
                    # TARGET_ARROW, since neither is a node. Both are held with the arc until the next iterate.
                    # An arrow that would leave the box is not drawn
                    if S == 1:
                        ends_drawn = (a, b) if on_axis else (a,)
                        tips = np.array([end[:2] + s * end[2:] for end in ends_drawn])
                        if inside(np.r_[np.array([end[:2] for end in ends_drawn]), tips], box).all():
                            for j, end in enumerate(ends_drawn):
                                (target_arrows if j else arrows).append((end[:2], s * end[2:], np.array([at(k, TARGET_ARROW if j else END_ARROW, S), hold])))
                    if last:
                        continue
                    # the gap in position, from the end of the arc to its target, is held until the next iterate
                    gap = np.array([a[:2], b[:2]])
                    near["zoom_defects"].append((np.r_[gap, gap[1:]], np.r_[tt, hold], True))
                    if not inside(gap, box).all():
                        # an end outside the box is drawn where its arc was cut, and a node outside it where the node is drawn
                        a2 = a[:2] if inside(a[None, :2], box)[0] else cuts.get(i)
                        b2 = b[:2] if inside(b[None, :2], box)[0] else clamp(b[None, :2], box)[0]
                        if a2 is None or b2 is None:
                            continue
                        gap = np.array([a2, b2])
                    defects.append((np.r_[gap, gap[1:]], np.r_[tt, hold]))
            if S == 1:
                # the node of a single segment is drawn with its velocity arrow, cut where it leaves the box, until
                # the node slides. the node of the last iterate K is not moved, hence its arrow is kept to END1
                p, v = it["nodes"][0, :2], it["nodes"][0, 2:]
                pieces = clip_pieces(np.array([p, p + arrow[case] * v]), np.array([0.0, 1.0]), box)
                if pieces and inside(p[None], box)[0]:
                    tip = pieces[0][0][-1]
                    arrows.append((p, tip - p, np.array([DRAWN[0] if k == 0 else at(k, 0.0, S), END1 if k == K else slide])))
        # the nodes of a converged run are removed when its orbit is lit, so that the satellite is seen alone on it.
        # The orbit panel draws a node outside its box at the edge, and the close-up where it is
        lit = at(K, LIGHT_HALF if half else LIGHT_FULL, S)
        gone = lit if r["converged"] else END1
        # under the half period, the converged arcs are reflected across the axis, and the reflection grows from
        # x0 in the order of the arcs, segment i over the i-th of S equal parts of MIRROR, so that the orbit is
        # closed in gray before it is lit
        mirror = []
        if half and r["converged"]:
            m0, m1 = at(K, MIRROR[0], S), at(K, MIRROR[1], S)
            for i, (xy, frac, _) in enumerate(its[K]["segments"]):
                P = xy * np.array([1.0, -1.0])
                cc = m0 + (m1 - m0) * (i + np.asarray(frac)) / S
                near["zoom_mirror"].append((np.r_[P, P[-1:]], np.r_[cc, END1], True))
                mirror += [(np.r_[Pk, Pk[-1:]], np.r_[ck, END1]) for Pk, ck in clip_pieces(P, cc, box)]

        def pack(P, cc, close):
            return (P, cc, False) if close else (P, cc)

        for i in range(S):
            for dest, dim, close in ((nodes, dim_nodes, False), (near["zoom_nodes"], near["zoom_dim_nodes"], True)):
                P, cc = [], []
                for k, it in enumerate(its):
                    p = it["nodes"][i, :2] if close else clamp(it["nodes"][i : i + 1, :2], box)[0]
                    if not np.isfinite(p).all():
                        break
                    P += [p, p]
                    cc += [DRAWN[0] if k == 0 else at(k, 0.0, S), slide_at(k, S) if k < K else gone]
                if not P:
                    continue
                cc[-1] = max(cc[-1], cc[-2] + GAP)
                if staged(0, S) and i > 0:
                    # the node is white until the first segment grows, and dim until its own segment grows
                    dest.append(pack(np.array(P[:2]), np.array([DRAWN[0], FIRST[0]]), close))
                    dim.append(pack(np.array(P[:2]), np.array([FIRST[0], REST[0]]), close))
                    cc[0] = REST[0]
                dest.append(pack(np.array(P), np.array(cc), close))

        # the close-up is a magnified copy of the orbit panel about a center c at a scale w, i.e. a point p is drawn
        # at (p - c) / w. The center is the target of the closure of the iterate, i.e. the point below the end of the
        # last arc on the axis under the half period and the node x0 over the full period, and w is set so that
        # the end is drawn ZOOM_GAP from it. The flipbook is a sequence of slices of the clock, each with its scale
        # and its center, in which every mark is drawn again and clipped to the panel. When iterate k starts, the
        # center glides to its target and the close-up is zoomed to its scale at the same time, up to MOVE_END of
        # the iterate. The arc of iterate k is then drawn growing into a close-up already set, its end is drawn when
        # the arc lands, and its gap after it. The converged iterate K keeps the scale of iterate K - 1. The close-up shows the gap in position only, not the defect in velocity
        L = next((k for k, it in enumerate(its) if not math.isfinite(it["norm"])), K + 1) - 1
        scales, targets_at = [], []
        for k in range(L + 1):
            a = its[k]["ends"][-1]
            t = (a * ON_AXIS if half else its[k]["nodes"][0])[:2]
            gap = float(np.hypot(*(a[:2] - t)))
            w = gap / ZOOM_GAP
            if scales and ((r["converged"] and k == K) or gap < 1e-15 or ZOOM_KEEP[0] <= gap / scales[-1] / ZOOM_GAP <= ZOOM_KEEP[1] / ZOOM_GAP):
                w = scales[-1]
            scales.append(max(w, 1e-15))
            targets_at.append(t)
            arrive = grow_at(k, S, S - 1, GROW)
            near["zoom_end"].append((np.array([a[:2], a[:2]]), np.array([arrive, at(k + 1, 0.0, S) - GAP if k < K else END1]), False))
        if r["solution"] is not None:
            P = r["solution"][0]
            near["zoom_solution"].append((np.r_[P, P[-1:]], np.r_[np.linspace(lit, lit + 0.05, len(P)), END1], True))
        P = ref_lines[(case, system)]
        near["zoom_ref"].append((np.r_[P, P[-1:]], np.r_[np.linspace(START1, START1 + 0.01, len(P)), END1], True))

        slices: list[tuple[float, float, float, np.ndarray]] = []
        if L >= 0:
            t0, w_now, c_now = DRAWN[0], scales[0], targets_at[0]
            for k in range(1, L + 1):
                w1, c1 = scales[k], targets_at[k]
                glide = float(np.hypot(*(c1 - c_now))) / w_now
                zoom_steps = 0 if w1 == w_now else max(3, math.ceil(abs(math.log10(w1 / w_now)) * ZOOM_PER_DECADE))
                m0, m1 = at(k, 0.0, S), at(k, MOVE_END, S)
                n = min(ZOOM_SLICES, max(math.ceil(glide / GLIDE_STEP), zoom_steps))
                if n:
                    slices.append((t0, m0, w_now, c_now))
                    for j in range(n):
                        e = smooth((j + 1) / n)
                        w = w_now ** (1 - e) * w1**e
                        # through a zoom in, the offset of the center from the target is shrunk with the scale, so
                        # that the target is moved across the panel at an even pace and stays in view
                        ctr = c1 + (c_now - c1) * (1 - e) * min(1.0, w / w_now)
                        slices.append((m0 + (m1 - m0) * j / n, m0 + (m1 - m0) * (j + 1) / n, w, ctr))
                    t0, w_now, c_now = m1, w1, c1
            slices.append((t0, END1, w_now, c_now))
            # a slice at the scale and the center of the slice before it is merged into it
            merged = [slices[0]]
            for sl in slices[1:]:
                last = merged[-1]
                if sl[2] == last[2] and np.array_equal(sl[3], last[3]):
                    merged[-1] = (last[0], sl[1], last[2], last[3])
                else:
                    merged.append(sl)
            slices = merged
        zoom: dict[str, list] = {key: [] for key in near}
        near = {key: [(P, cc, rv, (P.min(axis=0), P.max(axis=0))) for P, cc, rv in items] for key, items in near.items()}
        for s0, s1, w, ctr in slices:
            lo, hi = ctr + w * np.array([CLOSE_CLIP[0], CLOSE_CLIP[2]]), ctr + w * np.array([CLOSE_CLIP[1], CLOSE_CLIP[3]])
            for element, items in near.items():
                for P, cc, revealed, (blo, bhi) in items:
                    # a mark outside the slice in time, or away from the panel, is not drawn in it
                    if cc[0] >= s1 or cc[-1] <= s0 or (bhi < lo).any() or (blo > hi).any():
                        continue
                    Pz = (P - ctr) / w
                    if revealed:
                        # a growing mark is clipped to the panel before it is sliced, so that only the samples of its
                        # pieces inside the panel are drawn again at the start of the slice. A piece that leaves the
                        # panel is held until the end of the track, as its layer hides a track after its last sample
                        end, pieces = float(cc[-1]), []
                        for Pq, cq in clip_late(Pz, cc, CLOSE_CLIP):
                            if cq[-1] < end - EPS:
                                Pq, cq = np.r_[Pq, Pq[-1:]], np.r_[cq, end]
                            sliced = in_slice(Pq, cq, s0, s1, thin=SIMPLIFY)
                            if sliced is not None:
                                pieces.append(sliced)
                    else:
                        sliced = in_slice(Pz, cc, s0, s1, revealed=False)
                        if sliced is None:
                            continue
                        pieces = clip_late(*sliced, CLOSE_CLIP)
                    if element in STATIC_NEAR:
                        # a mark that is drawn whole within the slice is thinned to within SIMPLIFY of the close-up
                        pieces = [(Pq[j], cq[j]) for Pq, cq in pieces for j in [simplified(Pq, SIMPLIFY)]]
                    if element == "zoom_ref":
                        # the reference is dashed in the units of the close-up, hence at every scale alike
                        pieces = [(D, np.linspace(cq[0], cq[0] + EPS * len(D), len(D))) for Pq, cq in pieces for D in dashes(Pq, 0.25, 0.12) if len(D) >= 2]
                        pieces = [(np.r_[D, D[-1:]], np.r_[cq, s1 - GAP]) for D, cq in pieces]
                    zoom[element] += pieces

        ts = new("arcs")
        for P, cc in arcs:
            ts.add(P, channels={"c": cc})
        if mirror:
            ts = new("mirror")
            for P, cc in mirror:
                ts.add(P, channels={"c": cc})
        if defects:
            ts = new("defects")
            for P, cc in defects:
                ts.add(P, channels={"c": cc})
        ts = new("nodes")
        for P, cc in nodes:
            ts.add(P, channels={"c": cc})
        if dim_nodes:
            ts = new("dim_nodes")
            for P, cc in dim_nodes:
                ts.add(P, channels={"c": cc})
        for element, items in zoom.items():
            if items:
                ts = new(element, frame=zf)
                for P, cc, *_ in items:
                    ts.add(P, channels={"c": cc})
        # the target under the half period is held at the middle of the close-up, on the axis, from the moment the
        # velocity required there is drawn. Over the full period the target is the node x0, which the close-up draws with the nodes
        if L >= 0 and half:
            ts = new("zoom_requirement", frame=zf)
            ts.add(np.zeros((2, 2)), channels={"c": np.array([grow_at(0, S, S - 1, TARGET_ARROW), END1])})
        # an arrow is a track of two samples at its base, shown while the clock is in its window
        for element, items in (("arrows", arrows), ("target_arrows", target_arrows)):
            if items:
                ts = new(element)
                for p, d, cc in items:
                    ts.add(np.array([p, p]), channels={"c": cc, "vx": np.full(2, d[0]), "vy": np.full(2, d[1])})
        if r["solution"] is not None:
            P, frac, _ = r["solution"]
            ts = new("solution", periodic=True)
            ts.add(P, channels={"c": lit + (END1 - lit) * frac})
            # the still orbit is drawn a second time through the midpoints of the segments of the orbit. A wide line
            # of TyCHO is drawn without joins, hence a notch is left outside every vertex of each opaque line, and
            # it is covered by the line through the midpoints
            mid = (P[:-1] + P[1:]) / 2
            ts = new("solution_mid")
            ts.add(np.r_[mid, mid[:1]], channels={"c": np.linspace(lit, END1, len(mid) + 1)})
            # the satellite laps the converged orbit every LAP of the clock, from the moment it is lit to the end of the loop
            laps = math.ceil((END1 - lit) / LAP)
            ts = new("satellite")
            ts.add(
                np.concatenate([P[:-1]] * laps + [P[-1:]]),
                channels={"c": np.concatenate([lit + LAP * (j + frac[:-1]) for j in range(laps)] + [[lit + LAP * laps]])},
            )

        # the convergence curve of this run, through its finite iterates, and a failed run is marked by a cross
        pts, times, mark = convergence[key]
        P, cc = snapped(pts, times, END1)
        ts = new("current", frame=conv)
        ts.add(P, channels={"c": cc})
        if mark is not None:
            ts = new("cross", frame=conv)
            for seg in cross(mark[0], CROSS_HALF, CROSS_TALL):
                ts.add(seg, channels={"c": np.array([mark[1], mark[1] + 0.01])})

        # the ticker of the caption, which is updated when the point of each iterate is added. A failed propagation
        # holds the norm of the iterate before it
        finite = [k for k, it in enumerate(its) if math.isfinite(it["norm"])]
        logs = {k: math.log10(max(its[k]["norm"], 1e-300)) for k in finite}
        events = []
        for k, it in enumerate(its):
            logF = logs[k] if k in logs else (events[-1][1]["logF"] if events else Y_TOP)
            events.append((START1 if k == 0 else point_at(k, S), {"n": float(k), "logF": logF, "failed": 1e-6}))
        changes, state = [], {}
        for t, v in sorted(events, key=lambda e: e[0]):
            state = {**state, **v}
            changes.append((t, state))
        attrs = {**body_attrs(case), **{f"fail{n}_x": 0.0 for n in range(MAX_ITERATIONS + 1)}, "fail_y": 0.0}
        if mark is not None:
            changes.append((mark[1], {**changes[-1][1], "failed": 1.0}))
            attrs[f"fail{K}_x"] = min(max(K, 1) + CROSS_HALF, conv_box[1] - FAIL_WIDTH) - FAR
            attrs["fail_y"] = FAIL_Y - FAR
        if case == "family11":
            # the gaps of family 11 are drawn along y = 0 across 𝓛₁, which this scene therefore does not show
            attrs["l1x"] = FAR
        cc, ch = hold_series(changes, START1, END1, gap=TICK_GAP)
        # the center and the scale of the close-up, held through each slice of the flipbook, which the frame zoom
        # reads
        edges = [s0 for s0, *_ in slices[1:]]
        grid = np.unique(np.r_[cc, [e - TICK_GAP for e in edges], edges])
        grid = grid[(grid >= START1) & (grid <= END1)]
        ch = {key: np.interp(grid, cc, v) for key, v in ch.items()}
        held = slices or [(START1, END1, 1.0, np.zeros(2))]
        which = np.clip(np.searchsorted(np.array([s0 for s0, *_ in held]), grid + 1e-12, side="right") - 1, 0, len(held) - 1)
        ch["inv_w"] = np.array([1.0 / held[j][2] for j in which])
        # the inverse of the length of the scale bar in the units of the close-up, which is the scale of its frame,
        # the abscissa of its right end, and, for each label of SCALE_VALUES, its ordinate while it is the label of
        # the bar, or FAR
        ws = np.array([held[j][2] for j in which])
        bar = np.array([scale_value(w) for w in ws])
        ch["bar"], ch["bar_end"] = ws / bar, BAR_X + bar / ws
        for k, v in enumerate(SCALE_VALUES):
            ch[f"scale{k}"] = np.where(np.isclose(bar, v, rtol=1e-6, atol=0.0), BAR_Y + BAR_LABEL, FAR)
        ch["t_x"], ch["t_y"] = np.array([held[j][3][0] for j in which]), np.array([held[j][3][1] for j in which])
        ts = new("ticker", attrs=attrs)
        ts.add(np.zeros((len(grid), 2)), channels={"c": grid, **ch})

    case = scene.choice("case", list(MU), labels=["𝓛₁ Lyapunov", "family 11"])
    system = scene.choice("system", list(SYSTEMS), labels=["CR3BP", "ER3BP, periapsis", "ER3BP, apoapsis"])
    targeting = scene.choice("targeting", list(TARGETINGS), default="full", labels=["half period", "full period"])
    segments = scene.choice("S", [str(s) for s in SEGMENTS], labels=[str(s) for s in SEGMENTS])
    guess = scene.choice("guess", list(GUESSES), labels=["ε = 0.001", "ε = 0.05"])
    defects_on = scene.toggle("defects", default=True)
    solution_on = scene.toggle("solution", default=False)
    scene.clock("value", channels=["c"], steps=840, range=[START1, END1], labels=["iterate n + fraction"], seconds=SECONDS)

    def q(element, **extra):
        return ty.sets(element=element, case=case, system=system, targeting=targeting, S=segments, guess=guess, **extra)

    driver = ty.driver(q("ticker"), {"index": 0})
    scene.view(
        "orbit",
        frame=rp,
        driver=driver,
        camera={"kind": "plane", "plane": "xy"},
        label="orbit",
        layers=[
            ty.track(ty.sets(element="box", case=case), opacity=0.0, width=1.0),
            ty.grid(labels=False),
            ty.axes(),
            # the dashed reference is drawn over the arcs and the converged orbit
            ty.track(q("arcs"), reveal="grow", before="hidden", after="hidden", color=TEAL, width=2.5),
            # the red disc of a defect is drawn at its target under the node, and seen around it
            ty.track(
                q("defects"), reveal="grow", before="hidden", after="hidden", head={"color": RED, "size": DEFECT_DISC}, color=RED, width=3.0, visible=defects_on
            ),
            ty.track(q("mirror"), reveal="grow", before="hidden", color=GRAY, width=2.5, opacity=0.8),
            # the converged orbit is drawn still, in teal over its glow, under the satellite that rides it
            ty.track(q("solution"), before="hidden", color=TEAL, opacity=GLOW, width=STILL_GLOW),
            ty.track(q("solution_mid"), before="hidden", color=TEAL, opacity=GLOW, width=STILL_GLOW),
            ty.track(q("solution"), before="hidden", color=TEAL, width=5.0),
            ty.track(q("solution_mid"), before="hidden", color=TEAL, width=5.0),
            ty.track(ty.sets(element="ref", case=case, system=system), color=GRAY, width=3.5, opacity=0.95, visible=solution_on),
            # a satellite laps the converged orbit from the moment the orbit is drawn to the end of the loop, as a
            # orange head with a comet in the foreground color
            ty.track(q("satellite"), trail=0.3, before="hidden", head={"color": ORANGE, "size": 9}, width=2.0),
            # the velocity required at the target on the axis under the half period, which is vertical
            ty.arrow(q("target_arrows"), ("vx", "vy"), before="hidden", after="hidden", color=GREEN, width=1.8, head=ARROWHEAD),
            ty.arrow(q("arrows"), ("vx", "vy"), before="hidden", after="hidden", width=1.8, head=ARROWHEAD),
            ty.track(
                q("dim_nodes"),
                trail=0.002,
                taper=(0, 0),
                head={"color": GRAY, "size": NODE_SIZE},
                before="hidden",
                after="hidden",
                width=0.5,
                opacity=0.3,
            ),
            # a node of a staged iterate 0 is drawn in the foreground color until FIRST[0] by a track of its own, hidden after its end
            ty.track(
                q("nodes"), trail=0.002, taper=(0, 0), head={"size": NODE_SIZE}, before="hidden", after="hidden", width=0.5
            ),
            *body_layers,
            # the area that the close-up shows, as it is zoomed and as it is panned or zoomed by hand
            ty.outline("closeup", opacity=0.5, width=1.0, dash=(WINDOW_DASH, WINDOW_DASH / 2), min_size=WINDOW_MIN),
        ],
    )
    # the close-up is a magnified copy of the orbit panel without axes, since its units change with the zoom, and
    # its scale is shown by the scale bar. Its camera is fitted to the box of the target alone, and the marks are
    # drawn across the whole panel. The end of the last arc is a teal dot from the moment the arc lands on it, and
    # the target under the half period is the green requirement on the axis
    def magnified(element, **kw):
        return ty.track(q(element), before="hidden", after="hidden", fit=False, **kw)

    scene.view(
        "closeup",
        frame=zf,
        driver=driver,
        camera={"kind": "plane", "plane": "xy"},
        label="close-up",
        layers=[
            ty.track(ty.set_id("zoom-box"), opacity=0.0, width=1.0),
            ty.track(ty.set_id("zoom-grid"), color=GRAY, width=1.0, opacity=0.25, fit=False),
            ty.track(ty.set_id("zoom-axis"), color=GRAY, width=1.0, opacity=0.6, fit=False),
            magnified("zoom_ref", reveal="grow", color=GRAY, width=3.5, opacity=0.95, visible=solution_on),
            magnified("zoom_arcs", reveal="grow", color=TEAL, width=2.5),
            magnified("zoom_defects", reveal="grow", head={"color": RED, "size": DEFECT_DISC}, color=RED, width=3.0, visible=defects_on),
            magnified("zoom_mirror", reveal="grow", color=GRAY, width=2.5, opacity=0.8),
            magnified("zoom_solution", reveal="grow", color=TEAL, opacity=GLOW, width=STILL_GLOW),
            magnified("zoom_solution", reveal="grow", color=TEAL, width=5.0),
            magnified("zoom_requirement", trail=0.002, taper=(0, 0), head={"color": GREEN, "size": NODE_SIZE}, color=GREEN, width=0.5),
            magnified("zoom_end", trail=0.002, taper=(0, 0), head={"color": TEAL, "size": NODE_SIZE}, color=TEAL, width=0.5),
            magnified("zoom_dim_nodes", trail=0.002, taper=(0, 0), head={"color": GRAY, "size": NODE_SIZE}, width=0.5, opacity=0.3),
            magnified("zoom_nodes", trail=0.002, taper=(0, 0), head={"size": NODE_SIZE}, width=0.5),
            *body_layers,
            ty.track(ty.set_id("scalebar"), width=2.0, fit=False, context="driver"),
            ty.track(ty.set_id("scalebar-start"), width=2.0, fit=False),
            ty.track(ty.set_id("scalebar-end"), width=2.0, fit=False, context="driver"),
            *scale_labels,
        ],
    )
    scene.view(
        "convergence",
        frame=conv,
        driver=driver,
        camera={"kind": "plane", "plane": "xy", "aspect": "free"},
        label="convergence",
        layers=[
            ty.track(ty.set_id("convergence-box"), opacity=0.0, width=1.0),
            ty.axes(),
            ty.grid(labels=True),
            ty.track(ty.set_id("convergence-grid"), color=GRAY, width=1.0, opacity=0.2),
            ty.track(ty.set_id("tolerance"), color=GRAY, width=1.0, opacity=0.6),
            # the norm of F is the error that the defects show, hence its curve is drawn in their red
            ty.track(q("current"), reveal="grow", before="hidden", head={"size": 7}, color=RED, width=3.0),
            ty.track(q("cross"), before="hidden", color=RED, width=2.5),
            *failed_labels,
        ],
    )
    scene.panel("orbit", "orbit")
    scene.panel("closeup", "closeup")
    scene.panel("convergence", "convergence")
    scene.layout(ty.split("row", 0.55, "orbit", ty.split("col", 0.45, "closeup", "convergence")))
    scene.tabs(case, label="case")
    scene.tabs(system, label="system")
    scene.tabs(targeting, label="targeting")
    scene.tabs(segments, label="segments S")
    scene.tabs(guess, label="first guess")
    scene.toggle_control(defects_on, label="defects")
    scene.toggle_control(solution_on, label="solution")
    scene.transport()
    scene.readout(
        "caption",
        "iterate n = ",
        ty.channel("n"),
        "   log₁₀ ‖F‖ = ",
        {"channel": "logF", "digits": 3},
    )
    scene.write(out / "correction.tys", out / "correction.tyd")
    return scene.write_html(out / "correction.html")


# scene 2


def w_length(d: np.ndarray, W: np.ndarray) -> float:
    return float(math.sqrt(max(float(d @ (W * d)), 0.0)))


def phase(slot: tuple[float, float, float], f: float) -> float:
    """The clock value at the fraction f of an attempt of a pen, given as its start, its duration, and the hold
    that is inserted at the fraction HOLD_AT of it."""
    t0, d, pause = slot
    return t0 + f * d + (pause if f > HOLD_AT else 0.0)


def caption_channels(p: float, halvings: int) -> dict[str, float]:
    """The parameter p as an integer part and four decimal digits, which the caption prints as integers, and the halvings of the step."""
    v = round(abs(p) * 10**4)
    out = {"p_int": float(v // 10**4)}
    for i in range(4):
        out[f"p_{i + 1}"] = float((v // 10 ** (3 - i)) % 10)
    out["halvings"] = float(halvings)
    return out


def framed(box, scale: np.ndarray, panel: str) -> tuple[tuple[float, ...], tuple[float, ...]]:
    """The box widened along one axis until a unit is as long across the area for data of the panel as up it,
    and the box of the camera, whose fit to the panel puts the widened box on this area. A unit is one of the
    continuation norm, whose weights on the two axes are the squares of ``scale``, or one of length when
    ``scale`` is (1, 1)."""
    (width, height), (left, right, bottom, top) = PANELS[panel]
    # the camera fits its box to the middle 1/1.1 of the panel along each axis. An inset below this margin would
    # put the camera box inside the data box, and the fit would then follow the data along that axis alone
    left, right = max(left, width * 0.05 / 1.1), max(right, width * 0.05 / 1.1)
    bottom, top = max(bottom, height * 0.05 / 1.1), max(top, height * 0.05 / 1.1)
    x0, x1, y0, y1 = box
    w, h = (x1 - x0) * scale[0], (y1 - y0) * scale[1]
    aspect = (width - left - right) / (height - bottom - top)
    if w / h > aspect:
        grow = (w / aspect / scale[1] - (y1 - y0)) / 2
        y0, y1 = y0 - grow, y1 + grow
    else:
        grow = (h * aspect / scale[0] - (x1 - x0)) / 2
        x0, x1 = x0 - grow, x1 + grow

    def outer(a: float, b: float, lo: float, hi: float, size: float) -> tuple[float, float]:
        span = (b - a) * size / (size - lo - hi)
        start = a - span * lo / size + 0.05 * span / 1.1
        return start, start + span / 1.1

    return (x0, x1, y0, y1), (*outer(x0, x1, left, right, width), *outer(y0, y1, bottom, top, height))


METHODS = ("natural", "arclength")


def build_continuation(pens: dict, curves: dict, out: Path) -> dict:
    scene = ty.Scene(title="Continuation of a family")
    rp = scene.frame("rp", label="rotating-pulsating", axes=("x", "y"))
    diagram_frames = {
        "lyapunov": scene.frame("lyapunov", label="𝓛₁ Lyapunov family", axes=("Jacobi constant C", "launch position x₀"), parent=rp),
        "family11": scene.frame("family11", label="family 11", axes=("eccentricity e", "launch velocity ẏ₀"), parent=rp),
    }
    body_layers = bodies(scene, rp, l1_below=True)
    label_y = {}

    def proj(Y, family: str):
        """The point of the member Y in the diagram of its family, i.e. its parameter and its ordinate."""
        return np.array([Y[-1], Y[ORDINATE[family]]])

    def weights(family: str) -> np.ndarray:
        return W_LYAPUNOV if family == "lyapunov" else W_FAMILY11

    def scale(family: str) -> np.ndarray:
        """The square roots of the weights of the two axes of the diagram, the parameter and the ordinate."""
        W = weights(family)
        return np.sqrt([W[-1], W[ORDINATE[family]]])

    # the box of each close-up, in the parameter and the ordinate
    windows, cameras = {}, {}
    for family in NATURAL_STEPS:
        curve = np.array([proj(Y, family) for Y in curves[family]])
        tip = curve[np.argmax(curve[:, 0])]
        if family == "family11":
            lo, hi = tip[0] - CLOSEUP_BELOW, tip[0] + CLOSEUP_BELOW
        else:
            h = NATURAL_STEPS[family]["medium"]
            first = next(st for st in pens[(family, "medium", "natural")]["steps"] if not st["converged"])
            p = float(first["start"][-1])
            lo, hi = p - 1.25 * h, p + 0.25 * h
        vs = np.concatenate([Q[:, 1] for Q, _ in clip_pieces(curve, np.arange(len(curve), dtype=float), (lo, hi, -np.inf, np.inf))])
        pad = WINDOW_PAD * float(vs.max() - vs.min())
        if family == "family11":
            # the ordinate is spanned symmetrically about the tip, so that the box is widened about it
            half = float(np.abs(vs - tip[1]).max()) + pad
            box = (lo, hi, float(tip[1]) - half, float(tip[1]) + half)
        else:
            box = (lo, hi, float(vs.min()) - pad, float(vs.max()) + pad)
        windows[family], cameras[family] = framed(box, scale(family), "closeup")

    def raw_times(pen: dict, family: str) -> list[float]:
        """The duration of each attempt of a pen, in proportion to the length in the diagram of its predictor and of
        its correction, or WINDOW_ATTEMPT for an attempt that reaches the range of the parameter of the close-up."""
        W, window = weights(family), windows[family]
        durations = []
        for st in pen["steps"]:
            p = [proj(Y, family)[0] for Y in [st["start"], st["predictor"], *st["iterates"]]]
            if min(p) < window[1] and max(p) > window[0]:
                durations.append(WINDOW_ATTEMPT)
                continue
            L = w_length(st["predictor"] - st["start"], W)
            if st["converged"]:
                L += w_length(st["iterates"][-1] - st["predictor"], W)
            durations.append(max(FLOOR, min(L, 1.0)))
        return durations

    def fold_attempt(pen: dict, family: str) -> tuple[int, float]:
        """The index of the converged attempt from the member whose tangent is closest to vertical in the diagram,
        and the angle of this tangent from the vertical, in degrees."""
        sc = scale(family)
        off = []
        for st in pen["steps"]:
            u = proj(st["tangent"], family) * sc
            off.append(math.degrees(math.asin(min(1.0, abs(float(u[0])) / float(np.hypot(*u))))))
        j = int(np.argmin(off))
        # a failed attempt is retried from the same member, along the same tangent
        while not pen["steps"][j]["converged"] and j + 1 < len(pen["steps"]):
            j += 1
        return j, off[j]

    # each pen is played alone, the orange pen on the tab "natural parameter" and the blue pen on the tab "both".
    # each attempt is given its start, its duration, and the hold within it
    timing = {}
    end2 = LAST_END + HOLD2
    for key, pen in pens.items():
        durations = raw_times(pen, key[0])
        d = np.array(durations) * (LAST_END - FIRST_ATTEMPT) / sum(durations)
        pause = np.zeros(len(d))
        if key[0] == "family11" and key[2] == "arclength":
            j, angle = fold_attempt(pen, key[0])
            pause[j] = FOLD_HOLD
            # the attempts before the first one from a member inside the close-up are shortened by both holds
            k = next(i for i, st in enumerate(pen["steps"]) if inside(proj(st["start"], key[0])[None], windows[key[0]])[0])
            d[:k] *= (end2 - FOLD_END_HOLD - FIRST_ATTEMPT - float(d[k:].sum()) - FOLD_HOLD) / float(d[:k].sum())
            held = FIRST_ATTEMPT + float(d[:j].sum()) + HOLD_AT * float(d[j])
            print(
                f"  {' '.join(key):28} in the close-up from {FIRST_ATTEMPT + float(d[:k].sum()):.2f}, held at the fold from {held:.2f} "
                f"to {held + FOLD_HOLD:.2f} with its tangent {angle:.1f} degrees from the vertical, "
                f"last member at {end2 - FOLD_END_HOLD - (1 - MEMBER_AT) * float(d[-1]):.2f}"
            )
        starts = FIRST_ATTEMPT + np.r_[0.0, np.cumsum(d + pause)[:-1]]
        timing[key] = [(float(t), float(dd), float(h)) for t, dd, h in zip(starts, d, pause, strict=True)]

    # the tangent and the half of the constraint line are drawn at these fractions of the width of the box of a
    # panel, measured in the continuation norm
    arrow_length = {"diagram": 0.12, "closeup": 0.3}
    line_half = {"diagram": 0.06, "closeup": 0.15}
    for family in NATURAL_STEPS:
        sc = scale(family)
        frame = diagram_frames[family]
        curve = np.array([proj(Y, family) for Y in curves[family]])
        runs_here = [pens[(family, s, m)] for s in NATURAL_STEPS[family] for m in METHODS]
        failed = [proj(st["predictor"], family) for pen in runs_here for st in pen["steps"] if not st["converged"]]
        everything = [curve, np.array(failed).reshape(-1, 2)] + [np.array([proj(Y, family) for Y in pen["members"]]) for pen in runs_here]
        data, camera = framed(box_of(everything, 0.04), sc, "diagram")
        # every mark is cut to the box of the diagram, in the close-up as well, so that the close-up zoomed out by hand
        # shows the whole diagram. The tangent and the constraint line of each panel are sized by the box of its camera
        boxes = {"diagram": data, "closeup": data}
        sizes = {"diagram": data, "closeup": windows[family]}
        for view, b in (("diagram", camera), ("closeup", cameras[family])):
            scene.track_set(f"box-{view}-{family}", frame=frame, tags={"element": "box", "view": view, "family": family}).add(rectangle(b))
        # the gray curve is drawn up to the last member of the farthest pen drawn on the tab of the pens, so that a
        # pen that reaches its end is not seen to stop short of the curve. A pen stopped by the minimum step is
        # left out, and where every pen drawn is stopped, i.e. at the fold of family 11 on the tab "natural
        # parameter", the curve is drawn up to the farthest pen of the step size
        for step_name in NATURAL_STEPS[family]:
            reach = {}
            for method in METHODS:
                pen = pens[(family, step_name, method)]
                k, w, gap = nearest_on(curve * sc, proj(pen["members"][-1], family) * sc)
                if gap > 1e-4:
                    raise ValueError(f"the last member of the {method} pen of {family} at the {step_name} step lies {gap:.1e} off the curve")
                reach[method] = (k + w, k, w, pen["stopped"] == "the step fell below the minimum")
            for shown_on, drawn_methods in (("natural", ["natural"]), ("both", list(METHODS))):
                ends = [reach[m] for m in drawn_methods if not reach[m][3]] or list(reach.values())
                _, k, w, _ = max(ends)
                drawn = np.r_[curve[: k + 1], curve[k : k + 1] + w * (curve[k + 1 : k + 2] - curve[k : k + 1])]
                tags = {"element": "curve", "family": family, "step": step_name, "pens": shown_on}
                scene.track_set(f"curve-diagram-{family}-{step_name}-{shown_on}", frame=frame, tags={"view": "diagram", **tags}).add(drawn)
                scene.track_set(f"curve-closeup-{family}-{step_name}-{shown_on}", frame=frame, tags={"view": "closeup", **tags}).add(drawn)
        orbits = [o for s in NATURAL_STEPS[family] for m in METHODS for o in pens[(family, s, m)]["orbits"]]
        orbit_box = framed(box_of(orbits + masses_near(family, orbits), 0.04), np.ones(2), "orbits")[1]
        # the smallest members shrink onto 𝓛₁, hence its label is drawn below the members and joined to it by a gray line
        low, high = min(float(o[:, 1].min()) for o in orbits), max(float(o[:, 1].max()) for o in orbits)
        label_y[family] = low - 0.08 * (high - low)
        l1x = body_attrs(family)["l1x"]
        scene.track_set(f"l1-leader-{family}", frame=rp, tags={"element": "l1_leader", "family": family}).add(
            np.array([[l1x, 0.0], [l1x, label_y[family]]])
        )
        scene.track_set(f"obox-{family}", frame=rp, tags={"element": "obox", "family": family}).add(rectangle(orbit_box))

        for step_name in NATURAL_STEPS[family]:
            for method in METHODS:
                pen = pens[(family, step_name, method)]
                slots = timing[(family, step_name, method)]
                # the orange pen is played on the tab "natural parameter", and the blue pen on the tab "both"
                shown_on = "natural" if method == "natural" else "both"
                tags = {"family": family, "step": step_name, "method": method, "pens": shown_on}
                name = f"{family}-{step_name}-{method}"
                sets: dict[tuple[str, str], list] = {}
                # the changes of the caption, i.e. the newest member of the pen and the halvings of its step
                ticks: list[tuple[float, str, float]] = []
                # a track that ends before START2 is held at its last point over the whole loop. The seed, i.e. the
                # first member, is drawn from this time, so that the orbit panel is not empty while a slide is paused
                # at the start of the loop
                early = np.array([START2 - 0.002, START2 - 0.001])
                members, times = [pen["members"][0]], [float(early[0])]
                # the halvings are counted from the step of the tab. The caption reads those of the step of the newest
                # member, and at the start of an attempt it is raised to those of the attempt when these are more
                full = NATURAL_STEPS[family][step_name] * (math.sqrt(weights(family)[-1]) if method == "arclength" else 1.0)
                stopped = pen["stopped"] == "the step fell below the minimum"
                for j, st in enumerate(pen["steps"]):
                    slot = slots[j]
                    t0, end = slot[0], phase(slot, 1.0)
                    nxt_ok = next((i for i in range(j + 1, len(slots)) if pen["steps"][i]["converged"]), None)
                    member_next = phase(slots[nxt_ok], MEMBER_AT) if nxt_ok is not None else end2
                    ok = st["converged"]
                    start, pred = proj(st["start"], family), proj(st["predictor"], family)
                    tau = st["tangent"]
                    # the direction of the tangent in the diagram scaled by sc, in which the norm is the length. The
                    # tangent of a pseudo-arclength step is a unit vector of the norm, and its constraint is the
                    # line through the predicted point normal to it, on which the member lies
                    u = (proj(tau, family) if tau is not None else pred - start) * sc
                    u = u / max(float(np.hypot(*u)), 1e-300)
                    normal = np.array([-u[1], u[0]])
                    predictor_times = np.array([phase(slot, TANGENT_END), phase(slot, PREDICTOR_END)])
                    corrector_times = np.array([phase(slot, CORRECTOR_START), phase(slot, MEMBER_AT)])
                    halvings = float(max(0, round(math.log2(full / abs(st["size"])))))
                    ticks.append((t0, "raise", halvings))
                    if ok:
                        ticks.append((phase(slot, MEMBER_AT), "halvings", halvings))
                    for view, b in boxes.items():
                        size = (sizes[view][1] - sizes[view][0]) * sc[0]

                        def put(element, P, cc, hold=None, view=view, b=b, sets=sets):
                            for Q, cq in clip_pieces(P, cc, b, hold):
                                sets.setdefault((element, view), []).append((Q, cq))

                        # the tangent and the constraint line of a step from inside the close-up are drawn in the
                        # close-up alone, as its dots below, so that the diagram is held still at the fold
                        held = view == "diagram" and inside(start[None], windows[family])[0]
                        if tau is not None and not held:
                            tip = start + arrow_length[view] * size * u / sc
                            # held to the end of the attempt also when it is cut at an edge of the box
                            put("tangent", np.array([start, tip]), np.array([t0, phase(slot, TANGENT_END)]), hold=end)
                            # the constraint line is shown whole, from its start to the end of the attempt
                            half = line_half[view] * size * normal / sc
                            for Q, _ in clip_pieces(np.array([pred - half, pred + half]), np.array([0.0, 1.0]), b):
                                sets.setdefault(("constraint", view), []).append((Q[[0, -1]], np.array([phase(slot, CONSTRAINT_START), end])))
                        if ok:
                            put("pred", np.array([start, pred]), predictor_times)
                            # the correction is one straight segment from the predicted point to the member, vertical
                            # for the orange pen and along the constraint line for the blue pen
                            put("corr", np.array([pred, proj(st["iterates"][-1], family)]), corrector_times)
                            continue
                        # a failed attempt keeps its predictor to its end, and a correction is not drawn
                        put("pred_fail", np.array([start, pred]), predictor_times, hold=end)
                        # a failed attempt is marked at its predicted point, in a panel whose box holds it, and in the
                        # close-up alone when the close-up holds it. Its red dot is kept until the next member of its pen
                        # is drawn, hence a run of halvings is seen as a row of red dots, and the larger red dot of a
                        # stopped pen is kept to the end of the loop
                        if not inside(pred[None], b)[0] or (view == "diagram" and inside(pred[None], windows[family])[0]):
                            continue
                        tf = phase(slot, CORRECTOR_START)
                        if j == len(slots) - 1 and stopped:
                            sets.setdefault(("stop_dot", view), []).append((np.array([pred, pred]), np.array([tf, tf + 0.001])))
                        else:
                            sets.setdefault(("fail_dot", view), []).append((np.array([pred, pred]), np.array([tf, member_next])))
                    if ok:
                        members.append(st["iterates"][-1])
                        times.append(phase(slot, MEMBER_AT))
                for i, (Y, t) in enumerate(zip(members, times, strict=True)):
                    m = proj(Y, family)
                    for view, b in boxes.items():
                        if inside(m[None], b)[0]:
                            sets.setdefault(("member", view), []).append((np.array([m, m]), np.array([t, t + 0.001])))
                    # the orbit of each member is drawn in gray from its time on, and in the color of its pen while it is the newest
                    orbit = pen["orbits"][i]
                    nxt = times[i + 1] - GAP if i + 1 < len(times) else end2
                    sets.setdefault(("orbits", "orbit"), []).append((orbit, t + np.linspace(0.0, 0.001, len(orbit))))
                    sets.setdefault(("newest", "orbit"), []).append((orbit, t + np.linspace(0.0, 1.0, len(orbit)) * (nxt - t)))
                    ticks.append((t, "p", float(Y[-1])))
                record_tags = {**tags, "pens": "both"}
                if method == "natural":
                    # on the tab "both" the run of the orange pen is drawn from the start of the loop as a finished
                    # record of its members, as dim dots
                    for view, b in boxes.items():
                        for Y in pen["members"]:
                            m = proj(Y, family)
                            if inside(m[None], b)[0]:
                                sets.setdefault(("record", view), []).append((np.array([m, m]), early))
                for (element, view), items in sets.items():
                    set_tags = record_tags if element.startswith("record") else tags
                    ts = scene.track_set(
                        f"{element}-{view}-{name}", frame=rp if view == "orbit" else frame, tags={"element": element, "view": view, **set_tags}
                    )
                    for P, cc in items:
                        ts.add(P, channels={"c": cc})
                state = {"p": float(pen["members"][0][-1]), "halvings": 0.0}
                changes = [(START2, caption_channels(state["p"], 0))]
                for t, key, value in sorted(ticks):
                    if key == "raise":
                        key, value = "halvings", max(state["halvings"], value)
                    state[key] = value
                    changes.append((t, caption_channels(state["p"], int(state["halvings"]))))
                cc, ch = hold_series(changes, START2, end2, gap=TICK_GAP)
                ts = scene.track_set(
                    f"ticker-{name}",
                    frame=rp,
                    tags={"element": "ticker", "family": family, "step": step_name, "pens": shown_on},
                    attrs={**body_attrs(family), "l1_label_y": label_y[family]},
                )
                ts.add(np.zeros((len(cc), 2)), channels={"c": cc, **ch})

    family = scene.choice("family", ["lyapunov", "family11"], labels=["𝓛₁ Lyapunov family, in C", "family 11, in e"])
    step = scene.choice("step", list(NATURAL_STEPS["lyapunov"]), default="medium", labels=["small step", "medium step", "large step"])
    shown = scene.choice("pens", ["natural", "both"], labels=["natural parameter", "both"])
    scene.clock("value", channels=["c"], steps=STEPS2, range=[START2, end2], labels=["continuation"])
    # the ticker of the pen played on the tab of the pens, i.e. of the orange pen alone or of the blue pen, drives every panel
    driver = ty.driver(ty.sets(element="ticker", family=family, step=step, pens=shown), {"index": 0})

    def q(element: str, view: str, m: str):
        return ty.sets(element=element, view=view, family=family, step=step, method=m, pens=shown)

    # the marks of the close-up are left out of the fit of its camera, which is fitted to the window of the close-up alone
    def fit(view: str) -> dict:
        return {"fit": False} if view == "closeup" else {}

    def pen_layers(view: str, m: str, color: str) -> list:
        def q_(element):
            return q(element, view, m)

        nofit = fit(view)

        constraint, tangent = [], []
        if m == "arclength":
            constraint = [ty.track(q_("constraint"), before="hidden", after="hidden", color=VIOLET, width=1.5, opacity=0.5, **nofit)]
            # the tangent is drawn opaque over the predictors, which lie along it, and under the members
            tangent = [ty.track(q_("tangent"), reveal="grow", before="hidden", after="hidden", color=VIOLET, width=2.0, opacity=1.0, **nofit)]
        return [
            *constraint,
            ty.track(q_("pred_fail"), reveal="grow", before="hidden", after="hidden", color=color, width=2.0, opacity=0.4, **nofit),
            ty.track(q_("pred"), reveal="grow", before="hidden", color=color, width=2.0, **nofit),
            ty.track(q_("corr"), reveal="grow", before="hidden", color=color, width=2.0, **nofit),
            *tangent,
            ty.track(q_("member"), reveal="grow", before="hidden", head={"color": color, "size": 8}, color=color, width=1.0, **nofit),
        ]

    def dot_layers(view: str) -> list:
        """The red dots, drawn over every line as heads, which keep their size on the screen. The dot of a failed
        attempt is shown until the next member of its pen is drawn, and the larger dot of a stopped pen to the end."""
        out = []
        for m in METHODS:
            out.append(
                ty.track(q("fail_dot", view, m), reveal="grow", before="hidden", after="hidden", head={"color": RED, "size": 9}, color=RED, width=1.0, **fit(view))
            )
            out.append(ty.track(q("stop_dot", view, m), reveal="grow", before="hidden", head={"color": RED, "size": 13}, color=RED, width=1.0, **fit(view)))
        return out

    for view, label in (("diagram", "diagram"), ("closeup", "close-up")):
        # the diagram outlines the area that the close-up shows, as it is panned and zoomed, at least WINDOW_MIN CSS
        # pixels wide and tall, since the close-up of family 11 is narrower than a pixel of the diagram
        outline = []
        if view == "diagram":
            outline = [ty.outline("closeup", opacity=0.5, width=1.0, dash=(WINDOW_DASH, WINDOW_DASH / 2), min_size=WINDOW_MIN)]
        scene.view(
            view,
            frame=family,
            driver=driver,
            camera={"kind": "plane", "plane": "xy", "aspect": "free"},
            label=label,
            layers=[
                ty.track(ty.sets(element="box", view=view, family=family), opacity=0.0, width=1.0),
                ty.axes(),
                ty.grid(labels=True),
                *outline,
                ty.track(ty.sets(element="curve", view=view, family=family, step=step, pens=shown), color=GRAY, width=2.0, opacity=0.8, **fit(view)),
                ty.track(q("record", view, "natural"), head={"color": DIM_ORANGE, "size": 7}, color=DIM_ORANGE, width=1.0, **fit(view)),
                *pen_layers(view, "natural", ORANGE),
                *pen_layers(view, "arclength", BLUE),
                *dot_layers(view),
            ],
        )

    def orbit_sets(element: str, m: str):
        return ty.sets(element=element, view="orbit", family=family, step=step, method=m, pens=shown)

    # one orbit panel for the pen in play, in which the earlier members are gray and the newest member is drawn in the color of the pen
    scene.view(
        "orbits",
        frame=rp,
        driver=driver,
        camera={"kind": "plane", "plane": "xy"},
        label="members, rotating-pulsating frame",
        layers=[
            ty.track(ty.sets(element="obox", family=family), opacity=0.0, width=1.0),
            ty.axes(),
            ty.track(ty.sets(element="l1_leader", family=family), color=GRAY, width=1.0, opacity=0.6),
            *[ty.track(orbit_sets("orbits", m), before="hidden", color=GRAY, width=1.0, opacity=0.35) for m in METHODS],
            *[
                ty.track(orbit_sets("newest", m), before="hidden", after="hidden", color=color, width=2.2)
                for m, color in (("natural", ORANGE), ("arclength", BLUE))
            ],
            *body_layers,
        ],
    )
    scene.panel("diagram", "diagram")
    scene.panel("closeup", "closeup")
    scene.panel("orbits", "orbits")
    scene.layout(ty.split("col", 0.55, ty.split("row", 0.4, "diagram", "closeup"), "orbits"))
    scene.tabs(family, label="family")
    scene.tabs(step, label="step size")
    scene.tabs(shown, label="pens")
    scene.transport()
    scene.readout(
        "caption",
        family,
        " · moving pen at ",
        ty.channel("p_int"),
        ".",
        *[ty.channel(f"p_{i}") for i in range(1, 5)],
        " · halvings of its step: ",
        ty.channel("halvings"),
    )
    scene.write(out / "continuation.tys", out / "continuation.tyd")
    return scene.write_html(out / "continuation.html")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=(__doc__ or "").split("\n\n")[0])
    parser.add_argument("--out", type=Path, default=HERE, help="the directory to write the pages into")
    parser.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 2), help="the number of worker processes")
    args = parser.parse_args(argv)
    t_all = time.time()
    with ProcessPoolExecutor(max_workers=args.jobs) as pool:
        seeds = {"lyapunov": lyapunov_seed(), "family11": family11_seed()}
        t0 = time.time()
        ref_futures = {case: pool.submit(references_job, case) for case in MU}
        pen_jobs = [(f, s, m, seeds[f]) for f in FAMILIES for s in NATURAL_STEPS[f] for m in ("natural", "arclength")]
        pen_jobs += [(f, "curve", "arclength", seeds[f]) for f in FAMILIES]
        pen_results = list(pool.map(continuation_job, pen_jobs))
        t_pens = time.time() - t0
        refs = {case: f.result()["references"] for case, f in ref_futures.items()}
        t_refs = time.time() - t0
        jobs = [
            (case, system, targeting, S, guess, refs[case][system])
            for case in MU
            for system in SYSTEMS
            for targeting in TARGETINGS
            for S in SEGMENTS
            for guess in GUESSES
        ]
        t0 = time.time()
        # the slowest runs first, so that the pool stays busy to the end
        jobs.sort(key=lambda j: -j[3])
        runs = {r["key"]: r for r in pool.map(correction_job, jobs, chunksize=1)}
        t_runs = time.time() - t0
    print(f"references in {t_refs:.0f} s, the 14 continuation runs in {t_pens:.0f} s, the {len(runs)} correction runs in {t_runs:.0f} s")

    print("iterations to converge (o), or to fail by a propagation (p), by a growing norm (g), by a period that is not positive (t), or by the iteration limit (m):")
    for case in MU:
        for system in SYSTEMS:
            for targeting in TARGETINGS:
                for guess in GUESSES:
                    row = []
                    for S in SEGMENTS:
                        r = runs[(case, system, targeting, S, guess)]
                        n = len(r["iterates"]) - 1
                        kind = (
                            "o"
                            if r["converged"]
                            else "p"
                            if not math.isfinite(r["iterates"][-1]["norm"])
                            else "g"
                            if "grew" in (r["failure"] or "")
                            else "t"
                            if "period" in (r["failure"] or "")
                            else "m"
                        )
                        row.append(f"{n:2d}{kind}")
                    print(f"  {case:14} {system:6} {targeting:5} {guess:7} " + " ".join(row))

    pens = {r["key"]: r for r in pen_results if r["key"][1] != "curve"}
    curves = {r["key"][0]: r["members"] for r in pen_results if r["key"][1] == "curve"}
    for key, r in sorted(pens.items()):
        attempts, fails = len(r["steps"]), sum(not s["converged"] for s in r["steps"])
        halvings = round(math.log2(r["steps"][0]["size"] / min(s["size"] for s in r["steps"])))
        print(
            f"  {' '.join(key):28} {len(r['members']):3d} members, {fails:2d} failed attempts of {attempts:3d}, {halvings:2d} halvings at most, "
            f"last p = {r['members'][-1][-1]:.6f}, {r['stopped']}"
        )
    for family, members in curves.items():
        print(
            f"  {family} curve: {len(members)} members, p from {members[0][-1]:.5f} to {members[-1][-1]:.5f}, p max {max(m[-1] for m in members):.6f}"
        )

    t0 = time.time()
    sizes1 = build_correction(refs, runs, args.out)
    t_write1 = time.time() - t0
    t0 = time.time()
    sizes2 = build_continuation(pens, curves, args.out)
    t_write2 = time.time() - t0
    for name, sizes, t in (("correction", sizes1, t_write1), ("continuation", sizes2, t_write2)):
        print(
            f"wrote {name}.html ({sizes['page'] / 1e6:.2f} MB, the .tyd {(args.out / f'{name}.tyd').stat().st_size / 1e6:.2f} MB) in {t:.0f} s"
        )

    record = {
        "readme": "Written by build.py. The references are (x0, ydot0, T) of the symmetric orbit that leaves the x-axis at a right angle "
        "at theta0, in the rotating-pulsating frame. The corrections give the first node (x, y, xdot, ydot) and the targeted arc of each "
        "converged run. The members of a continuation run are Y = (x0, ydot0, T/2, C) for the Lyapunov family and Y = (x0, ydot0, e) "
        "for family 11 at theta0 = 0 and the period 2 pi.",
        "mu": MU,
        "systems": {k: {"e": v[0], "theta0": v[1]} for k, v in SYSTEMS.items()},
        "references": refs,
        "corrections": [
            {
                "case": k[0],
                "system": k[1],
                "targeting": k[2],
                "S": k[3],
                "guess": k[4],
                "converged": r["converged"],
                "failure": r["failure"],
                "norms": [it["norm"] if math.isfinite(it["norm"]) else None for it in r["iterates"]],
                "node0": [float(x) for x in r["iterates"][-1]["nodes"][0]] if r["converged"] else None,
                "arc": r["iterates"][-1]["arc"] if r["converged"] else None,
            }
            for k, r in sorted(runs.items())
        ],
        "continuations": [
            {
                "family": k[0],
                "step": k[1],
                "method": k[2],
                "stopped": r["stopped"],
                "members": [[float(x) for x in Y] for Y in r["members"]],
            }
            for k, r in sorted(pens.items())
        ],
        "curves": {f: [[float(x) for x in Y] for Y in m] for f, m in curves.items()},
    }
    (args.out / "runs.json").write_text(json.dumps(record, indent=1))
    print(f"wrote runs.json, all in {time.time() - t_all:.0f} s")


if __name__ == "__main__":
    main()
