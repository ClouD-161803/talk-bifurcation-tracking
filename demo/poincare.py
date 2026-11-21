import base64
import json
import math
import sys
from pathlib import Path

import numpy as np

OUTPUT = Path(__file__).resolve().parents[1] / "theme" / "backdrops"
SYSTEMS = {
    "earth-moon-l2": ("the Earth-Moon L2", 6),
    "sun-earth-l1": ("the Sun-Earth L1", 3),
}
FIRST_ENERGY = 0.2
POLYGON = 720
HARMONICS = 24
STIFFNESS = 2e-7
BOUNDARY_POINTS = 240
POINTS = 3000
FEWEST_POINTS = 28
LARGEST = 30000
DOWN, RIGHT, MIRROR = np.array([0.0, -1.0]), np.array([1.0, 0.0]), np.array([-1.0, 1.0])


def readme(system, energies, born):
    name, figure = SYSTEMS[system]
    return [
        f"The Poincare section of the center manifold of {name} in the circular restricted three-body problem, "
        f"at {len(energies)} energies h from {energies[0]:g} to {energies[-1]:g}, as in Fig. {figure} of Jorba and "
        "Masdemont, Dynamics in the center manifold of the collinear points of the restricted three body problem, "
        "Physica D 132 (1999). The section is q3 = 0 with p3 > 0 on the level h of the Hamiltonian of the center "
        "manifold, in the coordinates (q2, p2). The file is drawn by the backdrop 'poincare' of the theme. It was "
        "written by demo/poincare.py from sections computed by DyLAN with the Hamiltonian reduced to the center "
        "manifold at degree 20.",
        "At each energy, the section is the boundary, the vertical Lyapunov orbit as a fixed point, the two halo "
        f"orbits as fixed points from h = {energies[born]:g} on, and closed curves around these fixed points. Each "
        "curve was fitted to 80 crossings of one orbit, as a Fourier series of the distance from the fixed point in "
        f"the polar angle about it with {HARMONICS} harmonics. An orbit close to a resonance leaves gaps between its "
        "crossings, and these are closed by the series. The orbits start at fixed fractions of the way from their "
        "fixed point to the boundary.",
        "'energies' are the values of h. 'born' is the index of the first energy with halo orbits. Before it, the "
        "curves around the halo orbits and the halo orbits are those of this energy, at which the backdrop fades "
        "them in. 'boundary' is the number of points of the boundary, 'central' is the number of curves around the "
        "vertical Lyapunov orbit, and 'counts' is the number of points of each curve, first of those around the "
        "vertical Lyapunov orbit and then of those around each halo orbit. A curve has the same number of points "
        "at every energy, at even steps of its length, so that the section between two energies is drawn from "
        "points interpolated in h.",
        "'rotation' is, at each energy, the rotation number of each curve, i.e. the mean angle in turns per return "
        "by which the crossings are carried about the fixed point. 'range' is the smallest and the largest rotation "
        "number of the file. The curves are colored by it.",
        "Coordinates are integers in units of 'unit'. 'vertical' is, at each energy, [q2, p2] of the vertical "
        "Lyapunov orbit, and 'halos' is [q2, p2, q2, p2] of the two halo orbits. 'points' is the base64 text of "
        "little-endian 16-bit integers: at each energy, the pairs q2, p2 of the boundary, and then those of each "
        "curve.",
    ]


def closed_curve(points, center, start, mirrored=False):
    offsets = points - center
    if mirrored:
        offsets = np.vstack([offsets, offsets * MIRROR])
    values, vectors = np.linalg.eigh(offsets.T @ offsets / len(offsets))
    whiten = vectors @ np.diag(values**-0.5) @ vectors.T
    white = offsets @ whiten
    angle, radius = np.arctan2(white[:, 1], white[:, 0]), np.hypot(white[:, 0], white[:, 1])
    orders = np.arange(1, HARMONICS + 1)

    def series(at):
        return np.hstack([np.ones((len(at), 1)), np.cos(np.outer(at, orders)), np.sin(np.outer(at, orders))])

    design = series(angle)
    penalty = STIFFNESS * len(angle) * np.diag(np.concatenate([[0.0], orders**4.0, orders**4.0]))
    coefficients = np.linalg.solve(design.T @ design + penalty, design.T @ radius)
    first = start @ whiten
    grid = math.atan2(first[1], first[0]) + 2 * math.pi * np.arange(POLYGON) / POLYGON
    radius = series(grid) @ coefficients
    return center + (radius[:, None] * np.column_stack([np.cos(grid), np.sin(grid)])) @ np.linalg.inv(whiten)


def lengths(polygon):
    closed = np.vstack([polygon, polygon[:1]])
    return closed, np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(closed, axis=0).T))])


def evenly_spaced(polygon, count):
    closed, length = lengths(polygon)
    at = length[-1] * np.arange(count) / count
    return np.column_stack([np.interp(at, length, closed[:, 0]), np.interp(at, length, closed[:, 1])])


def rotation_number(points, center):
    angles = np.unwrap(np.arctan2(points[:, 1] - center[1], points[:, 0] - center[0]))
    return abs(angles[-1] - angles[0]) / (2 * math.pi * (len(points) - 1))


def section(system, path):
    data = np.load(path)
    keep = np.flatnonzero(data["energies"] > FIRST_ENERGY - 1e-9)
    energies = [round(float(e), 4) for e in data["energies"][keep]]
    born = np.isfinite(data["halos"][keep]).all(axis=(1, 2))
    first_born = int(np.argmax(born))
    polar = 2 * math.pi * np.arange(BOUNDARY_POINTS) / BOUNDARY_POINTS

    def curves(index):
        frame = keep[index]
        out = []
        for points in data["central"][frame]:
            points = points[np.isfinite(points).all(axis=1)].astype(float)
            out.append((closed_curve(points, data["center"][frame], DOWN, True), rotation_number(points, data["center"][frame])))
        frame = keep[max(index, first_born)]
        sides = []
        for side, mirror in enumerate((1.0, MIRROR)):
            halo = data["halos"][frame][side]
            orbits = [points[np.isfinite(points).all(axis=1)].astype(float) for points in data["islands"][frame][side]]
            sides.append([(closed_curve(points * mirror, halo * mirror, RIGHT) * mirror, rotation_number(points, halo)) for points in orbits])
        for side in sides:
            out += [(polygon, (left + right) / 2) for (polygon, _), (_, left), (_, right) in zip(side, *sides)]
        return out

    last = curves(len(keep) - 1)
    perimeters = np.array([lengths(polygon)[1][-1] for polygon, _ in last])
    counts = np.maximum(FEWEST_POINTS, np.round(POINTS * perimeters / perimeters.sum())).astype(int)
    central = len(data["central"][keep[0]])

    frames, rotations, vertical, halos = [], [], [], []
    for index, frame in enumerate(keep):
        radius = np.interp(polar, data["boundary_angles"], data["boundary_radii"][frame])
        rows = [np.column_stack([radius * np.cos(polar), radius * np.sin(polar)])]
        both = curves(index)
        rows += [evenly_spaced(polygon, count) for (polygon, _), count in zip(both, counts)]
        frames.append(np.vstack(rows))
        rotations.append([round(float(rotation), 5) for _, rotation in both])
        vertical.append(data["center"][frame])
        halos.append(data["halos"][keep[max(index, first_born)]].ravel())
    frames = np.array(frames)
    unit = float(np.abs(frames).max()) / LARGEST
    values = [r for row, alive in zip(rotations, born) for r in (row if alive else row[:central])]

    def integers(rows):
        return [[int(round(float(v) / unit)) for v in row] for row in rows]

    return {
        "readme": readme(system, energies, first_born),
        "unit": unit,
        "energies": energies,
        "born": first_born,
        "boundary": BOUNDARY_POINTS,
        "central": central,
        "counts": [int(c) for c in counts],
        "rotation": rotations,
        "range": [min(values), max(values)],
        "vertical": integers(vertical),
        "halos": integers(halos),
        "points": base64.b64encode(np.round(frames / unit).astype("<i2").tobytes()).decode(),
    }


def written(name, document):
    keys = list(document)
    rows = [f'  "{key}": {json.dumps(document[key], separators=(",", ":"))}' for key in keys]
    return f'Beeson.drawing("{name}", {{\n' + ",\n".join(rows) + "\n});\n"


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in SYSTEMS:
        sys.exit(f"usage: python demo/poincare.py {'|'.join(SYSTEMS)} sections.npz")
    system = sys.argv[1]
    output = OUTPUT / f"poincare-{system}.js"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(written(f"poincare-{system}", section(system, sys.argv[2])))
    print(f"wrote {output} ({output.stat().st_size / 1e3:.0f} kB)")


if __name__ == "__main__":
    main()
