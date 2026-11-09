"""The frames scene of the elliptic restricted three-body problem (ER3BP), as one TyCHO page.

The scene shows the primary m1, the secondary m2, the five libration points, a grid of straight lines, and an
optional Broucke orbit in three views, one per frame: the rotating-pulsating frame (x, y), the rotating frame
(xi, eta), and the barycentric inertial frame (X, Y). The rotating frame is the pulsating frame scaled by the
separation rho(theta) = (1 - e^2) / (1 + e cos theta) of the primary and the secondary, and the barycentric
inertial frame is the rotating frame turned by the true anomaly theta. The page opens with the panel of the
barycentric inertial frame alone, and the presenter adds the panels of the other two views from the Add panel
group of the viewer as the talk reaches them.

Run it with the pytycho of a TyCHO checkout::

    uv run --project /Users/claudiovestini/git/tycho/code python build.py

It reads the Broucke input ``examples/broucke/broucke-input.tyd`` of the same checkout and writes
``frames.tys``, ``frames.tyd``, and ``frames.html`` next to this script. It imports only NumPy, pytycho, and
the standard library.

Systems: a tab picks the mass ratio. At mu = 0.5 the orbit is the periapsis branch of Broucke's family 11, and
at mu = 0.012155 the periapsis branch of family 7, since these are the branches of the input at the two mass
ratios. Each system has one driver set and one orbit set, tagged with the system, and the eccentricity slider
ranges over the driver set of the selected system.

Driver: the secondary, at rest in the rotating-pulsating frame, sampled at equal steps of theta over one forcing
period, with the channels theta, t, and rho. The time t is the mean anomaly from Kepler's equation, zero at
periapsis, so that a clock on t shows the primary and the secondary speed up at periapsis. The libration points
are bodies at their CR3BP positions in the rotating-pulsating frame, carried as attributes of the driver set.
The grid is drawn in the driver's context (rule L6), so that it is rigid in the pulsating panel, breathes in the
rotating panel, and breathes and turns in the inertial panel.

Camera: an invisible track set is drawn in every view, i.e. a diagonal of a box in the frame of the view. In the
rotating and the inertial views, the box is the square of half side BOX, and the two panels are thus fitted to the
same box for every eccentricity, system, and orbit switch. Nothing is scaled in the pulsating view, hence its box is
fitted per system to the grid and to every orbit of the system, and the pulsating panel is drawn at a larger scale.
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import numpy as np

import pytycho as ty

HERE = Path(__file__).resolve().parent
TYCHO = Path("/Users/claudiovestini/git/tycho/code")
INPUT = TYCHO / "examples" / "broucke" / "broucke-input.tyd"
# the SHA-256 of broucke-input.tyd as released, from examples/broucke/build.py
INPUT_SHA256 = "763334cf42d7dd1712de1954c3318eab5ec7e3b4d060623e09bee824ed86dba5"

# each system maps to its tab label, its mass ratio, and the Broucke family whose periapsis branch is shown
SYSTEMS = {
    "earth-moon": ("μ = 0.012155", 0.012155, 7),
    "copenhagen": ("μ = 0.5", 0.5, 11),
}
# each frame maps to its label, its axis titles, the label of its view, and the colormap of the orbit
FRAMES = {
    "rotating-pulsating": ("rotating-pulsating", ("x", "y", "z"), "(x, y)", "viridis"),
    "rotating": ("rotating", ("ξ", "η", "ζ"), "(ξ, η)", "blues"),
    "barycentric-inertial": ("barycentric inertial", ("X", "Y", "Z"), "(X, Y)", "plasma"),
}
E_STEP = 0.02  # the spacing of the eccentricity grid, a multiple of the 0.005 step of the Broucke branches
DRIVER_SAMPLES = 361
ORBIT_SAMPLES = 480
STEPS = 480
GRID_RADIUS = 1.5
GRID_STEP = 0.25
GRID_MAJOR = 0.5
CIRCLE_SAMPLES = 181
# the half side of the fitted box of the rotating and the inertial views, large enough for the grid at apoapsis at
# the largest eccentricity, 1.5 (1 + 0.5)
BOX = 2.25
E_RANGE = (0.0, 0.5)  # the range of the orbit colormaps, shared by the two systems
# the part of each colormap that is used, which stops short of the yellow end of viridis and plasma, the color of the head
E_CLIP = (0.0, 0.85)

BG, FG, LINE = "#050505", "#f2f2ef", "#232320"
# the primary in the blue and the secondary in the gray of the CR3BP diagram of the talk, and each libration point in
# orange where it is unstable and in violet where it is stable, between the colors of the dark and the light mode
M1_COLOR, M2_COLOR = "#56b4e9", "#9a9a94"
UNSTABLE_COLOR, STABLE_COLOR = "#e8743f", "#b043e4"
# the Routh mass ratio, under which L4 and L5 are linearly stable
MU_ROUTH = (1 - np.sqrt(23 / 27)) / 2
# the y of a dot body that is not drawn at the selected mass ratio, far outside every panel. the camera is fitted to
# the track layers alone (section 2.8 of the scene format), hence such a body does not move the fit
AWAY = 1e3
# the offset of the label of m2 below the x axis, and of the labels of L1 and L2 above it, in the rotating-pulsating
# frame, so that the three labels are clear of each other and of the dots on the axis at the Earth-Moon mass ratio
M2_LABEL_DY, L12_LABEL_DY = -0.11, 0.11
HEAD_COLOR = "#f0e442"
# a neutral gray, so that the grid is not confused with the orbit in the colormap of any frame
GRID_COLOR = "#8a8f9c"


def collinear_quintics(mu: float) -> dict[str, tuple[np.ndarray, float, float]]:
    """The quintic in the distance gamma of each collinear point from its nearest primary, with the sign and
    the origin that map gamma to x, i.e. x = origin + sign * gamma."""
    return {
        "L1": (np.array([1.0, -(3 - mu), 3 - 2 * mu, -mu, 2 * mu, -mu]), -1.0, 1 - mu),
        "L2": (np.array([1.0, 3 - mu, 3 - 2 * mu, -mu, -2 * mu, -mu]), 1.0, 1 - mu),
        "L3": (np.array([1.0, 2 + mu, 1 + 2 * mu, -(1 - mu), -2 * (1 - mu), -(1 - mu)]), -1.0, -mu),
    }


def libration_points(mu: float) -> dict[str, float]:
    """The x of L1, L2, and L3 and the (x, y) of L4 in the rotating-pulsating frame of the CR3BP at mass ratio mu.

    Each collinear point is the real root in (0, 1] of its quintic (in (0, 2) for L3), found with NumPy's roots
    and polished by Newton's method on the same polynomial."""
    out = {}
    for name, (coefficients, sign, origin) in collinear_quintics(mu).items():
        roots = np.roots(coefficients)
        real = roots[(np.abs(roots.imag) < 1e-9) & (roots.real > 0) & (roots.real < 2)].real
        if len(real) != 1:
            raise SystemExit(f"the quintic of {name} at mu = {mu} has the positive real roots {real}, not one")
        gamma = float(real[0])
        derivative = np.polyder(coefficients)
        for _ in range(4):
            gamma -= np.polyval(coefficients, gamma) / np.polyval(derivative, gamma)
        out["x" + name] = origin + sign * gamma
    out["xL45"], out["yL45"] = 0.5 - mu, float(np.sqrt(3.0) / 2)
    # the dot of L4 and L5 in the color of their stability is drawn at the points, and the other dot away
    stable = mu < MU_ROUTH
    for kind, shown in (("stable", stable), ("unstable", not stable)):
        out[f"xL45{kind}"], out[f"yL45{kind}"] = (out["xL45"], out["yL45"]) if shown else (0.0, AWAY)
    return out


def kepler_channels(e: float, n: int) -> dict[str, np.ndarray]:
    """The channels theta, t, and rho at n equal steps of theta over one forcing period, with t the mean anomaly."""
    theta = np.linspace(0.0, 2 * np.pi, n)
    eccentric = 2 * np.arctan2(np.sqrt(1 - e) * np.sin(theta / 2), np.sqrt(1 + e) * np.cos(theta / 2))
    t = eccentric - e * np.sin(eccentric)
    t[0], t[-1] = 0.0, 2 * np.pi
    return {"theta": theta, "t": t, "rho": (1 - e**2) / (1 + e * np.cos(theta))}


def read_input() -> ty.Container:
    """The Broucke input, checked against its released SHA-256."""
    data = INPUT.read_bytes()
    if (digest := hashlib.sha256(data).hexdigest()) != INPUT_SHA256:
        raise SystemExit(f"{INPUT} has SHA-256 {digest}, not the {INPUT_SHA256} of the released input")
    return ty.Container(data)


def eccentricity_grid(e: np.ndarray) -> list[int]:
    """The members of a branch at the multiples of E_STEP below its last eccentricity, and its last member."""
    last = float(e[-1])
    members = []
    for target in np.arange(0.0, last - E_STEP / 2, E_STEP):
        i = int(np.argmin(np.abs(e - target)))
        if abs(e[i] - target) > 1e-9:
            raise SystemExit(f"the branch does not have a member at e = {target}")
        members.append(i)
    return members + [len(e) - 1]


def grid_lines(scene: ty.Scene, pulsating) -> tuple[ty.TrackSet, ty.TrackSet]:
    """The minor and the major lines of the grid, as chords of the disc of radius GRID_RADIUS, and its circle."""
    minor = scene.track_set("grid-minor", frame=pulsating, label="grid, minor lines")
    major = scene.track_set("grid-major", frame=pulsating, label="grid, major lines and circle")
    n = int(round(GRID_RADIUS / GRID_STEP))
    for k in range(-n + 1, n):
        c = k * GRID_STEP
        half = np.sqrt(GRID_RADIUS**2 - c**2)
        target = major if abs(c / GRID_MAJOR - round(c / GRID_MAJOR)) < 1e-9 else minor
        target.add([[c, -half], [c, half]])
        target.add([[-half, c], [half, c]])
    phi = np.linspace(0.0, 2 * np.pi, CIRCLE_SAMPLES)
    major.add(GRID_RADIUS * np.column_stack([np.cos(phi), np.sin(phi)]))
    return minor, major


def build() -> None:
    source = read_input()
    meta = source.meta.get("sets", {})
    scene = ty.Scene(title="Frames of the elliptic restricted three-body problem", theme={"background": BG, "foreground": FG, "grid": LINE})

    label, axes, _, _ = FRAMES["rotating-pulsating"]
    pulsating = scene.frame("rotating-pulsating", label=label, axes=axes, unit="DU")
    label, axes, _, _ = FRAMES["rotating"]
    rotating = scene.frame("rotating", label=label, axes=axes, unit="DU", parent=pulsating, scale=ty.channel("rho"))
    label, axes, _, _ = FRAMES["barycentric-inertial"]
    scene.frame(
        "barycentric-inertial", label=label, axes=axes, unit="DU", parent=rotating, rotation=ty.rotation("z", ty.channel("theta"))
    )

    m1 = scene.body("m1", frame=pulsating, position=[-ty.attr("mu"), 0.0, 0.0], label="m₁", color=M1_COLOR)
    m2 = scene.body("m2", frame=pulsating, position=[1 - ty.attr("mu"), 0.0, 0.0], color=M2_COLOR)
    # a body is drawn in one color, hence L4 and L5 are each a labeled body without a trail, under one dot body per
    # stability, of which the one of the other stability is away. the labels of m2, L1, and L2 are bodies of their own
    # off the axis, drawn without a visible dot
    offset = [
        scene.body("m2-label", frame=pulsating, position=[1 - ty.attr("mu"), M2_LABEL_DY, 0.0], label="m₂", color=M2_COLOR),
        scene.body("L1-label", frame=pulsating, position=[ty.attr("xL1"), L12_LABEL_DY, 0.0], label="𝓛₁", color=UNSTABLE_COLOR),
        scene.body("L2-label", frame=pulsating, position=[ty.attr("xL2"), L12_LABEL_DY, 0.0], label="𝓛₂", color=UNSTABLE_COLOR),
    ]
    labels = [
        scene.body("L4", frame=pulsating, position=[ty.attr("xL45"), ty.attr("yL45"), 0.0], label="𝓛₄", color=STABLE_COLOR),
        scene.body("L5", frame=pulsating, position=[ty.attr("xL45"), -ty.attr("yL45"), 0.0], label="𝓛₅", color=STABLE_COLOR),
    ]
    points = [
        scene.body(f"L{k}", frame=pulsating, position=[ty.attr(f"xL{k}"), 0.0, 0.0], label="𝓛₃" if k == 3 else None, color=UNSTABLE_COLOR)
        for k in (1, 2, 3)
    ]
    for kind, color in (("stable", STABLE_COLOR), ("unstable", UNSTABLE_COLOR)):
        x, y = ty.attr(f"xL45{kind}"), ty.attr(f"yL45{kind}")
        points.append(scene.body(f"L4-{kind}", frame=pulsating, position=[x, y, 0.0], color=color))
        points.append(scene.body(f"L5-{kind}", frame=pulsating, position=[x, -y, 0.0], color=color))

    for system, (_, mu, family) in SYSTEMS.items():
        branch = f"family-{family}-periapsis"
        if meta.get(branch, {}).get("mu") != mu:
            raise SystemExit(f"{INPUT} does not have a track set {branch!r} at mass ratio {mu}")
        offsets = source.view(f"{branch}/offsets")
        positions = source.view(f"{branch}/positions")
        anomaly, time, rho = (source.view(f"{branch}/channels/{n}") for n in ("true_anomaly", "time", "rho"))
        eccentricity = source.view(f"{branch}/parameters/eccentricity")
        period = source.view(f"{branch}/parameters/period")
        members = eccentricity_grid(eccentricity)

        attrs = {"mu": mu, "family": family, **libration_points(mu)}
        driver = scene.track_set(
            f"secondary-{system}",
            frame=pulsating,
            tags={"system": system, "role": "secondary"},
            attrs=attrs,
            periodic=True,
            dtype="float64",
            label=f"secondary over one forcing period, mu = {mu}",
        )
        orbit = scene.track_set(
            f"orbit-{system}",
            frame=pulsating,
            tags={"system": system, "role": "orbit"},
            attrs={"mu": mu},
            periodic=True,
            label=f"Broucke family {family}, periapsis branch, mu = {mu}",
        )
        for i in members:
            e = float(eccentricity[i])
            forcing = period[i] / (2 * np.pi)
            if abs(forcing - round(forcing)) > 1e-9:
                raise SystemExit(f"{branch} member {i} has a period of {forcing} forcing periods, not a whole number")
            parameters = {"eccentricity": e, "K": float(round(forcing))}
            driver.add(np.tile([1 - mu, 0.0], (DRIVER_SAMPLES, 1)), channels=kepler_channels(e, DRIVER_SAMPLES), parameters=parameters)
            rows = slice(int(offsets[i]), int(offsets[i + 1]))
            orbit.add(positions[rows], channels={"theta": anomaly[rows], "t": time[rows], "rho": rho[rows]}, parameters=parameters)
        for ts in (driver, orbit):
            ts.describe("theta", unit="rad")
            ts.describe("t", unit="TU")
            ts.describe("eccentricity", label="eccentricity")
            ts.describe("K", label="forcing periods")
        orbit.thin(ORBIT_SAMPLES, frames=list(FRAMES))
        # the box of the pulsating view holds the grid and every orbit of the system, which are fixed in this frame
        drawn = np.concatenate([positions[int(offsets[i]) : int(offsets[i + 1])] for i in members])
        low = np.minimum(drawn.min(axis=0), -GRID_RADIUS)
        high = np.maximum(drawn.max(axis=0), GRID_RADIUS)
        box = scene.track_set(
            f"box-rotating-pulsating-{system}",
            frame=pulsating,
            tags={"system": system, "role": "box"},
            label=f"fitted box in the rotating-pulsating frame, mu = {mu}",
        )
        box.add([low, high])
        grid = np.round(eccentricity[members], 4).tolist()
        print(f"{system}: mu = {mu}, family {family}, {len(members)} eccentricities {grid}", flush=True)

    minor, major = grid_lines(scene, pulsating)
    boxes = {}
    for fid in ("rotating", "barycentric-inertial"):
        boxes[fid] = scene.track_set(f"box-{fid}", frame=fid, label=f"fitted box in the {fid} frame")
        boxes[fid].add([[-BOX, -BOX], [BOX, BOX]])

    system = scene.choice("system", list(SYSTEMS), default="earth-moon", labels=[v[0] for v in SYSTEMS.values()])
    e = scene.selector("e", parameter="eccentricity", default=0.0)
    show_orbit = scene.toggle("orbit", default=False)
    drivers = ty.sets(system=system, role="secondary")
    orbits = ty.sets(system=system, role="orbit")
    boxes["rotating-pulsating"] = ty.sets(system=system, role="box")
    scene.clock("fraction", channels=["t", "theta"], labels=["time t", "true anomaly θ"], steps=STEPS, laps=1)

    for fid, (_, _, label, colormap) in FRAMES.items():
        by_e = {"parameter": "eccentricity", "colormap": colormap, "range": list(E_RANGE), "clip": list(E_CLIP)}
        moving = None if fid == "rotating-pulsating" else 1.0
        scene.view(
            fid,
            frame=fid,
            label=label,
            driver=ty.driver(drivers, e),
            camera={"kind": "plane", "plane": "xy"},
            layers=[
                ty.track(boxes[fid], "all", color=BG, opacity=0.0),
                ty.track(minor, "all", context="driver", color=GRID_COLOR, opacity=0.25, width=1.0),
                ty.track(major, "all", context="driver", color=GRID_COLOR, opacity=0.55, width=1.25),
                ty.track(orbits, e, color=by_e, width=2.0, visible=show_orbit),
                ty.track(orbits, e, trail=0.3, taper=(0, 0), color=by_e, width=18.0, opacity=0.3, visible=show_orbit),
                ty.track(orbits, e, trail=0.3, taper=(0, 0), color=by_e, width=5.0, visible=show_orbit),
                ty.track(orbits, e, trail=0.3, head={"color": HEAD_COLOR, "size": 9}, color="#ffffff", width=2.0, visible=show_orbit),
                *(ty.body(p, size=0.01) for p in offset),
                *(ty.body(p, size=5.0) for p in labels),
                *(ty.body(p, trail=moving, size=5.0) for p in points),
                ty.body(m1, trail=moving, size=7.0),
                ty.body(m2, trail=moving, size=6.0),
                ty.axes(),
            ],
        )
    scene.panel("barycentric-inertial", "barycentric-inertial")
    scene.layout("barycentric-inertial")

    scene.tabs(system, label="mass ratio")
    scene.slider(e, label="eccentricity e", domain=drivers)
    scene.toggle_control(show_orbit, label="Broucke orbit")
    scene.transport()
    scene.readout(
        "caption",
        "e = ",
        {"member": "eccentricity", "digits": 3},
        ",  θ = ",
        {"channel": "theta", "digits": 3},
        " rad,  t = ",
        {"channel": "t", "digits": 3},
        " TU,  ρ(θ) = ",
        {"channel": "rho", "digits": 4},
        ",  K = ",
        {"member": "K"},
        ",  μ = ",
        {"attr": "mu"},
        ",  family ",
        {"attr": "family"},
    )

    scene.write(HERE / "frames.tys", HERE / "frames.tyd")
    sizes = scene.write_html(HERE / "frames.html")
    for name in ("frames.tys", "frames.tyd", "frames.html"):
        print(f"wrote {HERE / name} ({(HERE / name).stat().st_size / 1e3:.0f} kB)")
    if sizes["page"] > 1.5e6:
        sys.exit(f"frames.html is {sizes['page'] / 1e6:.2f} MB, over the 1.5 MB budget")


if __name__ == "__main__":
    build()
