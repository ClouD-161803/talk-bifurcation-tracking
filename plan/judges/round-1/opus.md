# Judge report, round 1: the correction and continuation scenes (Opus)

Orchestrating session: 43f4a815-2ba7-4fb6-93d4-d702ed7aaee4.

The two scenes are ready with changes, since every number that I rechecked is right, but the fold payoff rests on an unequal step budget, the nodes of multiple shooting do not visibly move, and ideas are shown on slides 10 to 13 before they are introduced.

I screenshotted every shot in headless Chrome and reran `build.py` with scripts in `/private/tmp/claude-501/judge-opus/`. The iterate counts, norms, failure counts, eccentricities, and multipliers of the storyboard agree with my reruns. The standard caps a report at twelve findings, and I give twelve, from the most severe.

## Findings

### 1. The blue pen is played on slide 12, before it is introduced (major)

Slide 12 is about natural-parameter continuation alone, and in its notes the speaker lets only the orange pen run. In the scene both pens are drawn from the first frame, hence the audience watches the blue pen pass the fold one slide before its method is defined. The storyboard gives slides 8 to 10, not 10 to 13. I propose a choice "pens", set to "natural parameter" by default and to "both" on slide 13.

### 2. The blue pen passes the fold only with a larger halving budget (major)

The speaker says that a natural step cannot pass the fold "however short". In `run_family`, the natural pen is stopped below 1/64 of its full step, and the arclength pen only below $10^{-5}$ in the norm of the weight $\boldsymbol{W}$, a floor 300 to 1200 times lower. In my rerun of family 11, the blue pen takes steps down to $2^{-10}$, $2^{-12}$, and $2^{-13}$ of its full step at the fold, for the small, medium, and large step. Under the orange floor it would be stopped there too. I propose one floor for both pens, and the line "Both pens may halve their step as often as they like, and only the blue one gets past the fold."

### 3. The turn at the fold is drawn inside one pixel, 14 s before the orange pen stops (major)

At speed 0.25 on family 11 with the medium step, the caption shows that the blue pen is at the fold from about 6 s to 15 s, while the orange pen is between $e = 0.10$ and 0.30. The orange pen is stopped only at about 29 s. In the norm of $\boldsymbol{W}$ the tangent turns within an arclength of 0.0007, against a blue step of 0.39, hence shot 3 needs a zoom of about 500 times. I propose a close-up view fitted to $0.4525 \le e \le 0.4541$, and a schedule that holds the blue pen at $e = 0.4507$ until the orange pen reaches 0.45.

### 4. The nodes of shot 3 do not visibly slide (major)

With $S = 8$ segments and the near guess, the speaker says "The nodes slide" over a still picture. I measured the largest move of a node as 0.2 px with the near guess and 2 px with the far one. From a guess offset by $\delta = 0.05$, against 0.001 for the near guess, the full period of the Lyapunov orbit converges in six iterates with $S = 16$, and the nodes slide by about 11 px. I propose this guess for shot 3.

### 5. Each defect is seen for about 0.2 s, and both pages open at speed 1 (major)

One iterate lasts 0.67 s at speed 1, and each defect is drawn for about 0.2 s of it. At speed 0.25 an early blue attempt on family 11 lasts about 0.6 s. The speed is not stored with the scene, hence each page opens at speed 1. I propose that iterate 0 spans three units of the clock, and speeds of 0.5 for scene 1 and 0.25 for scene 2, written in the Control column.

### 6. Slide 10 already shows the race of slide 11 (major)

On the slide about single shooting, the gray curves of $S = 2$ to 16 finish ahead of the curve of $S = 1$. Three colorbars are drawn as well, one of them for $1/(1 + e\cos\theta)$, which equals 1 in the CR3BP. The eye is thus led to the curves that win, while the payoff is on the slowest one. I propose a toggle "other segment counts", off until shot 3, and a flat color for the arcs in the CR3BP.

### 7. Slide 11 holds more than its two minutes (major)

Shots 3 to 7 take about 17 clicks and at least ten loops of 8 s, and in the notes of slide 11 the speaker mentions only shots 3 and 4. In shot 6, $S = 2$ converges where $S = 4$ fails, against the line "more segments converge where fewer fail". I propose to keep shots 3 and 4 and family 11 over the full period with $S = 1$ against $S = 8$, and shots 5 and 7 for questions.

### 8. Four spoken lines do not match the screen (major)

- In the notes of slide 13, "a large step can jump past the fold" is false, since an orbit does not exist beyond $e = 0.45386$. Say "I switch to the small and the large step. At every size only the blue pen passes the fold."
- In shot 4, "the Jacobian becomes Φ(2πK) − I" is said over $S = 8$. Say "With one segment the Jacobian would be Φ(2πK) − I, and with eight it holds one Φ per segment."
- In shots 1 and 7, "the curve below" is drawn on the right. Say "the curve on the right".
- In shot 1, "The red gap is F" is said over a miss after half a period, while slide 10 defines $\boldsymbol{F}$ over the full period. Say "After half a period the arc should cross the x-axis at a right angle, and the red mark shows the miss."

### 9. The iterate, the segment, and the member share letters (minor)

The Newton iterate is $k$ on screen but $n$ on slide 10, where $n$ is not defined, and on slide 11 the subscript of $\boldsymbol{F}_i$ counts segments. The letter $k$ also counts members on slide 13, and the τ of the clock label "iterate k + τ" is not the tangent. On the slides, $\delta\boldsymbol{X}$, $\Delta t_i$, and $\tau_e$ are not defined, and the weight $\boldsymbol{W}$ of the storyboard is missing. Otherwise the storyboard matches the deck. I propose $\boldsymbol{F}^{(n)}$ and "iterate n" for the iterate, and $\tau_e$ defined as "the $e$ component of the tangent".

### 10. The speaker's words differ from the screen and the deck (minor)

Every sentence of the lines has at most 40 words. The lines are written with "we", while the notes of the deck use "I". "Defect", "line search", and "fold" are said without a definition, and the ghosts are explained only in shot 7. In shot 5, more segments only shorten the arc over which an error grows, and do not cure the instability. On screen the Moon is labeled "secondary" and the orange pen "natural parameter". I propose "I" throughout, the labels "Earth" and "Moon", and for shot 5 "With a line search I take a fraction α of the Newton step, halved until the error falls."

### 11. A page can open in the state of the last rehearsal (minor)

The viewer state is stored in the browser per scene, hence a rehearsal that ends on family 11 reopens there on slide 10. On the family 11 tab the caption first reads "natural pen at −2.1880e−28". I propose a reset with the circular arrow before the talk, $e$ rounded to 0 at the seed in `build.py`, and the key F, which undoes a zoom, in the Control column of shot 3.

### 12. Labels on screen are missing or misleading (minor)

The axis titles "iterate" and "log₁₀ ‖F‖" are not drawn in the convergence panel. In the diagram the chip is labeled "natural parameter" although both pens are drawn. A failed propagation is plotted at $\log_{10}\|\boldsymbol{F}\| = 1.5$, which reads as a value. I propose the axis titles, the chip "two pens", and the red cross at the last finite value.

## Merged or dropped under the cap

I merged the race of shot 6 into finding 7, and dropped the orbit of period 5.17 drawn as a success, the colormap ends that match pen colors, a truncated colorbar label, and the reversed "p plotted against $x_0$".

## What I could not check

- The scenes inside the deck, whose zones are still placeholders.
- The contrast on a projector, the smoothness of playback, and the wheel zoom by hand.
- The comparison with DyLAN, which I took from `CHECKS.md`.
- The guess with $\delta = 0.05$ on the page and in the ER3BP.
- The screenshots in `demos/corrector/shots/`, not yet written while I worked.
