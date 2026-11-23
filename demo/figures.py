import sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.optimize import brentq

root = sys.argv[1]
mu = 0.01215


def omega(x, y):
    r1 = np.hypot(x + mu, y)
    r2 = np.hypot(x - 1 + mu, y)
    return 0.5 * (x * x + y * y) + (1 - mu) / r1 + mu / r2


def dodx(x):
    return x - (1 - mu) * (x + mu) / abs(x + mu) ** 3 - mu * (x - 1 + mu) / abs(x - 1 + mu) ** 3


L1 = brentq(dodx, 0.5, 1 - mu - 1e-3)
L2 = brentq(dodx, 1 - mu + 1e-3, 1.5)
L3 = brentq(dodx, -1.5, -mu - 1e-3)
jacobi = {k: 2 * omega(v, 0.0) for k, v in dict(L1=L1, L2=L2, L3=L3).items()}


def zvc(style, out):
    plt.style.use(style)
    fig, ax = plt.subplots(figsize=(6, 7.2))
    x = np.linspace(-1.6, 1.6, 900)
    y = np.linspace(-1.6, 1.6, 900)
    X, Y = np.meshgrid(x, y)
    Z = 2 * omega(X, Y)
    colors = plt.rcParams["axes.prop_cycle"].by_key()["color"]
    for name, col in zip(["L1", "L2", "L3"], colors[:3]):
        ax.contour(X, Y, Z, levels=[jacobi[name]], colors=[col], linewidths=2.2)
        ax.plot([], [], color=col, label=f"$C = C_{{\\mathcal{{L}}_{name[1]}}}$")
    text = plt.rcParams["text.color"]
    ax.plot([-mu], [0], "o", color=text, ms=7)
    ax.plot([1 - mu], [0], "o", color=text, ms=4)
    offsets = dict(L1=(-11, 0, "right", "center"), L2=(9, 0, "left", "center"), L3=(-8, 0, "right", "center"))
    for name, v in dict(L1=L1, L2=L2, L3=L3).items():
        ax.plot([v], [0], "x", color=text, ms=8, mew=1.8)
        dx, dy, ha, va = offsets[name]
        ax.annotate(f"$\\mathcal{{L}}_{name[1]}$", (v, 0), xytext=(dx, dy), textcoords="offset points",
                    ha=ha, va=va, fontsize=14)
    ax.grid(True)
    ax.set_aspect("equal")
    ax.set_xlim(-1.6, 1.6)
    ax.set_ylim(-1.6, 1.6)
    ax.set_xlabel("$x$")
    ax.set_ylabel("$y$")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.1), ncol=3, fontsize=14, columnspacing=1.2)
    fig.savefig(out)
    plt.close(fig)


for mode in ("dark", "light"):
    zvc(f"{root}/styles/beeson-{mode}.mplstyle", f"{root}/demo/figure-{mode}.png")

print("L1 L2 L3", L1, L2, L3, "C", jacobi)
