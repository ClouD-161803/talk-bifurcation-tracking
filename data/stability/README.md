# Stability of Broucke's families 7, 8 and 11

I checked every stability mark of the talk against the data, and each one holds. I computed the values in the table below with `compute_stability_dylan.py` in this folder, on `vestini/master` of dylan-core. Family 7 is at the Earth–Moon mass ratio $\mu = 0.012155$, and families 8 and 11 are at $\mu = 0.5$. A branch is named by its family and by where the primary and the secondary are when the orbit starts on the $x$ axis. Thus 11P is family 11 at periapsis, with the initial true anomaly $\theta_0 = 0$, and 11A is family 11 at apoapsis, with $\theta_0 = \pi$.

| Mark | Value in the data |
|---|---|
| 11P folds at $e = 0.45386$ with $k_1 = 2$ | The fold is at $e = 0.4538651$, where $k_1 = 2$ to within $10^{-8}$ and $k_2 = 206.02$. |
| 11P crosses $k_1 = -2$ at $e = 0.452138$ past the fold | $k_1 = -2$ at $e = 0.4521378$, on the side of the curve past the fold. |
| 11A goes from region 6 into region 3 near $e = 0.30$ | $k_1 = -2$ at $e = 0.2946$, between the members at 0.2925 (region 6) and 0.295 (region 3). |
| 8A goes from region 4 to region 2 near $e = 0.30$ | The parabola $k_1 = k_2$ is crossed at $e = 0.2894$, between the members at 0.285 and 0.29. |
| 8A reaches region 1 at $e = 0.85$ | The parabola is crossed again at $e = 0.8470$, and the member at 0.85 is in region 1, with $a_1 = 0.7592$ and $a_2 = 2.0362$, below the parabola value 2.1441. |
| 7A stays stable as $e$ grows | All 204 members from $e = 0.005$ to 0.975 are in region 1, and the distance of $(a_1, a_2)$ to the tangency point $(-4, 6)$ is smaller at every step, from 2.37 at $e = 0$ to 0.39 at $e = 0.975$. |

I located each crossing between two members by linear interpolation in $e$ of the quantity that changes sign, and every crossing of every branch is listed in `marks.json`. Beyond the marks, 11A is in region 3 up to $e = 0.8425$, in region 7 from 0.8432, in region 5 from 0.8670, and in region 7 again from 0.8791 to its last member at 0.88. In addition, 7P is in region 6 up to $e = 0.465$ and in region 3 from 0.4678, and 8P is in region 6 up to $e = 0.675$ and in region 3 from 0.6768.

## The fold of 11P

A pseudo-arclength continuation of the class `EllipticPeriodicOrbit` of dylan-core stops where the family turns back in $e$. I ran this continuation from the circular member with steps of 0.001, and the last member recorded is at $e = 0.4538649$, just past the fold. To follow the family through the fold, I wrote a separate pseudo-arclength continuation in `compute_stability_dylan.py`. Its unknowns are $(x_0, \dot{y}_0, e)$, and its residual is $(y, \dot{x})$ at $\theta = \pi$, which is zero for a symmetric orbit of period $2\pi$. The propagations are done with the ER3BP and the RK54 integrator of PyDyLAN at a tolerance of $10^{-12}$, and the stability of each point is computed with `compute_member_stability`, as for the other members. I started the curve at the member at $e = 0.45$, which is reproduced to the last digit, and ended it at $e = 0.4505$ past the fold. I then located the fold, where the $e$ component of the tangent changes sign, and the two crossings $k_1 = \pm 2$ by bisection along the curve. The 51 points of the curve are stored in `fold-family-11-periapsis.json`. They are in region 4 before the fold, in region 6 from the fold to $e = 0.4521378$, and in region 3 past that point.

## Files

The six files `family-<family>-<branch>.json` contain one record per member, in the order of the continuation. The keys of the header are `family`, `branch`, `mu`, `theta0`, and `number_of_members`, and the keys of each record in `members` are listed below.

| Key | Meaning |
|---|---|
| `index`, `e` | The index of the member in its family, and the eccentricity $e$ of the primary and the secondary. |
| `theta0`, `period` | The initial true anomaly in rad, and the period $2\pi K$ in true anomaly, with $K = 1$. |
| `state` | The initial state $(x, y, z, \dot{x}, \dot{y}, \dot{z})$ in the rotating-pulsating frame at $\theta = \theta_0$, nondimensional, with velocities taken with respect to the true anomaly. |
| `a1`, `a2` | Broucke's stability coefficients $a_1$ and $a_2$ of the in-plane block of the monodromy matrix. |
| `k` | The indices $k_1$ and $k_2$ as `[re, im]` pairs. |
| `multipliers` | The four in-plane multipliers as `[re, im]` pairs, i.e. the multiplier $\lambda$ of $k_1$ with $\lvert\lambda\rvert \ge 1$, then $\lambda^{-1}$, then the same pair for $k_2$. |
| `region`, `region_name` | Broucke's region number (1 to 7) and its name in the enum `StabilityRegion` of DyLAN. |
| `stable` | Whether the member is in region 1, i.e. linearly stable in the plane. |
| `symplecticity_residual` | The distance of the determinant of the in-plane block from 1, as reported by DyLAN. |

The indices $k_1$ and $k_2$ are the roots of
$$
k^2 + a_1 k + a_2 - 2 = 0,
$$
and each index is the sum $k = \lambda + \lambda^{-1}$ of a pair of multipliers. I list real indices in ascending order, and a complex pair with the negative imaginary part first. On the unit circle, the multiplier with the nonnegative imaginary part comes first. I checked every record against DyLAN itself. The largest relative gap is $4 \times 10^{-5}$ between the multipliers and the eigenvalues of the in-plane block, and $3 \times 10^{-6}$ between the indices and the `stability_indices` of DyLAN.

| Region | `region_name` | Symbol of Frauenfelder and Moreno | Indices |
|---|---|---|---|
| 1 | `doubly_elliptic` | $\mathcal{E}^2$ | both real, in $(-2, 2)$ |
| 2 | `nonreal` | $\mathcal{N}$ | a complex pair |
| 3 | `negative_positive_hyperbolic` | $\mathcal{H}^{-+}$ | one below $-2$, one above 2 |
| 4 | `doubly_positive_hyperbolic` | $\mathcal{H}^{++}$ | both above 2 |
| 5 | `doubly_negative_hyperbolic` | $\mathcal{H}^{--}$ | both below $-2$ |
| 6 | `elliptic_positive_hyperbolic` | $\mathcal{EH}^{+}$ | one in $(-2, 2)$, one above 2 |
| 7 | `elliptic_negative_hyperbolic` | $\mathcal{EH}^{-}$ | one in $(-2, 2)$, one below $-2$ |

Regions 1 and 4 are separated from region 2 by the parabola on which $k_1 = k_2$, i.e.
$$
a_2 = \frac{a_1^2}{4} + 2.
$$
The member at $e = 0$ of every branch is an orbit of the autonomous CR3BP, which has a trivial pair of unit multipliers. One of its indices is therefore 2, and it lies on a boundary of the diagram, where it is classified in region 6 in DyLAN. On 8P the multipliers are as large as $10^6$ at high $e$, and the symplecticity residual is above $10^{-6}$ from $e = 0.71$, up to 2.9 at $e = 0.975$. The coefficients of these members are therefore inaccurate, but their region is not in doubt, since $k_1$ is far below $-2$ and $k_2$ far above 2.

The fields of `fold-family-11-periapsis.json` are those of the branch files, with `x0` and `ydot0` in place of the state, and with `tangent_e`, the $e$ component of the unit tangent of the curve, positive before the fold and negative past it. The fold and the two crossings are given under `marks` in its header. In `marks.json` I listed, for each branch, the runs of each region, the crossings, the extremes of $a_1$ and $a_2$, and the comparison with the TyCHO data, together with the fold and the last member of the continuation of `EllipticPeriodicOrbit`.

The members of the frames demo and the corrector demo are in `members.json`, i.e. the circular member and the fold member of 11P, and the 101 members of 7P from $e = 0$ to 0.5. Every state is given in the rotating-pulsating frame, nondimensional, at the epoch $\theta_0 = 0$, when the primary and the secondary are at periapsis, and in the units of the CSV files below.

## Agreement with the TyCHO data

The Broucke example of the TyCHO repository, `examples/broucke`, was built from CSV files computed with an older build of dylan-core. At every eccentricity reached in both continuations, the members are equal to within $1.1 \times 10^{-7}$ in the state on 7A and $3 \times 10^{-11}$ on the other branches, and the periods are identical. The members of 7P, 8P, 8A, and 11P are the same in both. On 7A and 11A, smaller steps were taken in the older build, and there are 401 and 915 members in the CSV files, against 205 and 403 here, of which 205 and 346 share their $e$.
