"""Draws the DyLAN figures of Broucke's families 7, 8 and 11 from the archive of family_tracks_dylan.py.

The script does not import DyLAN. For each family, branch, and frame it draws the drawn members of
the branch colored by eccentricity, with the colormap of the frame in the DYLAN-504 figures, and
for each family the stability diagram in the (a1, a2) plane with both branches, the three boundary
curves, and the numbers of the stability regions. Each figure is written three times:

- <name>-dark.png and <name>-light.png in the beeson styles of the deck, on a transparent
  background, for the classes for-dark and for-light;
- <name>-paper.png in the style of the DYLAN-504 figures (Computer Modern through LaTeX, black on
  white), for the class paper.

In dark mode the dark end of each colormap is cut until every color has a contrast of 3:1 with
the background of the slide, and the range is moved toward the light end by the same amount. In
light mode and on paper the ranges are those of DYLAN-504. Run it as

    uv run --with matplotlib,numpy python figures/draw_dylan_figures.py <archive.npz> <output folder>

with LaTeX on the path, e.g. /Library/TeX/texbin on the Mac.
"""

import json
import pathlib
import sys

import matplotlib as mpl

mpl.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

STYLES = pathlib.Path(__file__).resolve().parents[1] / "styles"
WIDTH_INCHES = 6.4
DPI = 2400 / WIDTH_INCHES  # every figure is 2400 px wide
ORBIT_HEIGHT_INCHES = 5.2
STABILITY_HEIGHT_INCHES = 6.6
MINIMUM_CONTRAST = 3.0

# (file name, key in the archive, title, x label, y label, (colormap, lower, upper) of DYLAN-504)
FRAMES = (
    ("pulsating", "pulsating", "rotating-pulsating frame", "x", "y", ("viridis", 0.0, 1.0)),
    ("rotating", "rotating", "rotating frame", r"\xi", r"\eta", ("Blues_r", 0.0, 0.683)),
    ("inertial", "inertial", "barycentric inertial frame", "X", "Y", ("plasma", 0.0, 1.0)),
    ("inertial-m1", "geocentric", r"inertial frame centered on $m_1$", "X_1", "Y_1", ("Reds_r", 0.0, 0.769)),
    ("inertial-m2", "selenocentric", r"inertial frame centered on $m_2$", "X_2", "Y_2", ("cividis", 0.0, 1.0)),
)

# per mode: background behind the figure, text, subtle gray, the two branch colors, orbit width in pt
MODES = {
    "dark": {
        "style": STYLES / "beeson-dark.mplstyle",
        "background": "#050505",
        "text": "#f2f2ef",
        "subtle": "#a6a6a0",
        "muted": "#7c7c76",
        "grid": "#232320",
        "periapsis": "#56B4E9",
        "apoapsis": "#E8743B",
        "orbit_width": 1.3,
    },
    "light": {
        "style": STYLES / "beeson-light.mplstyle",
        "background": "#faf8f3",
        "text": "#141413",
        "subtle": "#55554f",
        "muted": "#8a8a83",
        "grid": "#e3e0d8",
        "periapsis": "#0072B2",
        "apoapsis": "#D55E00",
        "orbit_width": 1.3,
    },
    "paper": {
        "style": None,
        "background": "#ffffff",
        "text": "#000000",
        "subtle": "#767676",
        "muted": "#9a9a9a",
        "grid": "0.85",
        "periapsis": "#0072B2",
        "apoapsis": "#D55E00",
        "orbit_width": 1.0,
    },
}

# the look of the DYLAN-504 figures: LaTeX Computer Modern at 20 pt, line widths 1.8 times the
# defaults of matplotlib, and a light grid behind the data
PAPER_STYLE = {
    "text.usetex": True,
    "font.family": "serif",
    "font.serif": ["Computer Modern Roman"],
    "font.size": 20,
    "axes.labelsize": "large",
    "axes.titlesize": "medium",
    "xtick.labelsize": "medium",
    "ytick.labelsize": "medium",
    "legend.fontsize": "medium",
    "figure.constrained_layout.use": True,
    "figure.facecolor": "white",
    "savefig.facecolor": "white",
    "axes.grid": True,
    "grid.color": "0.85",
    "axes.axisbelow": True,
    **{key: 1.8 * mpl.rcParamsDefault[key] for key in ("lines.linewidth", "lines.markersize", "axes.linewidth", "grid.linewidth")},
}

REGION_LABEL_CLEARANCE = 0.05  # in fractions of the axes


def luminance(color):
    """The relative luminance of a color, as defined for the contrast ratio of WCAG."""
    rgb = np.asarray(mpl.colors.to_rgb(color))
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    return float(linear @ [0.2126, 0.7152, 0.0722])


def contrast(first, second):
    """The contrast ratio of two colors, from 1 to 21."""
    high, low = sorted((luminance(first), luminance(second)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def colormap(name, lower, upper, mode):
    """The colormap of a frame in a mode, with its range moved off the dark end in dark mode."""
    base = mpl.colormaps[name]
    if mode == "dark":
        background = MODES["dark"]["background"]
        shift = 0.0
        while shift < 1.0 - lower and contrast(base(lower + shift), background) < MINIMUM_CONTRAST:
            shift += 0.01
        lower, upper = lower + shift, min(1.0, upper + shift)
    return mpl.colors.ListedColormap(base(np.linspace(lower, upper, 256))), (lower, upper)


def use_mode(mode):
    """Resets matplotlib to the style of a mode."""
    mpl.rcdefaults()
    if MODES[mode]["style"]:
        plt.style.use(MODES[mode]["style"])
        mpl.rcParams.update({"axes.grid": True, "axes.axisbelow": True})
    else:
        mpl.rcParams.update(PAPER_STYLE)


def save(figure, folder, name, mode):
    """Writes the figure as <name>-<mode>.png, transparent except on paper, and closes it."""
    path = folder / f"{name}-{mode}.png"
    figure.savefig(path, dpi=DPI, transparent=mode != "paper")
    plt.close(figure)
    return path


def tracks(archive, key, frame):
    """The drawn members of a branch in a frame, as a list of (M, 2) arrays."""
    points, offsets = archive[f"{key}_{frame}_points"], archive[f"{key}_{frame}_offsets"]
    return [points[offsets[k] : offsets[k + 1]] for k in range(len(offsets) - 1)]


def draw_orbits(archive, meta, family, branch, frame, mode, folder):
    """One branch in one frame, every member colored by its eccentricity, with a colorbar in e."""
    name, key_frame, title, x_label, y_label, (colormap_name, lower, upper) = frame
    colors = MODES[mode]
    family_meta = meta["families"][family]
    branches = family_meta["branches"]
    maximum = max(b["target_eccentricity"] for b in branches.values())
    target = branches[branch]["target_eccentricity"]
    mass_ratio = family_meta["mass_ratio"]
    cmap, _ = colormap(colormap_name, lower, upper, mode)
    key = f"f{family}_{branch}"

    use_mode(mode)
    figure, axes = plt.subplots(figsize=(WIDTH_INCHES, ORBIT_HEIGHT_INCHES))
    for e, track in zip(archive[f"{key}_e"], tracks(archive, key, key_frame)):
        axes.plot(track[:, 0], track[:, 1], color=cmap(e / maximum), linewidth=colors["orbit_width"], solid_capstyle="round")
    bodies = [(-mass_ratio, 0.0), (1.0 - mass_ratio, 0.0)] if key_frame == "pulsating" else [(0.0, 0.0)]
    axes.plot(*zip(*bodies), "o", color=colors["text"], markersize=0.5 * mpl.rcParams["lines.markersize"], zorder=5)
    axes.set_xlabel(rf"${x_label}$ [DU]")
    axes.set_ylabel(rf"${y_label}$ [DU]")
    axes.set_title(title)
    axes.set_aspect("equal", adjustable="datalim")
    scale = mpl.cm.ScalarMappable(norm=mpl.colors.Normalize(0.0, maximum), cmap=cmap)
    bar = figure.colorbar(scale, ax=axes, shrink=0.9, pad=0.02)
    bar.set_label(r"$e$")
    bar.outline.set_visible(False)
    # the branch ends below the top of a shared colorbar, hence its end is marked on the bar
    if target < maximum:
        bar.ax.axhline(target, color=colors["text"], linewidth=0.6 * mpl.rcParams["lines.linewidth"])
    return save(figure, folder, f"family-{family}-{branch}-{name}", mode)


def region_label_points(a1, a2, grid, obstacles):
    """A point inside each stability region, as far as possible from its border and the curves.

    The distances are measured in fractions of the axes, on a coarser copy of the region grid.
    A region whose best point is closer than REGION_LABEL_CLEARANCE to its border is not labeled.
    """
    step = max(1, len(a1) // 120)
    grid = grid[::step, ::step]
    u = (a1[::step] - a1[0]) / (a1[-1] - a1[0])
    v = (a2[::step] - a2[0]) / (a2[-1] - a2[0])
    uu, vv = np.meshgrid(u, v)
    cells = np.column_stack([uu.ravel(), vv.ravel()])
    labels = grid.ravel()
    # cells next to another region, and the cells at the edge of the window, bound every region
    border = np.zeros_like(grid, dtype=bool)
    border[:-1, :] |= grid[:-1, :] != grid[1:, :]
    border[1:, :] |= grid[1:, :] != grid[:-1, :]
    border[:, :-1] |= grid[:, :-1] != grid[:, 1:]
    border[:, 1:] |= grid[:, 1:] != grid[:, :-1]
    border[[0, -1], :] = border[:, [0, -1]] = True
    blockers = np.vstack([cells[border.ravel()], obstacles])
    points = {}
    for region in np.unique(labels):
        inside = cells[labels == region]
        clearance = np.sqrt(((inside[:, None, :] - blockers[None, :, :]) ** 2).sum(axis=2)).min(axis=1)
        best = int(np.argmax(clearance))
        if clearance[best] >= REGION_LABEL_CLEARANCE:
            points[int(region)] = (
                a1[0] + inside[best, 0] * (a1[-1] - a1[0]),
                a2[0] + inside[best, 1] * (a2[-1] - a2[0]),
            )
    return points


def draw_stability(archive, meta, family, mode, folder):
    """The stability diagram of a family with both branches, the boundaries, and the region numbers."""
    colors = MODES[mode]
    family_meta = meta["families"][family]
    (a1_low, a1_high), (a2_low, a2_high) = family_meta["windows"]
    use_mode(mode)
    figure, axes = plt.subplots(figsize=(WIDTH_INCHES, STABILITY_HEIGHT_INCHES))
    boundary_width = 0.6 * mpl.rcParams["lines.linewidth"]
    a1 = np.linspace(a1_low, a1_high, 2000)
    axes.plot(a1, a1**2 / 4 + 2, color=colors["subtle"], linewidth=boundary_width, label=r"$a_2 = a_1^2/4 + 2$")
    axes.plot(a1, -2 * a1 - 2, "--", color=colors["subtle"], linewidth=boundary_width, label=r"$a_2 = \pm 2 a_1 - 2$")
    axes.plot(a1, 2 * a1 - 2, "--", color=colors["subtle"], linewidth=boundary_width)
    axes.axhline(0.0, color=colors["muted"], linewidth=0.4 * mpl.rcParams["lines.linewidth"], zorder=0.5)
    axes.axvline(0.0, color=colors["muted"], linewidth=0.4 * mpl.rcParams["lines.linewidth"], zorder=0.5)

    window = np.array([[a1_low, a2_low]]), np.array([[a1_high - a1_low, a2_high - a2_low]])
    obstacles = []
    for branch, style, legend in (("periapsis", "-", r"periapsis ($\theta_0 = 0$)"), ("apoapsis", "--", r"apoapsis ($\theta_0 = \pi$)")):
        trace = archive[f"f{family}_{branch}_trace"]
        color = colors[branch]
        axes.plot(trace[:, 1], trace[:, 2], style, color=color, label=legend)
        obstacles.append((trace[:, 1:3] - window[0]) / window[1])
        for e in family_meta["labels"][branch]:
            index = int(np.argmin(np.abs(trace[:, 0] - e)))
            point = trace[index, 1], trace[index, 2]
            axes.plot(*point, "o", color=color, markersize=0.6 * mpl.rcParams["lines.markersize"])
            # a label near the top or the right edge of the window is turned inward
            u, v = ((np.array(point) - window[0][0]) / window[1][0]).tolist()
            dx, ha = (-8, "right") if u > 0.8 else (8, "left")
            dy, va = (-8, "top") if v > 0.9 else (6, "bottom")
            axes.annotate(
                rf"$e = {trace[index, 0]:.2f}$", point, textcoords="offset points", xytext=(dx, dy), ha=ha, va=va, fontsize="small", color=color
            )
            # the label of an eccentricity, about 0.15 of the axes wide, is kept clear of the region numbers
            along = np.linspace(0.02, 0.19, 8) * np.sign(dx)
            obstacles.append(np.column_stack([u + along, np.full_like(along, v + np.sign(dy) * 0.035)]))

    points = region_label_points(
        archive[f"f{family}_region_a1"], archive[f"f{family}_region_a2"], archive[f"f{family}_region_grid"], np.vstack(obstacles)
    )
    for region, point in points.items():
        axes.annotate(
            str(region), point, ha="center", va="center", fontsize="medium", color=colors["subtle"],
            bbox={"boxstyle": "circle,pad=0.25", "facecolor": "none", "edgecolor": colors["subtle"], "linewidth": 0.5 * mpl.rcParams["lines.linewidth"]},
        )
    axes.set_xlim(a1_low, a1_high)
    axes.set_ylim(a2_low, a2_high)
    axes.set_xlabel(r"$a_1$")
    axes.set_ylabel(r"$a_2$")
    axes.set_title(rf"Family {family}, $\mu = {family_meta['mass_ratio']:g}$")
    axes.ticklabel_format(axis="both", style="plain")
    figure.legend(loc="outside lower center", ncol=2, fontsize="small")
    return save(figure, folder, f"stability-family-{family}", mode), sorted(points)


def main():
    archive = np.load(sys.argv[1])
    folder = pathlib.Path(sys.argv[2])
    folder.mkdir(parents=True, exist_ok=True)
    meta = json.loads(str(archive["meta"]))
    for mode in MODES:
        for frame in FRAMES:
            _, (lower, upper) = colormap(*frame[5], mode)
            print(f"{mode} {frame[0]}: {frame[5][0]} from {lower:.2f} to {upper:.2f}")
    for family in meta["families"]:
        for mode in MODES:
            path, regions = draw_stability(archive, meta, family, mode, folder)
            print(f"{path.name}: regions {regions} labeled")
            for branch in ("periapsis", "apoapsis"):
                for frame in FRAMES:
                    draw_orbits(archive, meta, family, branch, frame, mode, folder)
        print(f"family {family}: done")


if __name__ == "__main__":
    main()
