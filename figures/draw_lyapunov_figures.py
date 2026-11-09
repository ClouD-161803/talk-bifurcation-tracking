"""Draws the L1 Lyapunov family of the Lyapunov to Halo slide from data/lyapunov/l1-lyapunov.json.

The figure is the orbit figure of the dylan-core demonstration script
lyapunov_family_stability_diagram.py, i.e. the drawn members in 3D axes about L1, colored by the
Jacobi constant C, with the member nearest the Lyapunov to Halo bifurcation dashed and a colorbar
in C marked at the bifurcation. It is drawn in the beeson styles of the deck, with the member of the
bifurcation in the accent color of the deck, which marks the crossing of k = 2 in the plot of the
same slide. The colormap is viridis, cut at its dark end in dark mode and at its light end in light
mode until every color has a contrast of 3:1 with the background of the slide. The stability
figure of the demonstration script is drawn in the deck as the plot of block id="lyapunov", written
by demos/stability/build.py. The script does not import DyLAN. Run it as

    uv run --with matplotlib,numpy python figures/draw_lyapunov_figures.py data/lyapunov/l1-lyapunov.json figures/dylan

which writes lyapunov-l1-orbits-dark.png and lyapunov-l1-orbits-light.png.
"""

import json
import pathlib
import sys

import matplotlib as mpl

mpl.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.ticker import FuncFormatter  # noqa: E402

from draw_dylan_figures import MINIMUM_CONTRAST, MODES, WIDTH_INCHES, contrast, save, use_mode  # noqa: E402

# the zone of the slide is 880 by 840 px
HEIGHT_INCHES = WIDTH_INCHES * 840 / 880
ACCENT = {"dark": "#f08050", "light": "#c8571e"}


def cut_colormap(name, mode):
    """The colormap with the end that is too close to the background of the mode cut off."""
    base = mpl.colormaps[name]
    background = MODES[mode]["background"]
    lower, upper = 0.0, 1.0
    if mode == "dark":
        while contrast(base(lower), background) < MINIMUM_CONTRAST:
            lower += 0.01
    else:
        while contrast(base(upper), background) < MINIMUM_CONTRAST:
            upper -= 0.01
    return mpl.colors.ListedColormap(base(np.linspace(lower, upper, 256)))


def draw_orbits(document, mode, folder):
    """The drawn members of the family, as in draw_orbit_family() of the demonstration script."""
    colors = MODES[mode]
    use_mode(mode)
    figure = plt.figure(figsize=(WIDTH_INCHES, HEIGHT_INCHES))
    axes = figure.add_subplot(projection="3d")
    for pane in (axes.xaxis, axes.yaxis, axes.zaxis):
        pane.set_pane_color((0, 0, 0, 0))
        pane._axinfo["grid"]["color"] = colors["grid"]

    c_cross = document["bifurcation"]["jacobi_constant"]
    index_cross = document["bifurcation"]["index"]
    cs = [o["jacobi_constant"] for o in document["orbits"]]
    norm = mpl.colors.Normalize(vmin=min(cs), vmax=max(cs))
    cmap = cut_colormap("viridis", mode)
    for orbit in document["orbits"]:
        x, y, z = (np.asarray(v) for v in orbit["xyz"])
        crossing = orbit["index"] == index_cross
        axes.plot3D(x, y, z,
                    color=ACCENT[mode] if crossing else cmap(norm(orbit["jacobi_constant"])),
                    linewidth=2.2 * colors["orbit_width"] if crossing else colors["orbit_width"],
                    linestyle="--" if crossing else "-",
                    label="Lyapunov to Halo bifurcation" if crossing else None,
                    zorder=5 if crossing else 2)
    point = document["libration_point"]
    axes.plot3D([point[0]], [point[1]], [point[2]], marker="x", color=colors["text"], linestyle="", label=r"$\mathcal{L}_1$")

    axes.set_xlabel(r"$x$ [DU]", labelpad=14)
    axes.set_ylabel(r"$y$ [DU]", labelpad=14)
    axes.set_zlabel(r"$z$ [DU]", labelpad=10)
    for axis in ("x", "y"):
        axes.locator_params(axis=axis, nbins=4)
    # the orbits are planar, hence the z range is the padding of matplotlib around zero
    axes.set_zlim(-0.05, 0.05)
    axes.set_zticks([-0.05, 0.0, 0.05])
    axes.zaxis.set_major_formatter(FuncFormatter(lambda value, _: f"${value:g}$"))
    axes.set_box_aspect(None, zoom=1.15)
    axes.legend(loc="upper left", frameon=False)

    bar = figure.colorbar(mpl.cm.ScalarMappable(norm=norm, cmap=cmap), ax=axes, pad=0.12, shrink=0.6)
    bar.set_label(r"$C$")
    bar.outline.set_visible(False)
    bar.ax.axhline(c_cross, color=ACCENT[mode], linestyle="--", linewidth=2.0)
    return save(figure, folder, "lyapunov-l1-orbits", mode)


def main():
    document = json.loads(pathlib.Path(sys.argv[1]).read_text())
    folder = pathlib.Path(sys.argv[2])
    for mode in ("dark", "light"):
        print(draw_orbits(document, mode, folder))


if __name__ == "__main__":
    main()
