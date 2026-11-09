# Checks of the corrector against DyLAN

I checked every converged orbit of the two scenes against DyLAN, on `vestini/master` of dylan-core. Every state agrees with DyLAN to better than $10^{-10}$, and most states agree to $10^{-11}$. I printed the numbers below with `check_dylan.py`, which reads `runs.json` and runs in about 30 s, and I copied them from its output.

A state here is the initial state $(x_0, \dot{y}_0)$ of a symmetric orbit, which leaves the $x$-axis at a right angle at the initial true anomaly $\theta_0$. Every state is nondimensional, in the rotating-pulsating frame, with the velocity taken with respect to the true anomaly. Lyapunov orbits are computed at the Earth–Moon mass ratio $\mu = 0.012155$, and family 11 at $\mu = 0.5$. In DyLAN I propagated every orbit with the ER3BP and the RK54 integrator at a tolerance of $10^{-12}$, the same tolerance as in `corrector.py`. A gap is the largest absolute difference between two states, taken component by component. In `corrector.py` a correction is stopped once $\|\boldsymbol{F}\|$ is below $10^{-11}$.

## The references

The references are the six orbits of period $2\pi$ from which the first guesses of scene 1 are built. I solved the Lyapunov reference in the CR3BP again with the class `Lyapunov` of DyLAN, seeded with the reference, with $x_0$ held and at its Jacobi constant $C$. With `EllipticPeriodicOrbit` I continued each circular reference in steps of 0.005 in $e$ up to $e = 0.3$, with a corrector tolerance of $10^{-12}$, and compared the result with the reference at $e = 0.3$. The epoch is periapsis, with $\theta_0 = 0$, or apoapsis, with $\theta_0 = \pi$. The reference of family 11 in the CR3BP is compared with the Broucke page in the last section.

| Case | System | Class of DyLAN | Gap in $x_0$ | Gap in $\dot{y}_0$ | Gap in the period |
|---|---|---|---|---|---|
| Lyapunov | CR3BP | `Lyapunov` | held | $5.8 \times 10^{-13}$ | $1.2 \times 10^{-11}$ |
| Lyapunov | $e = 0.3$, periapsis | `EllipticPeriodicOrbit` | $1.2 \times 10^{-13}$ | $3.4 \times 10^{-13}$ | pinned at $2\pi$ |
| Lyapunov | $e = 0.3$, apoapsis | `EllipticPeriodicOrbit` | $1.2 \times 10^{-13}$ | $3.1 \times 10^{-13}$ | pinned at $2\pi$ |
| family 11 | $e = 0.3$, periapsis | `EllipticPeriodicOrbit` | $6.4 \times 10^{-13}$ | $3.1 \times 10^{-12}$ | pinned at $2\pi$ |
| family 11 | $e = 0.3$, apoapsis | `EllipticPeriodicOrbit` | $3.5 \times 10^{-14}$ | $9.6 \times 10^{-13}$ | pinned at $2\pi$ |

## Scene 1, the corrections

Of the 72 runs of scene 1, 35 converge, and every one of them lands on the reference of its case and system. The gap of each group to its reference is listed below, for the whole first node $(x, y, \dot{x}, \dot{y})$. The gaps of full-period targeting are larger, since the monodromy matrix is unstable, and a residual of $10^{-11}$ is thus amplified in the state.

| Case | System | Targeting | Converged runs | Largest gap |
|---|---|---|---|---|
| Lyapunov | CR3BP | half period | 5 | $2.6 \times 10^{-14}$ |
| Lyapunov | CR3BP | full period | 3 | $5.8 \times 10^{-13}$ |
| Lyapunov | periapsis | half period | 5 | $7.4 \times 10^{-13}$ |
| Lyapunov | periapsis | full period | 2 | $5.1 \times 10^{-11}$ |
| Lyapunov | apoapsis | half period | 4 | $3.6 \times 10^{-13}$ |
| Lyapunov | apoapsis | full period | 1 | $5.8 \times 10^{-11}$ |
| family 11 | CR3BP | half period | 4 | $4.7 \times 10^{-13}$ |
| family 11 | CR3BP | full period | 1 | $4.1 \times 10^{-12}$ |
| family 11 | periapsis | half period | 3 | $6.9 \times 10^{-13}$ |
| family 11 | periapsis | full period | 1 | $3.4 \times 10^{-11}$ |
| family 11 | apoapsis | half period | 4 | $1.3 \times 10^{-12}$ |
| family 11 | apoapsis | full period | 2 | $2.7 \times 10^{-11}$ |

## Scene 2, the members

I solved each Lyapunov member again with the class `Lyapunov`, seeded with the member, with $x_0$ held and at the $C$ of the member. The run of 154 members is the fine continuation drawn as the gray family curve.

| Run | Members | Gap in $\dot{y}_0$ | Gap in the period | Gap in $C$ |
|---|---|---|---|---|
| small step, natural | 25 | $8.5 \times 10^{-13}$ | $1.2 \times 10^{-11}$ | $8.9 \times 10^{-13}$ |
| small step, arclength | 35 | $8.3 \times 10^{-13}$ | $1.2 \times 10^{-11}$ | $8.8 \times 10^{-13}$ |
| medium step, natural | 13 | $9.5 \times 10^{-13}$ | $2.1 \times 10^{-11}$ | $1.2 \times 10^{-12}$ |
| medium step, arclength | 15 | $8.8 \times 10^{-13}$ | $1.2 \times 10^{-11}$ | $8.8 \times 10^{-13}$ |
| large step, natural | 11 | $9.5 \times 10^{-13}$ | $2.1 \times 10^{-11}$ | $1.2 \times 10^{-12}$ |
| large step, arclength | 11 | $8.9 \times 10^{-13}$ | $1.2 \times 10^{-11}$ | $8.9 \times 10^{-13}$ |
| family curve | 154 | $1.7 \times 10^{-12}$ | $4.2 \times 10^{-11}$ | $1.7 \times 10^{-12}$ |

I propagated each member of family 11 in DyLAN for half a period, and the residual is $(y, \dot{x})$ at $\theta = \pi$. The distance is the largest component of the minimum-norm Newton step in $(x_0, \dot{y}_0, e)$ to the curve of the orbits in DyLAN, whose $e$ column I computed by central differences. This step is well defined at the fold, where a step at fixed $e$ is not. For the close-up of scene 2, I replaced the members of the gray family curve around the fold with a second run at a step of $10^{-4}$, hence the curve is made of 414 members.

| Run | Members | Residual | Distance |
|---|---|---|---|
| small step, natural | 33 | $2.3 \times 10^{-11}$ | $4.9 \times 10^{-12}$ |
| small step, arclength | 42 | $2.4 \times 10^{-11}$ | $4.3 \times 10^{-12}$ |
| medium step, natural | 30 | $2.3 \times 10^{-11}$ | $4.9 \times 10^{-12}$ |
| medium step, arclength | 28 | $3.3 \times 10^{-11}$ | $8.5 \times 10^{-12}$ |
| large step, natural | 27 | $2.3 \times 10^{-11}$ | $4.9 \times 10^{-12}$ |
| large step, arclength | 23 | $2.6 \times 10^{-11}$ | $4.4 \times 10^{-12}$ |
| family curve | 414 | $3.0 \times 10^{-11}$ | $5.1 \times 10^{-12}$ |

## Family 11 against the Broucke page

The CSV files of the Broucke page are `examples/broucke/data/family_11_periapsis.csv` and `family_11_apoapsis.csv` in the TyCHO checkout, with one member at every step of 0.005 in $e$. I compared every state of family 11 at a tabulated $e$ with the row at the same $e$.

| States | Number | Largest gap in $(x_0, \dot{y}_0)$ |
|---|---|---|
| the reference in the CR3BP, $e = 0$ | 1 | $1.9 \times 10^{-12}$ |
| the reference at periapsis, $e = 0.3$ | 1 | $3.1 \times 10^{-12}$ |
| the reference at apoapsis, $e = 0.3$ | 1 | $9.3 \times 10^{-13}$ |
| the members of scene 2 at a tabulated $e$ | 59 | $3.2 \times 10^{-12}$ |
| the members recorded by `EllipticPeriodicOrbit` at periapsis, from $e = 0$ to 0.3 | 61 | $2.4 \times 10^{-14}$ |

The largest $e$ among the members of family 11 is 0.45386491, and the fold is at $e = 0.45386506$ in `data/stability/fold-family-11-periapsis.json` of the talk.

## Running the check

Build the pages first, so that `runs.json` is written, and then run the check with the Python of DyLAN and the bindings of `vestini/master`.

```sh
PYTHONPATH=/Users/claudiovestini/git/dylan/worktrees/vestini-master/ac/build_with_spice/python_binding:/Users/claudiovestini/git/dylan/worktrees/vestini-master/dc/build_with_spice/python_binding:/Users/claudiovestini/git/dylan/worktrees/vestini-master/d/build_with_spice/python_binding /Users/claudiovestini/git/dylan/.venv/bin/python /Users/claudiovestini/git/talks/bifurcation-tracking/demos/corrector/check_dylan.py
```
