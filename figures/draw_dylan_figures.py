"""Draws the DyLAN figures of Broucke's families 7, 8 and 11 from the archive of family_tracks_dylan.py.

The script does not import DyLAN. For each family, branch, and frame it draws the drawn members of
the branch colored by eccentricity, with the colormap of the frame in the DYLAN-504 figures, and
for each family the stability diagram in the (a1, a2) plane with both branches, the three boundary
curves, the names of the stability regions of Frauenfelder and Moreno, and the regions filled faintly in the colors of
Fig. 4 of Zimovan-Spreen, Howell, and Davis (2019), as in the stability demo of the deck. Each figure is written three times:

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

# the colors of the regions in Fig. 4 of Zimovan-Spreen, Howell, and Davis (2019), as in
# demos/stability/build.py, keyed by the region number of DyLAN, and their opacity in each mode, lower
# on the dark background
HOWELL = {1: "#ffd7bb", 2: "#c7ebf3", 3: "#d8d8d8", 4: "#f7ef8e", 5: "#ffaec9", 6: "#e4e0f3", 7: "#e4f5af"}
HOWELL_ALPHA = {"dark": 0.22, "light": 0.5, "paper": 0.5}
FILL_CELLS = 1200
# the names of Frauenfelder and Moreno, keyed by the region number of DyLAN
NAME = {
    1: r"$\mathcal{E}^{2}$", 2: r"$\mathcal{N}$", 3: r"$\mathcal{H}^{-+}$", 4: r"$\mathcal{H}^{++}$",
    5: r"$\mathcal{H}^{--}$", 6: r"$\mathcal{EH}^{+}$", 7: r"$\mathcal{EH}^{-}$",
}

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


def regions_of(a1, a2):
    """The region number of each point (a1, a2), as in DyLAN, from the indices k, the roots of k^2 + a1 k + a2 - 2 = 0."""
    disc = a1**2 - 4 * (a2 - 2)
    root = np.sqrt(np.abs(disc))
    k_low, k_high = (-a1 - root) / 2, (-a1 + root) / 2
    above = (k_low > 2).astype(int) + (k_high > 2)
    below = (k_low < -2).astype(int) + (k_high < -2)
    region = np.select(
        [disc < 0, (above == 0) & (below == 0), above == 2, below == 2, (above == 1) & (below == 1), above == 1],
        [2, 1, 4, 5, 3, 6],
        default=7,
    )
    return region


# the offsets of the label of an eccentricity from its point, tried nearest first, in points, and the
# clearance kept between a label and any curve, in points
LABEL_DISTANCES = (6, 10, 16, 22, 28, 36, 46, 58, 72, 90)
LABEL_ANGLES = np.deg2rad([45, 135, -45, -135, 90, -90, 0, 180, *range(15, 360, 15)])
LABEL_PAD = 2.5
LEADER_DISTANCE = 20


def curve_samples(axes, spacing):
    """Points along every line of the axes in display pixels, at most spacing apart."""
    samples = []
    for line in axes.get_lines():
        xy = line.get_transform().transform(np.column_stack(line.get_data()))
        xy = xy[np.isfinite(xy).all(axis=1)]
        for a, b in zip(xy[:-1], xy[1:]):
            count = max(2, int(np.ceil(np.hypot(*(b - a)) / spacing)) + 1)
            samples.append(a + np.linspace(0.0, 1.0, count)[:, None] * (b - a))
    return np.vstack(samples)


def box_distance(box, point):
    """The distance in pixels from a point to a box, zero inside it."""
    return float(np.hypot(max(box.x0 - point[0], 0.0, point[0] - box.x1), max(box.y0 - point[1], 0.0, point[1] - box.y1)))


def leader_crossings(curves, anchor, box, pad):
    """The number of curve samples within pad of the leader from the anchor to the nearest point of the box.

    The samples within 4 pads of the anchor are left out, since the curve of the member itself passes there.
    """
    end = np.array([np.clip(anchor[0], box.x0, box.x1), np.clip(anchor[1], box.y0, box.y1)])
    along = end - anchor
    length = float(np.hypot(*along))
    if length == 0.0:
        return 0
    t = np.clip(((curves - anchor) @ along) / length**2, 0.0, 1.0)
    near = np.hypot(*(curves - anchor - t[:, None] * along).T) < pad
    return int((near & (t * length > 4 * pad)).sum())


def place_labels(figure, axes, marks):
    """Annotates each (point, text, color) of marks clear of every line, of the other labels, and of the axes edges.

    The offsets are tried from the nearest, and a label set farther than LEADER_DISTANCE from its point gets a thin
    leader. When no offset is clear, the one with the fewest line samples under the label is kept. Returns the boxes.
    """
    renderer = figure.canvas.get_renderer()
    scale = figure.dpi / 72
    curves = curve_samples(axes, scale)
    frame = axes.get_window_extent(renderer)
    pad = LABEL_PAD * scale
    placed = []
    anchors = [axes.transData.transform(point) for point, _, _ in marks]
    for anchor, (point, text, color) in zip(anchors, marks):
        label = axes.annotate(text, point, textcoords="offset points", xytext=(0, 0), fontsize="small", color=color)
        best = None
        for distance in LABEL_DISTANCES:
            for angle in LABEL_ANGLES:
                dx, dy = np.cos(angle), np.sin(angle)
                label.set_ha("left" if dx > 0.3 else "right" if dx < -0.3 else "center")
                label.set_va("bottom" if dy > 0.3 else "top" if dy < -0.3 else "center")
                label.xyann = (distance * dx, distance * dy)
                box = label.get_window_extent(renderer)
                if box.x0 < frame.x0 + pad or box.x1 > frame.x1 - pad or box.y0 < frame.y0 + pad or box.y1 > frame.y1 - pad:
                    continue
                grown = box.padded(pad)
                inside = (curves[:, 0] > grown.x0) & (curves[:, 0] < grown.x1) & (curves[:, 1] > grown.y0) & (curves[:, 1] < grown.y1)
                cost = int(inside.sum()) + 1000 * sum(grown.overlaps(other) for other in placed)
                if distance > LEADER_DISTANCE:
                    cost += leader_crossings(curves, anchor, box, pad)
                else:
                    # without a leader, a label about as near to another marked member as to its own would be read as
                    # the label of that member
                    own = box_distance(box, anchor)
                    cost += 500 * int(any(box_distance(box, other) < 1.5 * own + 2 * pad for other in anchors if other is not anchor))
                if best is None or cost < best[0]:
                    best = (cost, label.xyann, label.get_ha(), label.get_va(), box)
                if cost == 0:
                    break
            if best[0] == 0:
                break
        cost, offset, ha, va, box = best
        label.remove()
        leader = {}
        if np.hypot(*offset) > LEADER_DISTANCE:
            leader = {"arrowprops": {"arrowstyle": "-", "color": color, "linewidth": 0.4 * mpl.rcParams["lines.linewidth"], "shrinkA": 1, "shrinkB": 3}}
        axes.annotate(text, point, textcoords="offset points", xytext=offset, ha=ha, va=va, fontsize="small", color=color, **leader)
        if cost:
            print(f"  {text}: no clear place, {cost} line samples under the label or its leader")
        placed.append(box)
    return placed



def draw_stability(archive, meta, family, mode, folder):
    """The stability diagram of a family with both branches, the boundaries, and the region names."""
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
    grid_a1, grid_a2 = np.meshgrid(np.linspace(a1_low, a1_high, FILL_CELLS), np.linspace(a2_low, a2_high, FILL_CELLS))
    fill = np.zeros((FILL_CELLS, FILL_CELLS, 4))
    for region, value in HOWELL.items():
        fill[regions_of(grid_a1, grid_a2) == region] = (*mpl.colors.to_rgb(value), HOWELL_ALPHA[mode])
    axes.imshow(fill, extent=(a1_low, a1_high, a2_low, a2_high), origin="lower", aspect="auto", interpolation="nearest", zorder=0)

    window = np.array([[a1_low, a2_low]]), np.array([[a1_high - a1_low, a2_high - a2_low]])
    obstacles = []
    marks = []
    for branch, style, legend in (("periapsis", "-", r"periapsis ($\theta_0 = 0$)"), ("apoapsis", "--", r"apoapsis ($\theta_0 = \pi$)")):
        trace = archive[f"f{family}_{branch}_trace"]
        color = colors[branch]
        axes.plot(trace[:, 1], trace[:, 2], style, color=color, label=legend)
        obstacles.append((trace[:, 1:3] - window[0]) / window[1])
        for e in family_meta["labels"][branch]:
            index = int(np.argmin(np.abs(trace[:, 0] - e)))
            point = trace[index, 1], trace[index, 2]
            axes.plot(*point, "o", color=color, markersize=0.6 * mpl.rcParams["lines.markersize"])
            marks.append((point, rf"$e = {trace[index, 0]:.2f}$", color))

    axes.set_xlim(a1_low, a1_high)
    axes.set_ylim(a2_low, a2_high)
    axes.set_xlabel(r"$a_1$")
    axes.set_ylabel(r"$a_2$")
    axes.set_title(rf"Family {family}, $\mu = {family_meta['mass_ratio']:g}$")
    axes.ticklabel_format(axis="both", style="plain")
    figure.legend(loc="outside lower center", ncol=2, fontsize="small")
    # the layout is fixed before the labels are placed, so that their boxes are measured where they are drawn
    figure.canvas.draw()
    figure.set_layout_engine("none")
    boxes = place_labels(figure, axes, marks)
    for box in boxes:
        corners = axes.transAxes.inverted().transform(box.get_points())
        u, v = np.meshgrid(np.linspace(*corners[:, 0], 8), np.linspace(*corners[:, 1], 4))
        obstacles.append(np.column_stack([u.ravel(), v.ravel()]))

    points = region_label_points(
        archive[f"f{family}_region_a1"], archive[f"f{family}_region_a2"], archive[f"f{family}_region_grid"], np.vstack(obstacles)
    )
    for region, point in points.items():
        axes.annotate(
            NAME[region], point, ha="center", va="center", fontsize="medium", color=colors["subtle"]
        )
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
