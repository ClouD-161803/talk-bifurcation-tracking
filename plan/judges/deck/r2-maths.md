# R2: the maths, the notation, and the numbers of the deck

The deck is ready with changes, since one number and one claim in the speaker notes are wrong, whereas every display and every number on the slides is right.

The orchestrating session is `43f4a815-2ba7-4fb6-93d4-d702ed7aaee4`.

The findings are numbered through the report and given as (severity, step), each with the exact change.

## Findings

### Slide 4

1. (note, notes Step 3) The notes say "I drew the surface at μ = 0.05, four times the Earth–Moon mass ratio". I computed 0.05/0.012155 = 4.11. Write "about four times the Earth–Moon mass ratio".

### Slide 6

2. (minor, step 1) The slide says "Timed by the true anomaly \(\theta\), the CR3BP becomes". The display on the right holds only in the pulsating coordinates of slide 7, whereas the same letters \(x, y\) were the rotating coordinates on slide 4. A viewer thus reads that only the clock was changed. Replace the paragraph with `<p class="fragment" data-fragment-index="1">In coordinates that pulsate with the primary and the secondary, and timed by the true anomaly \(\theta\), the CR3BP becomes</p>`.

### Slide 7

3. (note, HTML comment above the slide) The comment says "its controls are hidden, hence it starts at mu = 0.012155 and e = 0.3 with the family 7 orbit on". In the notes, in `demos/frames/README.md`, and in `check/dark-07.png`, the controls are shown, and the scene is loaded at μ = 0.5 and e = 0 with the orbit off. Replace the clause with "its controls are shown, and it is loaded at mu = 0.5 and e = 0 with the orbit off".

### Slide 8

4. (note, step 0) The slide says "fixed in \(x, y\)", whereas the frame is written \((x, y)\) elsewhere in the deck. Write `fixed in \((x, y)\).`

5. (minor, steps 4 and 5) The display \(\boldsymbol x(\theta_0 + 2\pi K) = \boldsymbol x(\theta_0)\) is the first use of the state \(\boldsymbol x\), which is named only on slide 10. Replace the step-4 paragraph with `<p class="fragment" data-fragment-index="4">A periodic orbit, with the state \(\boldsymbol x = (x, y, x', y')\), is closed after \(K\) turns of \(\theta\),</p>`.

### Slide 10

6. (minor, steps 2 and 3) The slide says "a Newton step \(\delta\boldsymbol X\) is", followed by \(\boldsymbol D_{\boldsymbol X}\boldsymbol F\,\delta\boldsymbol X = -\boldsymbol F\). With \(\boldsymbol X = (\boldsymbol x_0, T)\), this matrix is of one more column than rows, hence the step is not unique. In `demos/corrector/corrector.py`, I found the step computed with `np.linalg.lstsq`, i.e. the step of least norm. Replace the step-2 paragraph with `<p class="fragment" data-fragment-index="2">With the state transition matrix \(\boldsymbol\Phi = \partial\boldsymbol\phi/\partial\boldsymbol x_0\), the Newton step \(\delta\boldsymbol X\) of least norm solves</p>`.

7. (minor, step 5) On this slide \(\|\boldsymbol F_{n+1}\| \sim \|\boldsymbol F_n\|^2\) is written "at iterate \(n\)", and on slide 11 \(\boldsymbol F_i\) is the defect of segment \(i\), hence one subscript is given two meanings on adjacent slides. The claim also holds only near the solution. In `runs.json`, I read \(2.1 \times 10^{-2}\) and \(2.0 \times 10^{-2}\) at iterates 2 and 3 of the near-guess Lyapunov run. Replace the paragraph with `<p class="fragment" data-fragment-index="5">In the demo, \(\|\boldsymbol F^{(n+1)}\| \sim \|\boldsymbol F^{(n)}\|^2\) near the solution, at iterate \(n\).</p>`.

8. (note, the scene of slides 10 and 11) In the embedded scene, the iterate is labeled "iterate k" in the caption and the colorbar (`check/dark-10.png` and `check/dark-11.png`), whereas \(n\) is written on slide 10, and \(k\) is the stability index from slide 14 on. In the current `demos/corrector/build.py`, the label is already "iterate n". Re-embed the rebuilt scene with `tools/deck/embed_scene.py`.

### Slide 11

9. (minor, notes Step 2) The notes say "you see S = 1 and S = 2 fail at k = 2". Write "you see S = 1 and S = 2 fail at iterate 2". The counts of this step are right (see the table below).

10. (minor, steps 3 and 4) The display \(\boldsymbol D_{\boldsymbol X}\boldsymbol F = \boldsymbol\Phi(2\pi K, \boldsymbol x_0) - \boldsymbol I\) is shown right after the multiple-shooting display, but it is the Jacobian of a single segment, as the notes say. Replace the step-3 paragraph with `<p class="fragment" data-fragment-index="3">In the ER3BP, the period is pinned at \(2\pi K\), and with \(S = 1\),</p>`.

11. (note, slides 10, 11, and 14) The flow is written \(\boldsymbol\phi(T; \boldsymbol x_0)\) with a semicolon, and the matrices \(\boldsymbol\Phi(2\pi K, \boldsymbol x_0)\) and \(\boldsymbol\Phi(T, \boldsymbol x_0)\) with a comma. Write `\boldsymbol\Phi(2\pi K; \boldsymbol x_0)` on slide 11 and `\boldsymbol\Phi(T; \boldsymbol x_0)` on slide 14.

### Slide 12

12. (major, notes Step 4) The notes say "You see the orange pen climb in half steps and stop at e = 0.45313, just short of the fold". In the current `demos/corrector/runs.json`, the members of the run "medium step, natural" of family 11 past \(e = 0.453\) are at 0.45313, 0.45352, 0.45371, 0.45381, and 0.45386, and the run is stopped with "the step fell below the minimum". In `CHECKS.md`, the largest \(e\) of the members is given as 0.45386498. The value 0.45313 is from `STORYBOARD.md` of an earlier build. Replace the sentence with "You see the orange pen climb in half steps, then halve its step again and again near the fold, and stop at e = 0.45386, just short of the fold, with a red cross that is kept." Take the number from `runs.json` again once the demo is rebuilt.

13. (note, step 5) The display \(\det\boldsymbol D_{\boldsymbol X}\boldsymbol F = 0\) is meaningful only for the square matrix of slide 11, since on slide 10 the same symbol was given to a matrix of one more column than rows. If one symbol per matrix is wanted, write `\[\det\big(\boldsymbol\Phi(2\pi K; \boldsymbol x_0) - \boldsymbol I\big) = 0 \quad \text{at } e = 0.45387.\]`.

### Slide 13

14. (minor, steps 1, 2, and 4) The member index is \(k\) in \(\boldsymbol\tau_k\) and \(\boldsymbol Y_k\), one slide before \(k\) becomes the stability index \(k = \lambda + 1/\lambda\) with \(k_1\) and \(k_2\). Replace the subscript \(k\) by \(j\) on this slide, i.e. `\class{hl-1}{\boldsymbol\tau_j}^T(\boldsymbol Y - \boldsymbol Y_j)` in the display, `with the unit tangent \(\boldsymbol\tau_j\) at the last member \(\boldsymbol Y_j\)`, `predicted along \(\boldsymbol\tau_j\)`, `the \(e\) component of \(\boldsymbol\tau_j\)`, and "τⱼ" in the notes of Step 1.

15. (minor, step 4) The highlight `data-highlight="hl-1"` is given to the fragment of the new display \(\tau_e = 0\), hence the color change and the new display are shown in one step, and \(\tau_e\) is colored at its first appearance. Split the step as below, and split the notes of Step 4 after "is zero," so that "and its sign is flipped past the fold" opens a new Step 5 with the rest.

    ```html
    <div class="fragment" data-fragment-index="4">
      <div class="math">\[\class{hl-1}{\tau_e} = 0 \quad \text{at } e = 0.45387,\]</div>
      <p class="small">where \(\tau_e\) is the \(e\) component of \(\boldsymbol\tau_j\).</p>
    </div>
    <p class="fragment" data-fragment-index="5" data-highlight="hl-1">Past the fold, the sign of \(\tau_e\) is flipped, back toward a smaller \(e\).</p>
    ```

16. (note, step 1) In the notation registry, the transpose is written `^T`, whereas `^{\mathsf T}` is written in the display. Write `^T`, as in finding 14. The bold \(\boldsymbol G\) is allowed in the registry beside the generating function \(G\) of next week's talk.

### Slide 15

17. (minor, step 1) The where line "with \(a_1 = -(k_1 + k_2)\) and \(a_2 = 2 + k_1 k_2\)" is the first use of \(k_1\) and \(k_2\), since only the index \(k\) of one pair is defined on slide 14. Replace it with `<p class="small">with the indices \(k_1\) and \(k_2\) of the two pairs, \(a_1 = -(k_1 + k_2)\) and \(a_2 = 2 + k_1 k_2\).</p>`.

### Slide 16

18. (minor, step 0) The slide says "At fixed \(T\) the Jacobian is \(\boldsymbol M - \boldsymbol I\), and". In the ER3BP the period is \(2\pi K\), as on slide 11, and \(4\pi K\) is used in the display of step 5. Replace the paragraph with `<p>With the period pinned at \(2\pi K\), the Jacobian is \(\boldsymbol M - \boldsymbol I\), and</p>`.

19. (note, notes Step 2) The slide says that the Jacobian is singular at \(k_1 = 2\), at a fold or a branch point. Every family is on \(k = 2\) at \(e = 0\) (slide 15), and a student may ask whether \(e = 0\) is a bifurcation. Append to the notes of Step 2: "Every family starts on this line at e = 0, where the circular orbit can be started at any phase. The periapsis and the apoapsis branches leave it there, hence e = 0 is a branch point too."

20. (note, steps 2 and 3 of slide 16, and steps 2 and 4 of slide 17) The colored symbols \(k_1 = 2\), \(k_1 = -2\), and \(k = -2\) are shown in color together with new text, rather than colored after they were shown. With the color, each symbol is linked to its line in the plot, hence I do not propose a change.

### Slide 17

21. (minor, step 4) The display says \(k = -2\) at \(e = 0.29464\), whereas \(k_1 = 2\) and \(k_1 = -2\) are written for the periapsis branch on the same slide, and this crossing is recorded in `data/stability/marks.json` as `k1 = -2`. Write `\[\class{kminus}{k_1 = -2} \quad \text{at } e = 0.29464,\]`.

22. (note, step 2) In the where line, \(e = 0.452138\) is given to six decimals, beside 0.45387 to five. Write `<p class="small">and \(k_1 = -2\) at \(e = 0.45214\), past the fold.</p>`, and 0.45214 in the notes of slides 15, 16, and 17.

### Slide 19

23. (major, notes Step 1) The notes say "With pseudo-arclength continuation, I follow the family around it in DyLAN." According to `data/stability/README.md`, the pseudo-arclength continuation of the class `EllipticPeriodicOrbit` of dylan-core stops at the fold, and its result is recorded in `marks.json` as `Fail`, with the largest \(e\) at 0.4538649. The curve through the fold was computed with a separate pseudo-arclength loop in `compute_stability_dylan.py`, on DyLAN's propagator and stability call. On slide 21, the PyDyLAN calls with `ContinuationMethod.pseudo_arc_length` are introduced as "the PyDyLAN calls that continue family 11", hence a listener would infer that the class passes the fold. Replace the sentence with "With a pseudo-arclength loop of my own, on DyLAN's propagator, I follow the family around the fold. The continuation built into DyLAN still stops at the fold, at e = 0.4538649."

### Slide 20

24. (minor, notes Step 0) The notes say "In DyLAN, a₁ goes from −4919 to −252 up to e = 0.453." In `marks.json`, \(a_1 = -252.5075\) at \(e = 0.453\), which rounds to −253, and −252.5 is written on slide 25. Write "In DyLAN, a₁ goes from −4918.9 to −252.5 up to e = 0.453."

25. (note, notes Steps 3 and 6) According to `figures/README.md`, the 8P figures are drawn up to \(e = 0.30\) and the 11A figures up to 0.80. The crossing at 0.677 and the regions past 0.84 are thus beyond the members drawn, but the notes say so only for 7P. Write in Step 3 "One index reaches −2 at e = 0.677, past the members drawn here, which end at e = 0.30." Write in Step 6 "and two more crossings follow past e = 0.84, beyond the members drawn here, which end at e = 0.80."

### Slide 24

26. (minor, step 0) The slide says "Each of the 144 orbit panels in Broucke's Figs. 13 to 20 is consistent with a DyLAN member." By the table and its footnote, 20 panels are partial, i.e. only the trend toward a member was compared for them. Replace the paragraph with `<p>Of the 144 orbit panels in Broucke&rsquo;s Figs. 13 to 20, 124 agree with the DyLAN member of closest \(e\), and the other 20 agree in trend.</p>`.

### Slide 25

27. (note, row 7P) The cell says "within 0.017 of the line up to \(e = 0.35\)". From `family-7-periapsis.json`, I computed the largest gap in \(a_2\) to the line \(a_2 = -2a_1 - 2\) as 0.01719, at \(e = 0.35\), slightly above 0.017. Write "within 0.018 in \(a_2\) of the line up to \(e = 0.35\)" in `data/check-144.md`, from which the table is built, and rebuild the section.

## Numbers and derivations I checked and found right

| On the deck | My value | Source |
|---|---|---|
| \(C(\mathcal{L}_1) = 3.420\) and \(C(\mathcal{L}_2) = 3.354\) at \(\mu = 0.05\), cut at 3.39 | 3.42042 and 3.35439 | bisection on \(\partial_x\tilde{U} = 0\) |
| Fold of 11P at \(e = 0.45387\), and \(k_1 = -2\) at 0.452138 (11P) and 0.29464 (11A) | 0.4538651, 0.4521378, and 0.2946355 | `fold-family-11-periapsis.json` and `marks.json` |
| \(k_2 = 4916.9\) and \(a_1 = -4918.9\) at \(e = 0\) | 4916.934 and −4918.934 | member 0 of `family-11-periapsis.json` |
| Every crossing, extremum, and region boundary of slides 20 and 25 except findings 24 and 27 | the same to the digits shown | `marks.json` |
| Iterate counts of slides 10 and 11, and the members and steps of slides 12 and 13 | the same | `runs.json` |
| Slide 21 member at \(e = 0.0497\), region 4, and its seed | 0.04969, −4491.27, and 11565.08 | `data/README.md` |
| Broucke's quote, p. 1009, "10 iterations" at 0.453 | the same | `broucke-1969-stability.pdf` |
| Bridge ends within \(10^{-7}\) of Broucke's tables | largest gap \(6.6 \times 10^{-8}\) | `data/bridge/bridge.npz` |
| Row and column sums of slide 24, and the Frauenfelder and Moreno reference | the same | my sums, and Crossref |

I derived by hand the CR3BP equations and Hill's region, Szebehely's form of the ER3BP with \(\rho^3\dot\theta^2 = 1 + e\cos\theta\), the rate \(E'\), the Jacobian of slide 10, the predictor and corrector of slide 13, the pairs \(\lambda\) and \(1/\lambda\), the quartic with its three boundaries, and \(\det(\boldsymbol M - \boldsymbol I) = (2 - k_1)(2 - k_2)\). Each of them holds. On the PDF pages of the last steps, I did not find a display cut at the edge, a symbol too small to read, or a raw macro.

## What I could not check

1. The perilune of the transfer, since the deck does not have a transfer slide.
2. What the embedded scenes show at each step past step 0, e.g. the 12 s loop, the rings, and whether the arc of iterate 2 hits the Moon or the Earth, since only "the primary or the secondary" is written in `runs.json`.
3. The labels of Broucke's AIAA Fig. 4 up to −60000, since I did not open the figure.
4. The verdicts of the 144 panels and the statements of Broucke's JPL report, of which I checked only the sums and the DyLAN side.
5. The output of the code on slide 21, which I did not rerun.
6. The light theme.
