import re
import sys
from pathlib import Path

import numpy as np
from scipy.integrate import solve_ivp

import pytycho as ty

MU = 0.01215
DU = 384400.0
Z_START, Z_END, STEPS = 8000.0, 40000.0, 40
RICHARDSON_1980_SEED = (0.8234, 0.1332)
DENSE = 2000
SAMPLES = 480
LAPS = 9
ACCENT_OF_BOTH_MODES = "#f08050"
QUARTER_PERIOD_OF_LOOP = 0.25 / LAPS
VIEWER = re.compile(r"<tycho-viewer\b.*?</tycho-viewer>", re.S)


def rhs(t, s):
    x, y, z, vx, vy, vz = s[:6]
    k1 = (1 - MU) / np.sqrt((x + MU) ** 2 + y**2 + z**2) ** 3
    k2 = MU / np.sqrt((x - 1 + MU) ** 2 + y**2 + z**2) ** 3
    ax = x + 2 * vy - k1 * (x + MU) - k2 * (x - 1 + MU)
    return np.array([vx, vy, vz, ax, y - 2 * vx - (k1 + k2) * y, -(k1 + k2) * z])


def rhs_stm(t, s):
    x, y, z = s[:3]
    d1, d2 = np.array([x + MU, y, z]), np.array([x - 1 + MU, y, z])
    r1, r2 = np.linalg.norm(d1), np.linalg.norm(d2)
    hessian = np.diag([1.0, 1.0, 0.0])
    hessian += (1 - MU) * (3 * np.outer(d1, d1) / r1**5 - np.eye(3) / r1**3)
    hessian += MU * (3 * np.outer(d2, d2) / r2**5 - np.eye(3) / r2**3)
    a = np.zeros((6, 6))
    a[:3, 3:] = np.eye(3)
    a[3:, :3] = hessian
    a[3, 4], a[4, 3] = 2.0, -2.0
    return np.concatenate([rhs(t, s), (a @ s[6:].reshape(6, 6)).ravel()])


def crossing(t, s):
    return s[1] if t > 0.5 else 1.0


crossing.direction = -1
crossing.terminal = True


def correct(x0, z0, vy0):
    for _ in range(20):
        start = np.concatenate([[x0, 0.0, z0, 0.0, vy0, 0.0], np.eye(6).ravel()])
        sol = solve_ivp(rhs_stm, (0.0, 6.0), start, events=crossing, method="DOP853", rtol=1e-12, atol=1e-12)
        if not sol.t_events[0].size:
            raise RuntimeError(f"no crossing from x0 = {x0}, z0 = {z0}, vy0 = {vy0}")
        half, end = sol.t_events[0][0], sol.y_events[0][0]
        miss = end[[3, 5]]
        if np.abs(miss).max() < 1e-11:
            return x0, vy0, 2 * half
        stm = end[6:].reshape(6, 6)
        rate = rhs(half, end)
        jacobian = stm[np.ix_([3, 5], [0, 4])] - np.outer(rate[[3, 5]], stm[1, [0, 4]]) / end[4]
        dx0, dvy0 = np.linalg.solve(jacobian, -miss)
        x0, vy0 = x0 + dx0, vy0 + dvy0
    raise RuntimeError(f"the corrector does not converge at z0 = {z0}")


def halo_family():
    members = []
    x0, vy0 = RICHARDSON_1980_SEED
    for z0 in np.linspace(Z_START, Z_END, STEPS + 1) / DU:
        if len(members) >= 2:
            (_, xa, va, _), (_, xb, vb, _) = members[-2:]
            x0, vy0 = 2 * xb - xa, 2 * vb - va
        members.append((z0, *correct(x0, z0, vy0)))
    return members


def jacobi(s):
    x, y, z, vx, vy, vz = s
    r1 = np.sqrt((x + MU) ** 2 + y**2 + z**2)
    r2 = np.sqrt((x - 1 + MU) ** 2 + y**2 + z**2)
    return x**2 + y**2 + 2 * (1 - MU) / r1 + 2 * MU / r2 - (vx**2 + vy**2 + vz**2)


def build():
    scene = ty.Scene(title="Earth–Moon L1 halo family")
    rotating = scene.frame("rotating", label="rotating", axes=("x", "y", "z"), unit="DU")
    inertial = scene.frame("barycentric-inertial", label="barycentric inertial", axes=("X", "Y", "Z"), unit="DU",
                           parent=rotating, rotation=ty.rotation("z", ty.channel("time")))
    earth = scene.body("earth", frame=rotating, position=[-ty.attr("mu"), 0.0, 0.0], label="Earth", color="#56b4e9")
    moon = scene.body("moon", frame=rotating, position=[1 - ty.attr("mu"), 0.0, 0.0], label="Moon", color="#999999")
    scene.frame("inertial-moon", label="inertial, centered on the Moon", axes=("X", "Y", "Z"), unit="DU",
                parent=inertial, origin=moon)
    frames = ["rotating", "barycentric-inertial", "inertial-moon"]

    family = scene.track_set("halo", frame=rotating, tags={"family": "L1 halo"}, attrs={"mu": MU}, periodic=True,
                             label="Earth–Moon L1 halo family")
    members = halo_family()
    for z0, x0, vy0, period in members:
        t = np.linspace(0.0, period, DENSE)
        sol = solve_ivp(rhs, (0.0, period), [x0, 0.0, z0, 0.0, vy0, 0.0], t_eval=t, method="DOP853",
                        rtol=1e-12, atol=1e-12)
        positions = sol.y[:3].T
        family.add(positions, channels={"time": t}, parameters={
            "z0": z0 * DU,
            "period": period,
            "energy": jacobi(sol.y[:, 0]),
        })
    family.describe("time", unit="TU")
    family.describe("z0", label="initial z", unit="km")
    family.describe("period", label="period", unit="TU")
    family.describe("energy", label="Jacobi constant")
    family.thin(SAMPLES, frames=frames)

    frame = scene.choice("frame", frames, labels=["rotating", "barycentric inertial", "inertial, Moon"], scope="panel")
    z0 = scene.selector("z0", parameter="z0", default=members[len(members) // 2][0] * DU)
    scene.clock("fraction", channels=["time", "@index"], labels=["time", "sample"], steps=SAMPLES * LAPS, laps=LAPS)
    plasma = {"parameter": "z0", "colormap": "plasma"}
    scene.view("main", frame=frame, driver=ty.driver(family, z0),
               camera={"kind": "orbit", "projection": "perspective", "up": "z"}, layers=[
                   ty.track(family, "all", color=plasma, opacity=0.05,
                            highlight={"var": z0, "width": 2.5, "opacity": 1.0, "kernel": {"width": 0.05, "opacity": 0.55}}),
                   ty.track(family, z0, trail=QUARTER_PERIOD_OF_LOOP, taper=(0, 0), color=plasma, width=22.0, opacity=0.3),
                   ty.track(family, z0, trail=QUARTER_PERIOD_OF_LOOP, taper=(0, 0), color=plasma, width=6.0),
                   ty.track(family, z0, trail=QUARTER_PERIOD_OF_LOOP, head=True, color=ACCENT_OF_BOTH_MODES, width=2.0),
                   ty.body(earth, trail=1.0, size=8.0),
                   ty.body(moon, trail=1.0, size=5.0),
                   ty.axes(),
                   ty.grid(),
               ])
    scene.panel("rotating", "main", {frame: "rotating"})
    scene.panel("inertial", "main", {frame: "barycentric-inertial"})
    scene.panel("moon", "main", {frame: "inertial-moon"})
    scene.layout(ty.split("col", 0.5, "rotating", ty.split("row", 0.5, "inertial", "moon")))
    scene.slider(z0, label="initial z, km", domain=family)
    scene.tabs(frame, label="frame")
    scene.transport()
    scene.readout("caption", "z0 = ", {"member": "z0", "digits": 5}, " km, period ", {"member": "period", "digits": 5},
                  " TU, Jacobi constant ", {"member": "energy", "digits": 7})
    return scene


def main(deck):
    scene = build()
    element = ty.build_embed(scene.to_document(), scene.to_container(), theme="dark", kiosk=True, class_="figure-box")
    page, count = VIEWER.subn(lambda _: element, Path(deck).read_text(encoding="utf-8"))
    if count != 1:
        raise SystemExit(f"{deck} has {count} tycho-viewer elements, not one")
    Path(deck).write_text(page, encoding="utf-8")
    print(f"wrote {len(element)} characters of viewer into {deck}")


if __name__ == "__main__":
    main(sys.argv[1])
