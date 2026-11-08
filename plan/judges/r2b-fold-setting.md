# R2b: whether DyLAN's continuation passes the fold of family 11

Under every setting I tried with a step of at most $3 \times 10^{-3}$ in $e$, the pseudo-arclength continuation of `EllipticPeriodicOrbit` is carried across the fold of family 11 at periapsis. One member past the fold is recorded, and the continuation is then stopped on purpose, by a test that Claudio wrote for this case. From this member, I continued the family on the far side of the fold with a second call of `solve_for_orbit()` toward a smaller $e$, down to $e = 0.45$ and to $e = 0.40$. Hence the fold is passed under one setting of the class, i.e. two solves, the first toward a target above the fold and the second toward a target below the member where the first one stopped. In the notes of slide 19, the built-in continuation is said to stop just short of the fold, which is wrong, and I wrote their replacement in `plan/patches/r2b.patch`.

I ran every case on dylan-core of `vestini/master`, with the build in `build_with_spice/` of the worktree set `/Users/claudiovestini/git/dylan/worktrees/vestini-master/`, which D1 used, and I did not change or build DyLAN. The family is at $\mu = 0.5$, from the circular seed of `broucke_1969_support.py`, with the initial true anomaly $\theta_0 = 0$ and the period $2\pi$. Unless a row of the tables says otherwise, the corrector is set as in D1's run, with $x_0$ and $\dot{y}_0$ free, 6 segments, a corrector tolerance of $10^{-10}$, and an integration tolerance of $10^{-12}$.

## The settings of the continuation

The continuation is `pseudo_arc_length_continuation()` in `math/continuation.cpp` of dylan-core, and it is called from `NonAutonomousPeriodicOrbit::solve_for_orbit()`. From Python, five groups of settings can be reached.

1. The method is pseudo-arclength, the default, or natural parameter.
2. The target $e$, the step in $e$ of the first step, and its floor are set in the continuation information. The arclength of the first step is chosen so that this step advances $e$ by the step size, and the floor of the arclength is scaled by the same ratio.
3. The iteration limit and the limit on consecutive failed steps are the two integers of `set_continuation_information()`.
4. The corrector is set by its number of segments, its iteration limit, its step magnitude, and its tolerance, which is also the convergence test of each arclength step.
5. The integration tolerance is set on the orbit.

The rest of the method is fixed in the class `Continuation`. The unknowns are $x_0$, $\dot{y}_0$, the interior nodes, and $e$, and the arclength is measured with unit weights on $(x_0, \dot{y}_0, e)$ and zero weight on the interior nodes. The column of the Jacobian in $e$ is taken by a one-sided finite difference of second order, with a step of $10^{-7}$. Each step is corrected by Newton's method on the bordered system in at most 12 iterations. After an easy step the arclength is grown by a factor of 1.5, up to that of the first step, and a failed step is retried at half the arclength. In addition, every converged step that lies farther from its prediction than 0.2 times the predicted change is rejected in `solve_for_orbit()`. The parameter type that continues in arclength alone is refused by `set_continuation_information()`, where only the eccentricity and the mass ratio are accepted, as I checked by a call.

## The runs

I told the side of the fold from the sign of the fold function, i.e. the determinant of the 2 × 2 Jacobian of the half-period residual $(y, \dot{x})$ at $\theta = \pi$ in $(x_0, \dot{y}_0)$, propagated with RK54 at $10^{-12}$. It is negative on every member before the fold and positive past it, and the fold is at $e = 0.45386506$, from `fold-family-11-periapsis.json`. In every run but the first two, I first ran a natural-parameter solve to $e = 0.45$ in steps of 0.005, and each row describes the second solve, from this member to the target 0.46. In the table, $e_{\max}$ is the largest $e$ recorded and $e_{\text{last}}$ the $e$ of the last member.

| Setting of the solve that meets the fold | $e_{\max}$ | $e_{\text{last}}$ | Last member | Stop |
|---|---|---|---|---|
| D1's run, from $e = 0$, step $10^{-3}$, floor $10^{-7}$, 8 failures | 0.453864947 | 0.453864947 | past | fold test |
| class default from $e = 0$, step 0.0184, floor $10^{-6}$, 5 failures | 0.453424113 | 0.453424113 | before | 5 failures |
| the same with 20 failures | 0.453862416 | 0.453862416 | past | fold test |
| step $10^{-2}$, 8 failures | 0.453342841 | 0.453342841 | before | 8 failures |
| step $10^{-2}$, 20 failures | 0.453864966 | 0.453864966 | past | fold test |
| step $3 \times 10^{-3}$ | 0.453864674 | 0.453864674 | past | fold test |
| step $10^{-3}$, 8 or 20 failures | 0.453865059 | 0.453850485 | past | fold test |
| step $3 \times 10^{-4}$ | 0.453864997 | 0.453856465 | past | fold test |
| step $10^{-4}$, target 0.46, 0.4539, or 0.9 | 0.453864794 | 0.453855828 | past | fold test |
| step $10^{-5}$, floor $10^{-9}$ | 0.453865056 | 0.453865056 | past | fold test |
| step $10^{-4}$, 1, 2, or 12 segments | 0.453864794 | 0.453855828 | past | fold test |
| step $10^{-4}$, corrector tolerance $10^{-8}$ or $10^{-12}$ | 0.453864796 | 0.453855823 | past | fold test |
| natural parameter, step $10^{-3}$, floor $10^{-7}$ | 0.453864746 | 0.453864746 | before | 8 failures |
| natural parameter, step $10^{-4}$, floor $10^{-9}$, 20 failures | 0.453865059 | 0.453865059 | before | 20 failures |

The last member of D1's run, at $e = 0.4538649$, is therefore past the fold, as stated in `data/stability/README.md`, although its $e$ is below that of the fold. In the ledger, this value was read as a stop just short of the fold, i.e. the lower $e$ was taken for the near side.

## Why each solve stops where it stops

With the pseudo-arclength method, a step does not fail at the fold. In the bordered system, $e$ is added to the unknowns and the arclength condition to the equations, hence its Jacobian is not singular at the fold. The step across the fold is thus corrected in as few iterations as its neighbors. After each accepted step, the $e$ component of the new tangent is compared with the direction toward the target. Once the two have opposite signs, the largest $e$ reached is logged as the fold (0.453865), the continuation is stopped and left unconverged, and `solve_for_orbit()` returns Fail. Claudio wrote this test under DYLAN-532, the rewrite of the pseudo-arclength continuation, and in the Doxygen comment of the function the stop is described as the intended behavior for a family that folds short of its target.

With a step of 0.01 from $e = 0.45$, or the class default of 0.0184 from $e = 0$, the steps near the fold failed, and the solve was ended at the limit on consecutive failures (8 and 5) before the fold. With a limit of 20, both settings passed the fold by one member and stopped at the fold test. I did not tell failures of the corrector from rejections by the prediction check, since a warning alone is logged for each.

With the natural-parameter method, a member does not exist at a fixed $e$ beyond the fold, and at the fold the 2 × 2 Jacobian of the corrector in $(x_0, \dot{y}_0)$ is singular. On the last member of the natural run with step $10^{-4}$, the fold function is $-0.016$. Each step past the fold fails, the step is halved down to its floor, and the solve is ended at the limit on failures, $1.3 \times 10^{-9}$ in $e$ short of the fold. A Jacobian that is singular at the fold, because the continuation is parametrized in $e$ alone, is thus the reason for the stop of the natural-parameter method, not of the pseudo-arclength one.

## The setting that passes the fold

After a failed solve, the orbit is left on the last accepted member, with the model at its $e$, since the last state of the corrector is packed as the orbit at the end of `solve_for_orbit()`. A later solve is started from this member. With `target_eccentricity` set below its $e$, the first tangent is oriented toward a smaller $e$, which at a member past the fold is the direction away from the fold, along the far side. The setting thus starts with a solve with `target_eccentricity` at 0.46 and the pseudo-arclength method (step $10^{-4}$, floor $10^{-7}$, 8 failures), which returns Fail one member past the fold. It ends with a second solve with `target_eccentricity` at 0.45 and the same continuation information, which returns Success.

I ran five variants of the second solve, and each one was carried to its target on the far side. With the pseudo-arclength method, I ran step $10^{-4}$ to 0.45 (12 members), step $10^{-3}$ to 0.40 (12 members), and step $10^{-3}$ from the stop of D1's run to 0.45 (4 members). The other two variants are the class default to 0.45 (8 members) and natural parameter with step $10^{-4}$ to 0.45 (54 members). On every member of these solves, the fold function is positive and the half-period residual is below $3 \times 10^{-13}$.

The members of the first variant are listed below. The gap is the largest difference in $x_0$ and $\dot{y}_0$ from the curve of D1's loop in `fold-family-11-periapsis.json`, interpolated linearly at the same $e$. Its fall from $3 \times 10^{-5}$ at the fold to $1.5 \times 10^{-7}$ is consistent with the error of a linear interpolation between points $1.3 \times 10^{-4}$ apart in $e$, on a curve that bends most at the fold. The near side, at the same $e$, is about $4 \times 10^{-3}$ away in $\dot{y}_0$. I computed the indices $k_1$ and $k_2$ and the region with `compute_member_stability()`, as D1 did.

| $e$ | $x_0$ | $\dot{y}_0$ | Fold function | Gap to D1's curve | $k_1$ | $k_2$ | Region |
|---|---|---|---|---|---|---|---|
| 0.4538558 | −0.173460667 | 1.140929126 | +1.38 | $3.0 \times 10^{-5}$ | 1.7615 | 202.38 | 6 |
| 0.4536346 | −0.173381055 | 1.140205286 | +7.03 | $2.6 \times 10^{-6}$ | 0.7104 | 189.51 | 6 |
| 0.4533237 | −0.173267269 | 1.139531833 | +10.95 | $1.1 \times 10^{-6}$ | −0.0705 | 182.62 | 6 |
| 0.4529771 | −0.173140596 | 1.138879049 | +14.21 | $6.2 \times 10^{-7}$ | −0.7403 | 178.14 | 6 |
| 0.4526095 | −0.173006762 | 1.138239480 | +17.09 | $4.2 \times 10^{-7}$ | −1.3385 | 175.13 | 6 |
| 0.4522273 | −0.172868273 | 1.137609561 | +19.73 | $3.1 \times 10^{-7}$ | −1.8818 | 173.16 | 6 |
| 0.4518341 | −0.172726482 | 1.136987233 | +22.19 | $2.5 \times 10^{-7}$ | −2.3791 | 171.99 | 3 |
| 0.4514320 | −0.172582214 | 1.136371172 | +24.52 | $2.1 \times 10^{-7}$ | −2.8354 | 171.46 | 3 |
| 0.4510226 | −0.172436017 | 1.135760465 | +26.75 | $1.7 \times 10^{-7}$ | −3.2541 | 171.49 | 3 |
| 0.4506067 | −0.172288273 | 1.135154450 | +28.89 | $1.5 \times 10^{-7}$ | −3.6377 | 172.00 | 3 |
| 0.4501853 | −0.172139264 | 1.134552626 | +30.96 | beyond the curve | −3.9883 | 172.94 | 3 |
| 0.4500000 | −0.172073969 | 1.134291498 | +31.84 | beyond the curve | −4.1311 | 173.48 | 3 |

Thus $k_1$ crosses $-2$ between $e = 0.45223$ and $0.45183$, at 0.45213 by linear interpolation against 0.4521378 by bisection in D1's loop, and the members go from region 6 into region 3 there, as on slides 13 and 19. On the variant to $e = 0.40$, $k_1$ falls to $-6.16$ near $e = 0.44$ and is back above $-2$ between $e = 0.4143$ and $0.4086$, in region 6 again.

## What changes in the deck

I wrote the replacement of step 1 of the notes of slide 19 into `plan/patches/r2b.patch`, from the copies `index.r2b.base.html` and `index.r2b.html`, by `plan/briefs/DECK-COPY.md`. In the patch, one line is changed, i.e. the last two sentences of step 1, and I read the new notes of slide 19 back through reveal.js in Chrome with `scripts/chrome.mjs`. I kept the sentence on the curve from Claudio's own loop, since this loop is given as the source of the curve in `data/stability/README.md`. The new end of step 1 reads as follows.

> With the continuation built into DyLAN I pass the fold too, but I wrote it to stop one member past the fold, since the family turns back there from the target e. With a second solve from that member toward a smaller e, I follow the other side.

The note of slide 12, "On family 11 in e, I cannot pass the fold with this method", is about the natural-parameter method and remains correct. I left `data/` unchanged. In its README, the separate loop is said to have been written to follow the family through the fold. This sentence is still true of the provenance of the curve, but I also followed the family through the fold with the class alone, called twice.

## What I could not check

In the runs with large steps, I did not tell the steps rejected by the corrector from those rejected by the prediction check, and I followed the far side only down to $e = 0.40$. The scripts, the logs, and the JSON of each run are in the temporary folder `/private/tmp/claude-501/r2b/`. There, `run_class_dylan.py` is the script of one run, `settings.tsv` and `settings2.tsv` are the lists of settings, and `analyze_dylan.py` is the script of the tables above.
