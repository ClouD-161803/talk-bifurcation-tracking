"""A grid of the rotating-pulsating frame of a Kepler ellipse, drawn in the driver's context (rule L6).

The left panel shows the grid in the barycentric inertial frame, where it breathes and turns, and the
right panel shows it in the rotating frame, where it only breathes.
"""

import sys

import numpy as np

import pytycho as ty

e, mu = 0.5, 0.2
# the clock reads the mean anomaly M, and Newton's method on Kepler's equation gives the eccentric anomaly E
M = np.linspace(0.0, 2.0 * np.pi, 361)
E = M.copy()
for _ in range(50):
    E -= (E - e * np.sin(E) - M) / (1.0 - e * np.cos(E))
theta = np.unwrap(2.0 * np.arctan2(np.sqrt(1.0 + e) * np.sin(E / 2), np.sqrt(1.0 - e) * np.cos(E / 2)))
# rho is the separation of the primaries, nondimensional, equal to (1 - e**2) / (1 + e * cos(theta))
rho = 1.0 - e * np.cos(E)

scene = ty.Scene(title="a breathing grid of the rotating-pulsating frame, e = 0.5")
puls = scene.frame("pulsating", label="rotating-pulsating", axes=("x", "y", "z"))
rot = scene.frame("rotating", parent=puls, scale=ty.channel("rho"), label="rotating", axes=("xi", "eta", "z"))
scene.frame("inertial", parent=rot, rotation=ty.rotation("z", ty.channel("theta")), label="barycentric inertial", axes=("X", "Y", "Z"))
m1 = scene.body("m1", frame=puls, position=[-mu, 0.0, 0.0], label="m1")
m2 = scene.body("m2", frame=puls, position=[1.0 - mu, 0.0, 0.0], label="m2")

# the driver is the secondary, at rest in the pulsating frame, and its channels carry rho and theta over one period
secondary = scene.track_set("secondary", frame=puls, periodic=True, dtype="float64")
secondary.add(np.tile([1.0 - mu, 0.0], (M.size, 1)), channels={"t": M, "theta": theta, "rho": rho})

grid = scene.track_set("grid", frame=puls, dtype="float64")
for c in np.linspace(-1.5, 1.5, 13):
    grid.add(np.column_stack([np.full(2, c), [-1.5, 1.5]]))
    grid.add(np.column_stack([[-1.5, 1.5], np.full(2, c)]))

frame = scene.choice("frame", ["inertial", "rotating", "pulsating"], default="inertial", scope="panel")
scene.clock("fraction", channels=["t", "@index"], steps=240)
scene.view(
    "v",
    frame=frame,
    driver=ty.driver(secondary, 0),
    camera={"kind": "plane", "plane": "xy"},
    layers=[
        ty.track(grid, context="driver", color="#5a6378", width=1.0),
        ty.track(secondary, trail=0.25, head=True, color="#f0e442", width=2.0),
        ty.body(m1, size=10.0),
        ty.body(m2, size=6.0),
        ty.axes(),
    ],
)
scene.panel("p1", "v", {frame: "inertial"})
scene.panel("p2", "v", {frame: "rotating"})
scene.layout(ty.split("row", 0.5, "p1", "p2"))
scene.tabs(frame, label="frame")
scene.transport()

print(scene.write_html(sys.argv[1]))
