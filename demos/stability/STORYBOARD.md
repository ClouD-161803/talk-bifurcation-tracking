# Storyboard of the stability demo

The stability demo is the plot element of the slide "Bifurcations of Broucke’s families" of the talk, drawn from `stability.json`, which is built with `python3 demos/stability/build.py` from the seven files of `data/stability/`. The JSON is written into the block `id="stability"` of the deck by hand, or with `--deck index.html`, which also rewrites the blocks `id="regions"` and `id="lyapunov"`. One screenshot per step, in either mode, is written into `shots/` with `node demos/stability/shots.mjs --theme dark`.

The element has one panel, in which the point $(a_1, a_2)$ of a member is drawn among the parabola $a_2 = a_1^2/4 + 2$, where $k_1 = k_2$, the line $a_2 = -2a_1 - 2$, where $k = 2$, and the line $a_2 = 2a_1 - 2$, where $k = -2$. The path is drawn faint ahead of the point and bright behind it, with the region names and the readout of the current region at the upper right. At each crossing of a curve, a ring is drawn in orange with the name of its bifurcation, as in the table of crossings on the slide "Broucke's diagram": tangent at $k = 2$, period-doubling at $k = -2$, and secondary Hopf on the parabola, or modified secondary Hopf where $|a_1| > 4$. Under the panel are the play button, the scrubber, and the readout of $e$, and above it is a tab for each of the six branches.

## The steps of the slide

At each step from 1 to 6 the plot is switched to the tab of one branch and played once from $e = 0$, and it is held at the last member. The text of a family is swapped in at its first step.

| Step | Text | Tab | What Claudio says |
|---|---|---|---|
| 0 | The head, and the sentence on the start of each family on $k = 2$. | 7P, held at $e = 0$ | Each orbit is a point in Broucke’s diagram, and at $e = 0$ one index is 2. |
| 1 | Family 7 stays close to $k = 2$, and 7P period-doubles at $e = 0.468$. | 7P | Family 7 is at the Earth–Moon mass ratio, and Broucke did not draw it. |
| 2 | 7A is stable for $e \in [0.005, 0.975]$. | 7A | 7A is the only branch stable over its whole range. |
| 3 | 8P period-doubles at $e = 0.677$. | 8P | Family 8 is at a mass ratio of one half. |
| 4 | 8A enters $\mathcal N$ at $e = 0.289$ and becomes stable in $\mathcal E^2$ at $e = 0.847$. | 8A | The first crossing of the parabola is at $|a_1| = 12$, hence a modified secondary Hopf bifurcation. |
| 5 | 11A period-doubles at $e = 0.29464$, which Broucke placed at 0.30. | 11A | Past his range, 11A crosses $k = 2$ and twice $k = -2$. |
| 6 | Broucke’s sentence on the divergence at $e = 0.454$, highlighted in a crop of the AIAA paper, p. 1009, and the fold of 11P at $e = 0.453865$. | 11P | His corrector diverged at the fold, where $\boldsymbol M - \boldsymbol I$ is singular. |
| 7 | Natural-parameter continuation stops at the fold, and pseudo-arclength continuation passes it. | 11P | This is the reason for the continuation slides. |

## The names of the bifurcations

Each name is placed by `place_labels` of `build.py` at one of eight places around its ring, the place farthest from the path, the curves, the other rings, and the names placed before it. The eight places are the eight marks `bif-w` to `bif-n` of the panel. A ring within 48 px of an earlier ring of the same bifurcation, e.g. the two period-doublings of 11A at $e = 0.867$ and $0.879$, is drawn without a name. The box of the panel is 756 by 592 px, as measured in a screenshot at 1920 by 1080.

## The tabs and their scales

For each tab I fitted the window of the diagram to the path with a margin, rendered it on linear and on asinh axes, and kept the scale that reads better. On asinh axes the ticks are at $\pm 2$ and at the powers of ten that fit, and each axis title ends in "on an asinh scale". On linear axes the window contains $\mathcal E^2$. I widened the margins of a window where the name of a visited region did not fit, and every visited region is named.

| Tab | Branch | Frames | Regions | Scale | Reason |
|---|---|---|---|---|---|
| 7P | family 7 from periapsis | 102 | $\mathcal{EH}^+$, $\mathcal H^{-+}$ | linear | Within $\pm 5$ $\mathcal E^2$ is undistorted, and asinh ticks are uneven. |
| 7A | family 7 from apoapsis | 205 | $\mathcal{EH}^+$, $\mathcal E^2$ | linear | On asinh axes the window is a sliver without regions. On linear axes the point is moved a little along $k = 2$, with $k_2 = 2.000$ throughout. |
| 8P | family 8 from periapsis | 148 | $\mathcal{EH}^+$, $\mathcal H^{-+}$ | asinh | On linear axes, the start of the path is squeezed into a corner. |
| 8A | family 8 from apoapsis | 173 | $\mathcal{EH}^+$, $\mathcal H^{++}$, $\mathcal N$, $\mathcal E^2$ | asinh | On linear axes $\mathcal E^2$ is too small to be named, although the path is within two decades. |
| 11A | family 11 from apoapsis | 407 | $\mathcal{EH}^+$, $\mathcal H^{-+}$, $\mathcal{EH}^-$, $\mathcal H^{--}$, $\mathcal{EH}^-$ | asinh | On linear axes, the four crossings are collapsed near the origin. |
| 11P | family 11 from periapsis, through the fold | 143 | $\mathcal{EH}^+$, $\mathcal H^{++}$, $\mathcal{EH}^+$, $\mathcal H^{-+}$ | asinh | On linear axes, the fold and the period doubling are squeezed into one corner. |

## Frames and dropped members

Each frame of the tables above is a member of a branch file, at its value of $e$. Where two members are on opposite sides of a curve, I added a frame on the curve between them, interpolated linearly in $e$, $a_1$, and $a_2$. On the tab 11P, the members of `family-11-periapsis.json` below $e = 0.45$ are followed by those of `fold-family-11-periapsis.json`, and the frames of the fold and of the period doubling are at $e = 0.4538651$ and $e = 0.452138$, from `marks.json`.

I dropped every member whose `symplecticity_residual` exceeds $10^{-6}$, and only members of family 8 from periapsis were dropped. Its 49 dropped members are at $e$ = 0.71, 0.715, 0.725, 0.735, and 0.74, from 0.755 to 0.82, and from 0.83 to 0.975, both in steps of 0.005. The five members at 0.72, 0.73, 0.745, 0.75, and 0.825 are within the bound and are kept, hence this tab ends at 0.825, with gaps past 0.705.
