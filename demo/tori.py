import json
import math
import sys
from pathlib import Path

import numpy as np

OUTPUT = Path(__file__).resolve().parents[1] / "theme" / "backdrops" / "tori.js"
SUN_FREQUENCY = 0.925195985520347
MASS_RATIO = 0.012150582
L5 = np.array([0.5 - MASS_RATIO, -math.sqrt(3) / 2, 0.0])
HARMONICS = 5
MODES = [(j, k) for j in range(-HARMONICS, HARMONICS + 1) for k in range(-HARMONICS, HARMONICS + 1)]
UNIT = 1e-4
DIGITS = 3


def readme(alphas):
    return [
        f"{len(alphas)} unstable 2-tori of the bicircular problem near the Earth-Moon L5, with the vertical amplitude "
        f"alpha from {alphas[0]:g} to {alphas[-1]:g}, as in Figs. 8 and 9 of Simo, Gomez, Jorba, and Masdemont, The "
        "bicircular model near the triangular libration points of the RTBP, in From Newton to Chaos (1995). The tori "
        "are the family along the vertical direction of the small periodic orbit near L5. The file is drawn by the "
        "backdrop 'tori' of the theme. It was written by demo/tori.py from one orbit on each torus computed by DyLAN.",
        "On a torus, the position is a function of two angles: theta1 = 2 pi t / T, the phase of the Sun with its "
        "period T in the synodic frame, and theta2 = (2 pi + rotation) t / T, the phase of the vertical oscillation. "
        "This function was fitted to the orbit by least squares as a Fourier series in the two angles, with the "
        f"harmonics j of theta1 from -{HARMONICS} to {HARMONICS} and the harmonics k of theta2 from 0 to {HARMONICS}. "
        "The coefficients of the harmonics (-j, -k) are the complex conjugates of those written.",
        "Each entry of 'tori' is one torus: its alpha, its rotation number 'rotation' in radians per period of the "
        "Sun, and 'modes' as [j, k, Re x, Im x, Re y, Im y, Re z, Im z] over the harmonics with a coefficient that is "
        f"not rounded to zero. Positions are measured from L5 in units of 'unit', i.e. {UNIT:g} of the Earth-Moon "
        f"distance, in the synodic frame, and coefficients are rounded to {DIGITS} decimals. 'orbit' is the periodic "
        "orbit as [x, y] in the same units.",
    ]


def basis(sun_phase, vertical_phase):
    return np.stack([np.exp(1j * (j * sun_phase + k * vertical_phase)) for j, k in MODES], axis=-1)


def torus_map(dots, rotation, time_step):
    time = time_step * np.arange(len(dots))
    period = 2 * math.pi / SUN_FREQUENCY
    design = basis(2 * math.pi * time / period, (2 * math.pi + rotation) * time / period)
    coefficients = np.linalg.lstsq(design, dots.astype(complex), rcond=None)[0]
    return coefficients, float(np.max(np.abs(design @ coefficients - dots)))


def from_l5(coefficients):
    rows = []
    for (j, k), row in zip(MODES, coefficients / UNIT):
        if k < 0:
            continue
        if (j, k) == (0, 0):
            row = row - L5 / UNIT
        values = [round(float(v), DIGITS) or 0 for c in row for v in (c.real, c.imag)]
        if any(values):
            rows.append([j, k] + values)
    return rows


def tori(path):
    data = np.load(path)
    family = []
    for alpha, rotation, dots in zip(data["alpha"], data["rotation"], data["dots"]):
        coefficients, residual = torus_map(dots.astype(float), float(rotation), float(data["time_step"]))
        print(f"alpha = {alpha:.2f}: rotation number {rotation:.6f}, largest residual of the fit {residual:.1e}")
        family.append({"alpha": round(float(alpha), 2), "rotation": round(float(rotation), 6), "modes": from_l5(coefficients)})
    orbit = (data["orbit"].astype(float) - L5)[:, :2] / UNIT
    return {
        "readme": readme([torus["alpha"] for torus in family]),
        "unit": UNIT,
        "tori": family,
        "orbit": [[round(float(x), 1), round(float(y), 1)] for x, y in orbit],
    }


def written(document):
    lines = ['Beeson.drawing("tori", {']
    keys = list(document)
    for n, key in enumerate(keys):
        value, comma = document[key], "," if n < len(keys) - 1 else ""
        if key == "tori":
            rows = [json.dumps(v, separators=(",", ":")) for v in value]
            lines += [f'  "{key}": [', *[f"    {r}," for r in rows[:-1]], f"    {rows[-1]}", f"  ]{comma}"]
        else:
            lines.append(f'  "{key}": {json.dumps(value, separators=(",", ":"))}{comma}')
    return "\n".join([*lines, "});"]) + "\n"


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python demo/tori.py tori.npz")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(written(tori(sys.argv[1])))
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size / 1e3:.0f} kB)")


if __name__ == "__main__":
    main()
