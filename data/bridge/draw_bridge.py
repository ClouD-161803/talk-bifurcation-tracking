"""Renders the mass-ratio bridge of DYLAN-533 as an MP4 and a poster PNG per mode of the deck.

The script reads the archive of bridge_dylan.py and does not import DyLAN. On the left, the orbit
at each of the four eccentricities is drawn in the rotating-pulsating frame while the mass ratio
grows from 0.012155 (family 7A) to 0.5 (family 8A), with a faint copy of every member that DyLAN
computed left behind, and the primary and the secondary at -mu and 1 - mu. On the right, x0 and
ydot0 of the four bridges are drawn against the mass ratio, with Broucke's rows of families 7A and
8A at the two ends. Between the 26 members of a bridge the orbit is interpolated linearly in the
mass ratio, point by point along the arc length. Run it as

    uv run --with matplotlib,numpy python data/bridge/draw_bridge.py <archive.npz> <output folder>

with ffmpeg on the path. It writes bridge-dark.mp4, bridge-light.mp4, and a poster PNG of the last
frame for each, 1920 by 1080 px, 20 s at 30 frames per second, H.264.
"""

import json
import pathlib
import subprocess
import sys

import matplotlib as mpl

mpl.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

STYLES = pathlib.Path(__file__).resolve().parents[2] / "styles"
WIDTH, HEIGHT, FPS = 1920, 1080, 30
# in frames: the hold on family 7A, the continuation, and the hold on family 8A
HOLD_START, MORPH, HOLD_END = 45, 450, 105
MASS_RATIO_START, MASS_RATIO_END = 0.012155, 0.5

MODES = {
    "dark": {
        "style": STYLES / "beeson-dark.mplstyle",
        "background": "#050505",
        "text": "#f2f2ef",
        "subtle": "#a6a6a0",
        "eccentricities": ("#56B4E9", "#009E73", "#E69F00", "#CC79A7"),
    },
    "light": {
        "style": STYLES / "beeson-light.mplstyle",
        "background": "#faf8f3",
        "text": "#141413",
        "subtle": "#55554f",
        "eccentricities": ("#0072B2", "#009E73", "#D55E00", "#CC79A7"),
    },
}


def smoothstep(s):
    return s * s * (3.0 - 2.0 * s)


def mass_ratio_at(frame):
    """The mass ratio shown in a frame of the video."""
    s = np.clip((frame - HOLD_START) / (MORPH - 1), 0.0, 1.0)
    return MASS_RATIO_START + smoothstep(s) * (MASS_RATIO_END - MASS_RATIO_START)


def interpolate(mass_ratios, values, mass_ratio):
    """The values of the members (along the first axis) interpolated linearly at a mass ratio."""
    k = int(np.clip(np.searchsorted(mass_ratios, mass_ratio) - 1, 0, len(mass_ratios) - 2))
    w = np.clip((mass_ratio - mass_ratios[k]) / (mass_ratios[k + 1] - mass_ratios[k]), 0.0, 1.0)
    return (1.0 - w) * values[k] + w * values[k + 1]


def body_sizes(mass_ratio):
    """Marker sizes in points of the primary and the secondary, growing with the cube root of the mass."""
    return 15.0 * (1.0 - mass_ratio) ** (1 / 3), max(4.0, 15.0 * mass_ratio ** (1 / 3))


def build(archive, meta, mode):
    """The figure of a mode, with the artists that change from frame to frame."""
    colors = MODES[mode]
    mpl.rcdefaults()
    plt.style.use(colors["style"])
    mpl.rcParams.update({"font.size": 20, "figure.constrained_layout.use": False, "axes.grid": True})
    figure = plt.figure(figsize=(WIDTH / 100, HEIGHT / 100), dpi=100, facecolor=colors["background"])
    grid = figure.add_gridspec(2, 4, left=0.045, right=0.975, top=0.845, bottom=0.085, wspace=0.32, hspace=0.3, width_ratios=(1, 1, 1.05, 1.05))
    orbit_axes = [figure.add_subplot(grid[r, c]) for r in range(2) for c in range(2)]
    x0_axes, ydot0_axes = figure.add_subplot(grid[0, 2:]), figure.add_subplot(grid[1, 2:])
    figure.text(0.045, 0.955, r"Family 7A continued in the mass ratio $\mu$ to family 8A", fontsize=30, color=colors["text"], va="center")
    stage = figure.text(0.045, 0.905, "", fontsize=20, color=colors["subtle"], va="center")
    readout = figure.text(0.975, 0.955, "", fontsize=30, color=colors["text"], va="center", ha="right")

    state = {"orbits": [], "stage": stage, "readout": readout}
    for k, (e, axes) in enumerate(zip(meta["eccentricities"], orbit_axes)):
        key, color = f"e{e:.1f}", colors["eccentricities"][k]
        tracks = archive[f"{key}_tracks"]
        low = np.minimum(tracks.min(axis=(0, 1)), [-0.55, 0.0])
        high = np.maximum(tracks.max(axis=(0, 1)), [1.0, 0.0])
        margin = 0.08 * (high - low).max()
        axes.set_xlim(low[0] - margin, high[0] + margin)
        axes.set_ylim(low[1] - margin, high[1] + margin)
        axes.set_aspect("equal", adjustable="datalim")
        axes.set_title(rf"$e = {e:.1f}$", color=color)
        if k >= 2:
            axes.set_xlabel(r"$x$ [DU]")
        if k % 2 == 0:
            axes.set_ylabel(r"$y$ [DU]")
        axes.plot(*tracks[0].T, color=color, linewidth=1.2, alpha=0.45, linestyle=(0, (4, 3)))
        (line,) = axes.plot([], [], color=color, linewidth=2.7, solid_capstyle="round", zorder=4)
        (primary,) = axes.plot([], [], "o", color=colors["text"], zorder=5)
        (secondary,) = axes.plot([], [], "o", color=colors["text"], zorder=5)
        state["orbits"].append({"key": key, "axes": axes, "color": color, "line": line, "primary": primary, "secondary": secondary, "ghosts": 0})

    state["curves"] = []
    for axes, name, label in ((x0_axes, "x0", r"$x_0$ [DU]"), (ydot0_axes, "ydot0", r"$\dot{y}_0$")):
        for k, e in enumerate(meta["eccentricities"]):
            key, color = f"e{e:.1f}", colors["eccentricities"][k]
            mass_ratios, values = archive[f"{key}_mass_ratio"], archive[f"{key}_{name}"]
            axes.plot(mass_ratios, values, color=color, linewidth=1.0, alpha=0.25)
            (trail,) = axes.plot([], [], color=color, linewidth=2.7)
            (dot,) = axes.plot([], [], "o", color=color, markersize=9, zorder=5)
            index = 0 if name == "x0" else 1
            row_7, row_8 = meta["published"][key]
            axes.plot(MASS_RATIO_START, row_7[index], "o", markersize=13, markerfacecolor="none", markeredgecolor=colors["text"], markeredgewidth=1.6, zorder=6)
            axes.plot(MASS_RATIO_END, row_8[index], "s", markersize=12, markerfacecolor="none", markeredgecolor=colors["text"], markeredgewidth=1.6, zorder=6)
            state["curves"].append({"mass_ratios": mass_ratios, "values": values, "trail": trail, "dot": dot})
        axes.set_xlim(-0.01, 0.52)
        axes.set_ylabel(label)
    x0_axes.tick_params(labelbottom=False)
    ydot0_axes.set_xlabel(r"mass ratio $\mu$")
    published = [
        mpl.lines.Line2D([], [], marker="o", linestyle="", markersize=13, markerfacecolor="none", markeredgecolor=colors["text"], markeredgewidth=1.6),
        mpl.lines.Line2D([], [], marker="s", linestyle="", markersize=12, markerfacecolor="none", markeredgecolor=colors["text"], markeredgewidth=1.6),
    ]
    x0_axes.legend(published, ["Broucke, family 7A (Table 13)", "Broucke, family 8A (Table 15)"], loc="best", fontsize=17)
    return figure, state


def draw(archive, state, frame):
    """Moves every changing artist to the mass ratio of a frame."""
    mass_ratio = mass_ratio_at(frame)
    for orbit in state["orbits"]:
        mass_ratios, tracks = archive[f"{orbit['key']}_mass_ratio"], archive[f"{orbit['key']}_tracks"]
        # a faint copy of each member is left behind once the orbit has passed it
        while orbit["ghosts"] < len(mass_ratios) and mass_ratios[orbit["ghosts"]] <= mass_ratio + 1e-12:
            orbit["axes"].plot(*tracks[orbit["ghosts"]].T, color=orbit["color"], linewidth=1.0, alpha=0.22, zorder=2)
            orbit["ghosts"] += 1
        orbit["line"].set_data(*interpolate(mass_ratios, tracks, mass_ratio).T)
        primary_size, secondary_size = body_sizes(mass_ratio)
        orbit["primary"].set_data([-mass_ratio], [0.0])
        orbit["primary"].set_markersize(primary_size)
        orbit["secondary"].set_data([1.0 - mass_ratio], [0.0])
        orbit["secondary"].set_markersize(secondary_size)
    for curve in state["curves"]:
        shown = curve["mass_ratios"] <= mass_ratio
        value = interpolate(curve["mass_ratios"], curve["values"], mass_ratio)
        curve["trail"].set_data(np.append(curve["mass_ratios"][shown], mass_ratio), np.append(curve["values"][shown], value))
        curve["dot"].set_data([mass_ratio], [value])
    state["readout"].set_text(rf"$\mu = {mass_ratio:.4f}$")
    if frame < HOLD_START:
        stage = "family 7A of Broucke at the Earth–Moon mass ratio, four eccentricities"
    elif frame < HOLD_START + MORPH:
        stage = r"continued in $\mu$ at a fixed eccentricity, with every computed member left behind"
    else:
        stage = "family 8A of Broucke at equal masses, reached at the same four eccentricities"
    state["stage"].set_text(stage)


def render(archive, meta, mode, folder):
    figure, state = build(archive, meta, mode)
    path = folder / f"bridge-{mode}.mp4"
    encoder = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}", "-r", str(FPS),
         "-i", "-", "-an", "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "slow",
         "-movflags", "+faststart", str(path)],
        stdin=subprocess.PIPE,
    )
    for frame in range(HOLD_START + MORPH + HOLD_END):
        draw(archive, state, frame)
        figure.canvas.draw()
        encoder.stdin.write(np.asarray(figure.canvas.buffer_rgba())[:, :, :3].tobytes())
    encoder.stdin.close()
    if encoder.wait() != 0:
        sys.exit(f"ffmpeg failed on {path}")
    figure.savefig(folder / f"bridge-{mode}.png", dpi=100, facecolor=MODES[mode]["background"])
    plt.close(figure)
    print(f"wrote {path.name} and bridge-{mode}.png")


def main():
    archive = np.load(sys.argv[1])
    folder = pathlib.Path(sys.argv[2])
    meta = json.loads(str(archive["meta"]))
    archive = {key: archive[key] for key in archive.files if key != "meta"}
    for mode in MODES:
        render(archive, meta, mode, folder)


if __name__ == "__main__":
    main()
