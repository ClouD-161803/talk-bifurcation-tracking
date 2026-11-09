# Storyboard of the stability demo

The stability demo is one plot element on slides 15 to 17 of the talk, drawn from `stability.json`, which is built with `python3 demos/stability/build.py` from the seven files of `data/stability/`. Each slide has an instance with an initial state of its own, and the three instances read the same JSON. A preview of the three slides is in `preview/index.html`, and its screenshots, one per step and one per tab, are in `shots/`.

The element has two panels. In the circle panel, the four in-plane Floquet multipliers $\lambda$ of a member are drawn with the unit circle and dashed rings at $|\lambda| = 10$ and $100$, under the readouts of the indices $k_1$ and $k_2$, where $k = \lambda + 1/\lambda$ for each pair. A multiplier of modulus $r > 1$ is drawn at the radius $\sqrt{1 + \ln r}$ and its inverse at the reciprocal radius, as is stated in a legend under the panel. In the diagram panel, the point $(a_1, a_2)$ of the same member is drawn among the parabola $a_2 = a_1^2/4 + 2$, where $k_1 = k_2$, the line $a_2 = -2a_1 - 2$, where $k = 2$, and the line $a_2 = 2a_1 - 2$, where $k = -2$. The path is drawn faint ahead of the point and bright behind it, with the region names, the crossing marks, and the readout of the region. Under the panels are the play button, the scrubber, and the readout of $e$, and above them is a tab for each of the six branches. Every frame is thus shown in both panels at once.

## Slide 15, the monodromy matrix

On this slide the instance shows the circle panel alone, on the tab of family 11 from periapsis, held at $e = 0$. The tab bar is hidden, since the instance has one tab, and nothing moves.

| Step | What appears | Readouts | What Claudio says |
|---|---|---|---|
| 0 | The head, and the circle panel without multipliers. | $e = 0.0000$ | To decide whether an orbit is stable, I follow a small offset from it for one period. |
| 1 | The sentence on the offset. | the same | After one period, the offset is a matrix times its initial value. |
| 2 | The display of $\boldsymbol M$. | the same | This matrix is the monodromy matrix, i.e. the state transition matrix at the period. |
| 3 | The sentence on the multipliers, the double multiplier 1 in blue, and a real pair near 4917 and its inverse in green. | the same | Since the flow is Hamiltonian, the multipliers come in pairs $\lambda$ and $1/\lambda$. In the circular problem one pair is always 1 and 1, and only the other pair is informative. |
| 4 | The display of $k$, and the readouts of $k_1$ and $k_2$. | $k_1 = 2.000$, $k_2 = 4916.9$ | Broucke measures a pair by its index $k$, which is between $-2$ and $2$ on the unit circle. Here $k_2 = 4916.9$, hence this orbit is unstable. |

## Slide 16, Broucke's diagram

On this slide the diagram is added beside the circle, on the same tab, held at $e = 0$ until step 5. The region names, the crossing marks, and the tabs of families 7 and 8 are hidden until step 5, and nothing moves before it.

| Step | What appears or moves | Readouts | What Claudio says |
|---|---|---|---|
| 0 | The head, both panels, the three curves with the names $k = 2$ and $k = -2$, and the point on the line $k = 2$. | $e = 0.0000$, $k_1 = 2.000$, $k_2 = 4916.9$, $\mathcal{EH}^+$ | On the right, the same orbit is a point in Broucke's diagram. |
| 1 | The sentence on the ER3BP. | the same | In the elliptic problem there is not a Jacobi constant, and the pair at 1 is gone. |
| 2 | The quartic and its coefficients. | the same | The quartic is palindromic, with only the two coefficients $a_1$ and $a_2$, and a family is a path in their plane. |
| 3 | The sentence on where the type changes. | the same | Between three curves, the type of the multipliers is the same everywhere. |
| 4 | The display of the three curves. | the same | On the parabola the two indices are equal, and on the two lines one index is 2 or $-2$, respectively. |
| 5 | The branch is played in 12 s and looped. The point is moved into $\mathcal H^{++}$, back to the line $k = 2$ at the fold, marked in orange, and across $k = -2$ at the period doubling, marked in violet. The name of the current region is bright and the others are dimmed. The blue pair is moved out along the real axis, back to 1, around the circle to $-1$, and out along the negative axis. The tabs of families 7 and 8 are offered. | $e$ rises to 0.4539 and falls to 0.4504, $k_1$ ends at $-3.836$, $k_2$ at 172.5, and the region runs $\mathcal{EH}^+$, $\mathcal H^{++}$, $\mathcal{EH}^+$, $\mathcal H^{-+}$. | As $e$ grows, family 11 is off the line $k = 2$, and at $e = 0.453865$ it is back on the line, at its fold. Just past the fold, one index is $-2$. |

## Slide 17, how a family changes

On this slide the instance is the same as on slide 16, except that the region names and all six tabs are shown from step 0.

| Step | What appears or moves | Readouts | What Claudio says |
|---|---|---|---|
| 0 | The head and both panels. | as at step 0 of slide 16 | Next I ask at which members of a family the corrector is singular. |
| 1 | The sentence on the corrector Jacobian. | the same | With the period pinned, the Jacobian of the single-shooting corrector is $\boldsymbol M - \boldsymbol I$. |
| 2 | The display of its determinant. | the same | Its determinant is a product over the two pairs, and a family can be changed only where it is zero. |
| 3 | The sentence on $k = 2$. The line $k = 2$, its name, and $k = 2$ in the sentence turn orange, through step 5. | the same | At an index of 2 the corrector is singular, and the family is turned back at a fold or crossed at a branch point. |
| 4 | The sentence on $k = -2$. The line $k = -2$, its name, and $k = -2$ in the sentence turn violet. | the same | At an index of $-2$ the corrector is regular, but a multiplier at $-1$ is a multiplier at 1 of the orbit run twice, hence a family of twice the period is born. |
| 5 | The branch is played as at step 5 of slide 16, on the first tab even if another was chosen. | as at step 5 of slide 16 | On family 11 from periapsis, $k_1$ is 2 at the fold, at $e = 0.453865$, and $-2$ at $e = 0.452138$, on the way back. |

## The tabs and their scales

For each tab I fitted the window of the diagram to the path with a margin, rendered it on linear and on asinh axes into `shots/compare/`, and kept the scale that reads better. On asinh axes the ticks are at $\pm 2$ and at the powers of ten that fit, and each axis title ends in "on an asinh scale". On linear axes the window contains $\mathcal E^2$. I widened the margins of a window where the name of a visited region did not fit, and every visited region is named.

| Tab | Branch | Frames | Regions | Scale | Reason |
|---|---|---|---|---|---|
| 11P | family 11 from periapsis, through the fold | 143 | $\mathcal{EH}^+$, $\mathcal H^{++}$, $\mathcal{EH}^+$, $\mathcal H^{-+}$ | asinh | On linear axes, the fold and the period doubling are squeezed into one corner. |
| 11A | family 11 from apoapsis | 407 | $\mathcal{EH}^+$, $\mathcal H^{-+}$, $\mathcal{EH}^-$, $\mathcal H^{--}$, $\mathcal{EH}^-$ | asinh | On linear axes, the four crossings are collapsed near the origin. |
| 7P | family 7 from periapsis | 102 | $\mathcal{EH}^+$, $\mathcal H^{-+}$ | linear | Within $\pm 5$ $\mathcal E^2$ is undistorted, and asinh ticks are uneven. |
| 7A | family 7 from apoapsis | 205 | $\mathcal{EH}^+$, $\mathcal E^2$ | linear | On asinh axes the window is a sliver without regions. On linear axes the point is moved a little along $k = 2$, with $k_2 = 2.000$ throughout. |
| 8P | family 8 from periapsis | 148 | $\mathcal{EH}^+$, $\mathcal H^{-+}$ | asinh | On linear axes, the start of the path is squeezed into a corner. |
| 8A | family 8 from apoapsis | 173 | $\mathcal{EH}^+$, $\mathcal H^{++}$, $\mathcal N$, $\mathcal E^2$ | asinh | On linear axes $\mathcal E^2$ is too small to be named, although the path is within two decades. |

## Frames and dropped members

Each frame of the tables above is a member of a branch file, at its value of $e$. Where two members are on opposite sides of a curve, I added a frame on the curve between them, interpolated linearly in $e$, $a_1$, and $a_2$. On the first tab, the members of `family-11-periapsis.json` below $e = 0.45$ are followed by those of `fold-family-11-periapsis.json`, and the frames of the fold and of the period doubling are at $e = 0.4538651$ and $e = 0.452138$, from `marks.json`.

I dropped every member whose `symplecticity_residual` exceeds $10^{-6}$, and only members of family 8 from periapsis were dropped. Its 49 dropped members are at $e$ = 0.71, 0.715, 0.725, 0.735, and 0.74, from 0.755 to 0.82, and from 0.83 to 0.975, both in steps of 0.005. The five members at 0.72, 0.73, 0.745, 0.75, and 0.825 are within the bound and are kept, hence this tab ends at 0.825, with gaps past 0.705.

At $e = 0$ the largest multiplier of family 11 is about 4917, and a modulus of 308 is reached only near $e = 0.45$. Both are drawn inside the circle panel, whose window is $\pm 3.5$, at the radii 3.08 and 2.59, respectively.

## Integration into the talk deck

In the talk deck, `index.html`, the demo is on slides 15 to 17 and 20, with placeholder names in `data-plot-show`, mapped to the ids of `stability.json` as below. The multipliers `pair-1` and `pair-2` and the readouts `k1` and `k2` are shown with the circle panel unless they are named in a fragment. Several classes may be given in one `data-highlight`, e.g. `hl-1 kplus` on slide 17.

| Name in the deck | Ids in `stability.json` |
|---|---|
| `circle` | the panel `circle` |
| `diagram` | the panel `diagram` |
| `curves` | `kequal kplus kminus`, the three curves and their names |
| `regions` | `r1` to `r7`, the region names, and `fill-1` to `fill-7`, the faint fills of the seven regions in the colors of Howell's Fig. 4 |
| `family` | `path point region`, and the tabs `7P 7A 8P 8A` |
| `k-plus-2` | `plus`, with `kplus` in the `data-highlight` of the fragment |
| `k-minus-2` | `minus`, with `kminus` in the `data-highlight` and `data-tone="violet"` |

The element is placed in a zone of 880 by 840 px at the left 920 and the top 120, beside a `narrow` text column, by a style in the head of `preview/index.html`, which the talk deck needs as well. On slide 20 of the talk deck the fold is at $e = 0.453865$, i.e. the 0.4538651 of `marks.json` at six decimals.
